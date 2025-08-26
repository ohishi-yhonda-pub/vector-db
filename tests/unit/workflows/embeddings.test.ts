import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock cloudflare:workers
vi.mock('cloudflare:workers', () => ({
  WorkflowEntrypoint: class {
    constructor(public ctx: any, public env: any) {}
  },
  WorkflowStep: {},
  WorkflowEvent: {}
}))

// Import after mocking
import { EmbeddingsWorkflow } from '../../../src/workflows/embeddings'

// Mock WorkflowStep
const mockStep = {
  do: vi.fn()
}

// Mock WorkflowEvent
const createMockEvent = (payload: any) => ({
  payload,
  timestamp: new Date()
})

describe('EmbeddingsWorkflow', () => {
  let workflow: EmbeddingsWorkflow
  let mockEnv: any
  let mockCtx: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockEnv = {
      AI: {
        run: vi.fn()
      },
      DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5'
    }

    mockCtx = {}

    workflow = new EmbeddingsWorkflow(mockCtx, mockEnv)
  })

  describe('run', () => {
    it('should generate embedding successfully with default model', async () => {
      const params = {
        text: 'Test text for embedding'
      }

      const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5]
      
      mockStep.do.mockImplementationOnce(async (name, fn) => {
        if (name === 'generate-embedding') {
          mockEnv.AI.run.mockResolvedValueOnce({
            data: [mockEmbedding]
          })
          return await fn()
        }
      })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result).toEqual({
        success: true,
        embedding: mockEmbedding,
        model: '@cf/baai/bge-base-en-v1.5',
        dimensions: 5,
        completedAt: expect.any(String)
      })

      expect(mockEnv.AI.run).toHaveBeenCalledWith(
        '@cf/baai/bge-base-en-v1.5',
        { text: 'Test text for embedding' }
      )
    })

    it('should use custom model when provided', async () => {
      const params = {
        text: 'Test text',
        model: '@cf/custom/model'
      }

      const mockEmbedding = [0.1, 0.2]
      
      mockStep.do.mockImplementationOnce(async (name, fn) => {
        if (name === 'generate-embedding') {
          mockEnv.AI.run.mockResolvedValueOnce({
            data: [mockEmbedding]
          })
          return await fn()
        }
      })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result.model).toBe('@cf/custom/model')
      expect(mockEnv.AI.run).toHaveBeenCalledWith(
        '@cf/custom/model',
        { text: 'Test text' }
      )
    })

    it('should handle AI service failure', async () => {
      const params = {
        text: 'Test text'
      }
      
      mockStep.do.mockImplementationOnce(async (name, fn) => {
        if (name === 'generate-embedding') {
          mockEnv.AI.run.mockRejectedValueOnce(new Error('AI service error'))
          return await fn()
        }
      })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result).toEqual({
        success: false,
        model: '@cf/baai/bge-base-en-v1.5',
        error: 'AI service error',
        completedAt: expect.any(String)
      })
    })

    it('should handle AI response without data', async () => {
      const params = {
        text: 'Test text'
      }
      
      mockStep.do.mockImplementationOnce(async (name, fn) => {
        if (name === 'generate-embedding') {
          mockEnv.AI.run.mockResolvedValueOnce({})
          return await fn()
        }
      })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result).toEqual({
        success: false,
        model: '@cf/baai/bge-base-en-v1.5',
        error: 'Failed to generate embedding',
        completedAt: expect.any(String)
      })
    })

    it('should handle empty data array', async () => {
      const params = {
        text: 'Test text'
      }
      
      mockStep.do.mockImplementationOnce(async (name, fn) => {
        if (name === 'generate-embedding') {
          mockEnv.AI.run.mockResolvedValueOnce({
            data: []
          })
          return await fn()
        }
      })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result).toEqual({
        success: false,
        model: '@cf/baai/bge-base-en-v1.5',
        error: 'Failed to generate embedding',
        completedAt: expect.any(String)
      })
    })

    it('should handle non-Error exceptions', async () => {
      const params = {
        text: 'Test text'
      }
      
      mockStep.do.mockImplementationOnce(async (name, fn) => {
        if (name === 'generate-embedding') {
          throw 'String error'
        }
      })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result).toEqual({
        success: false,
        model: '@cf/baai/bge-base-en-v1.5',
        error: 'Unknown error',
        completedAt: expect.any(String)
      })
    })

    it('should handle empty text', async () => {
      const params = {
        text: ''
      }

      const mockEmbedding = []
      
      mockStep.do.mockImplementationOnce(async (name, fn) => {
        if (name === 'generate-embedding') {
          mockEnv.AI.run.mockResolvedValueOnce({
            data: [mockEmbedding]
          })
          return await fn()
        }
      })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result.success).toBe(true)
      expect(result.embedding).toEqual([])
      expect(result.dimensions).toBe(0)
    })

    it('should handle invalid payload', async () => {
      const params = {
        // Missing required 'text' field
        model: '@cf/custom/model'
      }

      const event = createMockEvent(params)
      
      await expect(async () => {
        await workflow.run(event as any, mockStep as any)
      }).rejects.toThrow()
    })

    it('should validate model parameter is string', async () => {
      const params = {
        text: 'Test text',
        model: 123 // Invalid type
      }

      const event = createMockEvent(params)
      
      await expect(async () => {
        await workflow.run(event as any, mockStep as any)
      }).rejects.toThrow()
    })

    it('should handle very long text', async () => {
      const longText = 'a'.repeat(10000)
      const params = {
        text: longText
      }

      const mockEmbedding = new Array(768).fill(0.1)
      
      mockStep.do.mockImplementationOnce(async (name, fn) => {
        if (name === 'generate-embedding') {
          mockEnv.AI.run.mockResolvedValueOnce({
            data: [mockEmbedding]
          })
          return await fn()
        }
      })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result.success).toBe(true)
      expect(result.dimensions).toBe(768)
      expect(mockEnv.AI.run).toHaveBeenCalledWith(
        '@cf/baai/bge-base-en-v1.5',
        { text: longText }
      )
    })
  })
})