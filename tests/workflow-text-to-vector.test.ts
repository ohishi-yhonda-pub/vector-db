/**
 * Tests for TextToVectorWorkflow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TextToVectorWorkflow } from '../src/workflows/text-to-vector'
import * as vectorUtils from '../src/lib/vector-utils'

// Mock the vector-utils module
vi.mock('../src/lib/vector-utils', () => ({
  generateVectorId: vi.fn(() => 'vec_123_abc'),
  generateEmbeddingFromText: vi.fn(() => Promise.resolve([0.1, 0.2, 0.3])),
  storeInVectorize: vi.fn(() => Promise.resolve()),
  storeVectorMetadata: vi.fn(() => Promise.resolve())
}))

// Mock the db module
vi.mock('../src/db', () => ({
  createDbClient: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve())
    }))
  })),
  workflows: 'workflows'
}))

describe('TextToVectorWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should process text to vector with custom ID', async () => {
    const mockEnv = {
      AI: {},
      VECTORIZE_INDEX: {},
      DB: {}
    } as any

    // WorkflowEntrypoint requires specific runtime context, so we test the run method directly
    const workflow = {
      env: mockEnv,
      run: TextToVectorWorkflow.prototype.run
    }
    
    const mockEvent = {
      payload: {
        text: 'Hello world',
        id: 'custom-id',
        metadata: { source: 'test' }
      }
    }

    const mockStep = {
      do: vi.fn(async (name, fn) => fn())
    }

    const result = await workflow.run.call(workflow, mockEvent as any, mockStep as any)

    expect(result).toEqual({
      success: true,
      vectorId: 'custom-id',
      embedding: [0.1, 0.2, 0.3]
    })

    expect(mockStep.do).toHaveBeenCalledTimes(4)
    expect(vectorUtils.generateEmbeddingFromText).toHaveBeenCalledWith(mockEnv.AI, 'Hello world')
    expect(vectorUtils.storeInVectorize).toHaveBeenCalled()
    expect(vectorUtils.storeVectorMetadata).toHaveBeenCalled()
  })

  it('should generate ID when not provided', async () => {
    const mockEnv = {
      AI: {},
      VECTORIZE_INDEX: {},
      DB: {}
    } as any

    // WorkflowEntrypoint requires specific runtime context, so we test the run method directly
    const workflow = {
      env: mockEnv,
      run: TextToVectorWorkflow.prototype.run
    }
    
    const mockEvent = {
      payload: {
        text: 'Test text',
        metadata: { tag: 'example' }
      }
    }

    const mockStep = {
      do: vi.fn(async (name, fn) => fn())
    }

    const result = await workflow.run.call(workflow, mockEvent as any, mockStep as any)

    expect(result).toEqual({
      success: true,
      vectorId: 'vec_123_abc',
      embedding: [0.1, 0.2, 0.3]
    })

    expect(vectorUtils.generateVectorId).toHaveBeenCalled()
  })

  it('should handle workflow without metadata', async () => {
    const mockEnv = {
      AI: {},
      VECTORIZE_INDEX: {},
      DB: {}
    } as any

    // WorkflowEntrypoint requires specific runtime context, so we test the run method directly
    const workflow = {
      env: mockEnv,
      run: TextToVectorWorkflow.prototype.run
    }
    
    const mockEvent = {
      payload: {
        text: 'Simple text'
      }
    }

    const mockStep = {
      do: vi.fn(async (name, fn) => fn())
    }

    const result = await workflow.run.call(workflow, mockEvent as any, mockStep as any)

    expect(result.success).toBe(true)
    expect(result.vectorId).toBe('vec_123_abc')
    expect(result.embedding).toEqual([0.1, 0.2, 0.3])
  })

  it('should execute steps in correct order', async () => {
    const mockEnv = {
      AI: {},
      VECTORIZE_INDEX: {},
      DB: {}
    } as any

    // WorkflowEntrypoint requires specific runtime context, so we test the run method directly
    const workflow = {
      env: mockEnv,
      run: TextToVectorWorkflow.prototype.run
    }
    
    const mockEvent = {
      payload: {
        text: 'Order test'
      }
    }

    const stepOrder: string[] = []
    const mockStep = {
      do: vi.fn(async (name, fn) => {
        stepOrder.push(name)
        return fn()
      })
    }

    await workflow.run.call(workflow, mockEvent as any, mockStep as any)

    expect(stepOrder).toEqual([
      'generate-embedding',
      'generate-id',
      'store-in-vectorize',
      'store-in-d1'
    ])
  })

  it('should handle Vectorize storage failure', async () => {
    // Mock storeInVectorize to fail
    vi.mocked(vectorUtils.storeInVectorize).mockRejectedValueOnce(new Error('Metadata too large'))
    
    const mockEnv = {
      AI: {},
      VECTORIZE_INDEX: {},
      DB: {}
    } as any

    const workflow = {
      env: mockEnv,
      run: TextToVectorWorkflow.prototype.run
    }
    
    const mockEvent = {
      payload: {
        text: 'Large text content',
        id: 'fail-id',
        metadata: { large: 'metadata' }
      }
    }

    const stepOrder: string[] = []
    const mockStep = {
      do: vi.fn(async (name, fn) => {
        stepOrder.push(name)
        return fn()
      })
    }

    const result = await workflow.run.call(workflow, mockEvent as any, mockStep as any)

    expect(result).toEqual({
      success: false,
      vectorId: 'fail-id',
      error: 'Vectorize storage failed: Metadata too large',
      embedding: [0.1, 0.2, 0.3]
    })

    // Should have called store-error-in-d1 instead of store-in-d1
    expect(stepOrder).toContain('store-error-in-d1')
    expect(stepOrder).not.toContain('store-in-d1')
  })

  it('should handle Vectorize storage failure without error message', async () => {
    // Mock storeInVectorize to fail without message
    vi.mocked(vectorUtils.storeInVectorize).mockRejectedValueOnce({})
    
    const mockEnv = {
      AI: {},
      VECTORIZE_INDEX: {},
      DB: {}
    } as any

    const workflow = {
      env: mockEnv,
      run: TextToVectorWorkflow.prototype.run
    }
    
    const mockEvent = {
      payload: {
        text: 'Text',
        metadata: {}
      }
    }

    const mockStep = {
      do: vi.fn(async (name, fn) => fn())
    }

    const result = await workflow.run.call(workflow, mockEvent as any, mockStep as any)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Vectorize storage failed')
  })

  it('should handle general error during embedding generation', async () => {
    // Mock generateEmbeddingFromText to fail
    vi.mocked(vectorUtils.generateEmbeddingFromText).mockRejectedValueOnce(new Error('AI service unavailable'))
    
    const mockEnv = {
      AI: {},
      VECTORIZE_INDEX: {},
      DB: {}
    } as any

    const workflow = {
      env: mockEnv,
      run: TextToVectorWorkflow.prototype.run
    }
    
    const mockEvent = {
      payload: {
        text: 'Test text',
        metadata: { test: true }
      }
    }

    const stepOrder: string[] = []
    const mockStep = {
      do: vi.fn(async (name, fn) => {
        stepOrder.push(name)
        return fn()
      })
    }

    const result = await workflow.run.call(workflow, mockEvent as any, mockStep as any)

    expect(result).toEqual({
      success: false,
      error: 'AI service unavailable'
    })

    // Should have called store-general-error
    expect(stepOrder).toContain('store-general-error')
  })

  it('should handle general error without message', async () => {
    // Mock generateEmbeddingFromText to fail without message
    vi.mocked(vectorUtils.generateEmbeddingFromText).mockRejectedValueOnce('string error')
    
    const mockEnv = {
      AI: {},
      VECTORIZE_INDEX: {},
      DB: {}
    } as any

    const workflow = {
      env: mockEnv,
      run: TextToVectorWorkflow.prototype.run
    }
    
    const mockEvent = {
      payload: {
        text: 'Test',
        metadata: {}
      }
    }

    const mockStep = {
      do: vi.fn(async (name, fn) => fn())
    }

    const result = await workflow.run.call(workflow, mockEvent as any, mockStep as any)

    expect(result).toEqual({
      success: false,
      error: 'Unknown error'
    })
  })

  it('should handle error in generate-id step', async () => {
    // Mock generateVectorId to throw
    vi.mocked(vectorUtils.generateVectorId).mockImplementationOnce(() => {
      throw new Error('ID generation failed')
    })
    
    const mockEnv = {
      AI: {},
      VECTORIZE_INDEX: {},
      DB: {}
    } as any

    const workflow = {
      env: mockEnv,
      run: TextToVectorWorkflow.prototype.run
    }
    
    const mockEvent = {
      payload: {
        text: 'Test text'
      }
    }

    const mockStep = {
      do: vi.fn(async (name, fn) => fn())
    }

    const result = await workflow.run.call(workflow, mockEvent as any, mockStep as any)

    expect(result.success).toBe(false)
    expect(result.error).toBe('ID generation failed')
  })
})