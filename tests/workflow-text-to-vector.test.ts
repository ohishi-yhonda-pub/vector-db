/**
 * Tests for TextToVectorWorkflow
 */

import { describe, it, expect, vi } from 'vitest'
import { TextToVectorWorkflow } from '../src/workflows/text-to-vector'
import * as vectorUtils from '../src/lib/vector-utils'

// Mock the vector-utils module
vi.mock('../src/lib/vector-utils', () => ({
  generateVectorId: vi.fn(() => 'vec_123_abc'),
  generateEmbeddingFromText: vi.fn(() => Promise.resolve([0.1, 0.2, 0.3])),
  storeInVectorize: vi.fn(() => Promise.resolve()),
  storeVectorMetadata: vi.fn(() => Promise.resolve())
}))

describe('TextToVectorWorkflow', () => {
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
})