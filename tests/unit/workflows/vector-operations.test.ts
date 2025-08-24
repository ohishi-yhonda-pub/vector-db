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
import { VectorOperationsWorkflow } from '../../../src/workflows/vector-operations'

// Mock WorkflowStep
const mockStep = {
  do: vi.fn()
}

// Mock WorkflowEvent
const createMockEvent = (payload: any) => ({
  payload,
  timestamp: new Date()
})

describe('VectorOperationsWorkflow', () => {
  let workflow: VectorOperationsWorkflow
  let mockEnv: any
  let mockCtx: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockEnv = {
      AI: {
        run: vi.fn()
      },
      DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
      VECTORIZE_INDEX: {
        insert: vi.fn().mockResolvedValue(undefined),
        deleteByIds: vi.fn()
      }
    }

    mockCtx = {}

    workflow = new VectorOperationsWorkflow(mockCtx, mockEnv)
  })

  describe('run', () => {
    describe('create operations', () => {
      it('should create vector successfully', async () => {
        const params = {
          type: 'create' as const,
          text: 'Test text for embedding',
          namespace: 'test-namespace',
          metadata: { source: 'test' }
        }

        const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5]
        
        mockStep.do
          .mockImplementationOnce(async (name, fn) => {
            // generate-embedding
            if (name === 'generate-embedding') {
              mockEnv.AI.run.mockResolvedValueOnce({
                data: [mockEmbedding]
              })
              return await fn()
            }
          })
          .mockImplementationOnce(async (name, fn) => {
            // create-vector-id
            if (name === 'create-vector-id') {
              return await fn()
            }
          })
          .mockImplementationOnce(async (name, fn) => {
            // save-to-vectorize
            if (name === 'save-to-vectorize') {
              return await fn()
            }
          })

        const event = createMockEvent(params)
        const result = await workflow.run(event as any, mockStep as any)

        expect(result).toMatchObject({
          type: 'create',
          success: true,
          vectorId: expect.stringMatching(/^vec_\d+_[a-z0-9]+$/),
          dimensions: 5,
          completedAt: expect.any(String)
        })

        expect(mockEnv.VECTORIZE_INDEX.insert).toHaveBeenCalledWith([
          expect.objectContaining({
            id: expect.stringMatching(/^vec_\d+_[a-z0-9]+$/),
            values: mockEmbedding,
            namespace: 'test-namespace',
            metadata: expect.objectContaining({
              source: 'test',
              model: '@cf/baai/bge-base-en-v1.5',
              text: 'Test text for embedding'
            })
          })
        ])
      })

      it('should use custom model when provided', async () => {
        const params = {
          type: 'create' as const,
          text: 'Test text',
          model: '@cf/baai/bge-large-en-v1.5'
        }

        const mockEmbedding = [0.1, 0.2]
        
        mockStep.do
          .mockImplementationOnce(async (name, fn) => {
            if (name === 'generate-embedding') {
              mockEnv.AI.run.mockResolvedValueOnce({
                data: [mockEmbedding]
              })
              return await fn()
            }
          })
          .mockImplementationOnce(async (name, fn) => {
            if (name === 'create-vector-id') {
              return await fn()
            }
          })
          .mockImplementationOnce(async (name, fn) => {
            if (name === 'save-to-vectorize') {
              return await fn()
            }
          })

        const event = createMockEvent(params)
        await workflow.run(event as any, mockStep as any)

        expect(mockEnv.AI.run).toHaveBeenCalledWith(
          '@cf/baai/bge-large-en-v1.5',
          { text: 'Test text' }
        )
      })

      it('should use default values when not provided', async () => {
        const params = {
          type: 'create' as const,
          text: 'Test text'
        }

        const mockEmbedding = [0.1, 0.2]
        
        mockStep.do
          .mockImplementationOnce(async (name, fn) => {
            if (name === 'generate-embedding') {
              mockEnv.AI.run.mockResolvedValueOnce({
                data: [mockEmbedding]
              })
              return await fn()
            }
          })
          .mockImplementationOnce(async (name, fn) => {
            if (name === 'create-vector-id') {
              return await fn()
            }
          })
          .mockImplementationOnce(async (name, fn) => {
            if (name === 'save-to-vectorize') {
              return await fn()
            }
          })

        const event = createMockEvent(params)
        await workflow.run(event as any, mockStep as any)

        expect(mockEnv.VECTORIZE_INDEX.insert).toHaveBeenCalledWith([
          expect.objectContaining({
            namespace: 'default'
          })
        ])
      })

      it('should handle AI embedding failure', async () => {
        const params = {
          type: 'create' as const,
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

        expect(result).toMatchObject({
          type: 'create',
          success: false,
          error: 'Failed to generate embedding',
          completedAt: expect.any(String)
        })
      })

      it('should handle AI response without data', async () => {
        const params = {
          type: 'create' as const,
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

        expect(result).toMatchObject({
          type: 'create',
          success: false,
          error: 'Failed to generate embedding'
        })
      })

      it('should handle vectorize insert failure', async () => {
        const params = {
          type: 'create' as const,
          text: 'Test text'
        }

        const mockEmbedding = [0.1, 0.2]
        
        mockStep.do
          .mockImplementationOnce(async (name, fn) => {
            if (name === 'generate-embedding') {
              mockEnv.AI.run.mockResolvedValueOnce({
                data: [mockEmbedding]
              })
              return await fn()
            }
          })
          .mockImplementationOnce(async (name, fn) => {
            if (name === 'create-vector-id') {
              return await fn()
            }
          })
          .mockImplementationOnce(async (name, fn) => {
            if (name === 'save-to-vectorize') {
              mockEnv.VECTORIZE_INDEX.insert.mockRejectedValueOnce(new Error('Vectorize insert failed'))
              return await fn()
            }
          })

        const event = createMockEvent(params)
        const result = await workflow.run(event as any, mockStep as any)

        expect(result).toMatchObject({
          type: 'create',
          success: false,
          error: 'Vectorize insert failed'
        })
      })
    })

    describe('delete operations', () => {
      it('should delete vectors successfully', async () => {
        const params = {
          type: 'delete' as const,
          vectorIds: ['vec-1', 'vec-2', 'vec-3']
        }

        mockStep.do.mockImplementationOnce(async (name, fn) => {
          if (name === 'delete-from-vectorize') {
            mockEnv.VECTORIZE_INDEX.deleteByIds.mockResolvedValueOnce({ count: 3 })
            return await fn()
          }
        })

        const event = createMockEvent(params)
        const result = await workflow.run(event as any, mockStep as any)

        expect(result).toMatchObject({
          type: 'delete',
          success: true,
          deletedCount: 3,
          completedAt: expect.any(String)
        })

        expect(mockEnv.VECTORIZE_INDEX.deleteByIds).toHaveBeenCalledWith(['vec-1', 'vec-2', 'vec-3'])
      })

      it('should handle partial deletion', async () => {
        const params = {
          type: 'delete' as const,
          vectorIds: ['vec-1', 'vec-2', 'vec-3']
        }

        mockStep.do.mockImplementationOnce(async (name, fn) => {
          if (name === 'delete-from-vectorize') {
            mockEnv.VECTORIZE_INDEX.deleteByIds.mockResolvedValueOnce({ count: 2 })
            return await fn()
          }
        })

        const event = createMockEvent(params)
        const result = await workflow.run(event as any, mockStep as any)

        expect(result).toMatchObject({
          type: 'delete',
          success: true,
          deletedCount: 2
        })
      })

      it('should handle delete failure', async () => {
        const params = {
          type: 'delete' as const,
          vectorIds: ['vec-1']
        }

        mockStep.do.mockImplementationOnce(async (name, fn) => {
          if (name === 'delete-from-vectorize') {
            mockEnv.VECTORIZE_INDEX.deleteByIds.mockRejectedValueOnce(new Error('Delete failed'))
            return await fn()
          }
        })

        const event = createMockEvent(params)
        const result = await workflow.run(event as any, mockStep as any)

        expect(result).toMatchObject({
          type: 'delete',
          success: false,
          error: 'Delete failed'
        })
      })

      it('should handle empty vector IDs', async () => {
        const params = {
          type: 'delete' as const,
          vectorIds: []
        }

        mockStep.do.mockImplementationOnce(async (name, fn) => {
          if (name === 'delete-from-vectorize') {
            mockEnv.VECTORIZE_INDEX.deleteByIds.mockResolvedValueOnce({ count: 0 })
            return await fn()
          }
        })

        const event = createMockEvent(params)
        const result = await workflow.run(event as any, mockStep as any)

        expect(result).toMatchObject({
          type: 'delete',
          success: true,
          deletedCount: 0
        })
      })
    })

    describe('error handling', () => {
      it('should handle invalid operation type', async () => {
        const params = {
          type: 'invalid' as any,
          text: 'test'
        }

        const event = createMockEvent(params)
        await expect(workflow.run(event as any, mockStep as any)).rejects.toThrow()
      })

      it('should handle missing required fields for create', async () => {
        const params = {
          type: 'create' as const
          // missing text field
        }

        const event = createMockEvent(params)
        await expect(workflow.run(event as any, mockStep as any)).rejects.toThrow()
      })

      it('should handle missing required fields for delete', async () => {
        const params = {
          type: 'delete' as const
          // missing vectorIds field
        }

        const event = createMockEvent(params)
        await expect(workflow.run(event as any, mockStep as any)).rejects.toThrow()
      })

      it('should handle non-Error exceptions in delete operation', async () => {
        const params = {
          type: 'delete' as const,
          vectorIds: ['vec-1', 'vec-2']
        }

        mockStep.do.mockImplementationOnce(async (name, fn) => {
          if (name === 'delete-from-vectorize') {
            throw 'String error' // Non-Error exception
          }
        })

        const event = createMockEvent(params)
        const result = await workflow.run(event as any, mockStep as any)

        expect(result).toMatchObject({
          type: 'delete',
          success: false,
          error: 'Unknown error'
        })
      })

      it('should handle non-Error exceptions', async () => {
        const params = {
          type: 'create' as const,
          text: 'Test text'
        }

        mockStep.do.mockImplementationOnce(async () => {
          throw 'String error'
        })

        const event = createMockEvent(params)
        const result = await workflow.run(event as any, mockStep as any)

        expect(result).toMatchObject({
          type: 'create',
          success: false,
          error: 'Unknown error'
        })
      })
    })

    describe('edge cases', () => {
      it('should handle unknown operation type', async () => {
        const params = {
          type: 'unknown' as any // Force an invalid type
        }

        const event = createMockEvent(params)
        await expect(workflow.run(event as any, mockStep as any)).rejects.toThrow()
      })
    })
  })
})