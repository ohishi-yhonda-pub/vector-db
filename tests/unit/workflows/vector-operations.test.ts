import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupWorkflowTest } from '../test-helpers'

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

// Mock WorkflowEvent
const createMockEvent = (payload: any) => ({
  payload,
  timestamp: new Date()
})

describe('VectorOperationsWorkflow', () => {
  let workflow: VectorOperationsWorkflow
  let testSetup: ReturnType<typeof setupWorkflowTest>

  beforeEach(() => {
    vi.clearAllMocks()
    testSetup = setupWorkflowTest()
    
    // Add additional env variables
    testSetup.mockEnv.DEFAULT_EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'
    testSetup.mockEnv.VECTORIZE_INDEX = {
      insert: vi.fn().mockResolvedValue(undefined),
      deleteByIds: vi.fn()
    }
    
    workflow = new VectorOperationsWorkflow(testSetup.mockCtx, testSetup.mockEnv)
  })

  describe('run', () => {
    describe('create operations', () => {
      it('should create vector successfully', async () => {
        const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5]
        const params = {
          type: 'create' as const,
          embedding: mockEmbedding,
          namespace: 'test-namespace',
          metadata: { source: 'test' }
        }
        
        testSetup.mockStep.do
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
        const result = await workflow.run(event as any, testSetup.mockStep as any)

        expect(result).toMatchObject({
          type: 'create',
          success: true,
          vectorId: expect.stringMatching(/^vec_\d+_[a-z0-9]+$/),
          dimensions: 5,
          completedAt: expect.any(String)
        })

        expect(testSetup.mockEnv.VECTORIZE_INDEX.insert).toHaveBeenCalledWith([
          expect.objectContaining({
            id: expect.stringMatching(/^vec_\d+_[a-z0-9]+$/),
            values: mockEmbedding,
            namespace: 'test-namespace'
          })
        ])
      })

      it('should use provided vector ID when specified', async () => {
        const mockEmbedding = [0.1, 0.2]
        const params = {
          type: 'create' as const,
          embedding: mockEmbedding,
          vectorId: 'custom-vector-id',
          namespace: 'test'
        }
        
        testSetup.mockStep.do
          .mockImplementationOnce(async (name, fn) => {
            if (name === 'create-vector-id') {
              return await fn()
            }
          })
          .mockImplementationOnce(async (name, fn) => await fn())

        const event = createMockEvent(params)
        const result = await workflow.run(event as any, testSetup.mockStep as any)

        expect(result.vectorId).toBe('custom-vector-id')
      })

      it('should use default namespace when not provided', async () => {
        const mockEmbedding = [0.1]
        const params = {
          type: 'create' as const,
          embedding: mockEmbedding
        }
        
        testSetup.mockStep.do
          .mockImplementationOnce(async (name, fn) => await fn())
          .mockImplementationOnce(async (name, fn) => await fn())

        const event = createMockEvent(params)
        await workflow.run(event as any, testSetup.mockStep as any)

        expect(testSetup.mockEnv.VECTORIZE_INDEX.insert).toHaveBeenCalledWith([
          expect.objectContaining({
            namespace: 'default'
          })
        ])
      })

      it('should handle vectorize insert failure', async () => {
        const mockEmbedding = [0.1, 0.2]
        const params = {
          type: 'create' as const,
          embedding: mockEmbedding
        }
        
        testSetup.mockStep.do
          .mockImplementationOnce(async (name, fn) => await fn())
          .mockImplementationOnce(async (name, fn) => {
            if (name === 'save-to-vectorize') {
              testSetup.mockEnv.VECTORIZE_INDEX.insert.mockRejectedValueOnce(new Error('Vectorize error'))
              return await fn()
            }
          })

        const event = createMockEvent(params)
        const result = await workflow.run(event as any, testSetup.mockStep as any)

        expect(result).toMatchObject({
          type: 'create',
          success: false,
          error: 'Vectorize error',
          completedAt: expect.any(String)
        })
      })

      it('should handle empty embedding array', async () => {
        const params = {
          type: 'create' as const,
          embedding: []
        }
        
        testSetup.mockStep.do
          .mockImplementationOnce(async (name, fn) => await fn())
          .mockImplementationOnce(async (name, fn) => await fn())

        const event = createMockEvent(params)
        const result = await workflow.run(event as any, testSetup.mockStep as any)

        expect(result).toMatchObject({
          type: 'create',
          success: true,
          dimensions: 0,
          completedAt: expect.any(String)
        })
      })

      it('should include metadata in vector', async () => {
        const mockEmbedding = [0.1, 0.2]
        const params = {
          type: 'create' as const,
          embedding: mockEmbedding,
          metadata: { custom: 'metadata' }
        }
        
        testSetup.mockStep.do
          .mockImplementationOnce(async (name, fn) => await fn())
          .mockImplementationOnce(async (name, fn) => await fn())

        const event = createMockEvent(params)
        await workflow.run(event as any, testSetup.mockStep as any)

        expect(testSetup.mockEnv.VECTORIZE_INDEX.insert).toHaveBeenCalledWith([
          expect.objectContaining({
            metadata: expect.objectContaining({
              custom: 'metadata'
            })
          })
        ])
      })
    })

    describe('delete operations', () => {
      it('should delete vectors successfully', async () => {
        const params = {
          type: 'delete' as const,
          vectorIds: ['vec1', 'vec2', 'vec3']
        }
        
        testSetup.mockStep.do.mockImplementationOnce(async (name, fn) => {
          if (name === 'delete-from-vectorize') {
            testSetup.mockEnv.VECTORIZE_INDEX.deleteByIds.mockResolvedValueOnce({
              count: 3
            })
            return await fn()
          }
        })

        const event = createMockEvent(params)
        const result = await workflow.run(event as any, testSetup.mockStep as any)

        expect(result).toMatchObject({
          type: 'delete',
          success: true,
          deletedCount: 3,
          completedAt: expect.any(String)
        })

        expect(testSetup.mockEnv.VECTORIZE_INDEX.deleteByIds).toHaveBeenCalledWith(['vec1', 'vec2', 'vec3'])
      })

      it('should handle partial deletion', async () => {
        const params = {
          type: 'delete' as const,
          vectorIds: ['vec1', 'vec2']
        }
        
        testSetup.mockStep.do.mockImplementationOnce(async (name, fn) => {
          if (name === 'delete-from-vectorize') {
            testSetup.mockEnv.VECTORIZE_INDEX.deleteByIds.mockResolvedValueOnce({
              count: 1
            })
            return await fn()
          }
        })

        const event = createMockEvent(params)
        const result = await workflow.run(event as any, testSetup.mockStep as any)

        expect(result).toMatchObject({
          type: 'delete',
          success: true,
          deletedCount: 1,
          completedAt: expect.any(String)
        })
      })

      it('should handle delete failure', async () => {
        const params = {
          type: 'delete' as const,
          vectorIds: ['vec1']
        }
        
        testSetup.mockStep.do.mockImplementationOnce(async (name, fn) => {
          if (name === 'delete-from-vectorize') {
            testSetup.mockEnv.VECTORIZE_INDEX.deleteByIds.mockRejectedValueOnce(new Error('Delete error'))
            return await fn()
          }
        })

        const event = createMockEvent(params)
        const result = await workflow.run(event as any, testSetup.mockStep as any)

        expect(result).toMatchObject({
          type: 'delete',
          success: false,
          error: 'Delete error',
          completedAt: expect.any(String)
        })
      })

      it('should handle empty vector IDs', async () => {
        const params = {
          type: 'delete' as const,
          vectorIds: []
        }
        
        testSetup.mockStep.do.mockImplementationOnce(async (name, fn) => {
          if (name === 'delete-from-vectorize') {
            testSetup.mockEnv.VECTORIZE_INDEX.deleteByIds.mockResolvedValueOnce({
              count: 0
            })
            return await fn()
          }
        })

        const event = createMockEvent(params)
        const result = await workflow.run(event as any, testSetup.mockStep as any)

        expect(result).toMatchObject({
          type: 'delete',
          success: true,
          deletedCount: 0,
          completedAt: expect.any(String)
        })
      })
    })

    describe('error handling', () => {
      it('should handle non-Error exceptions in delete operation', async () => {
        const params = {
          type: 'delete' as const,
          vectorIds: ['vec1']
        }
        
        testSetup.mockStep.do.mockImplementationOnce(async (name, fn) => {
          if (name === 'delete-from-vectorize') {
            throw 'String error'
          }
        })

        const event = createMockEvent(params)
        const result = await workflow.run(event as any, testSetup.mockStep as any)

        expect(result).toMatchObject({
          type: 'delete',
          success: false,
          error: 'Unknown error',
          completedAt: expect.any(String)
        })
      })

      it('should handle non-Error exceptions in create operation', async () => {
        const params = {
          type: 'create' as const,
          embedding: [0.1]
        }
        
        testSetup.mockStep.do
          .mockImplementationOnce(async (name, fn) => await fn())
          .mockImplementationOnce(async (name, fn) => {
            if (name === 'save-to-vectorize') {
              throw 'String error'
            }
          })

        const event = createMockEvent(params)
        const result = await workflow.run(event as any, testSetup.mockStep as any)

        expect(result).toMatchObject({
          type: 'create',
          success: false,
          error: 'Unknown error',
          completedAt: expect.any(String)
        })
      })

      it('should handle invalid payload', async () => {
        const params = {
          type: 'invalid' as any,
          text: 'Test text'
        }

        const event = createMockEvent(params)
        
        await expect(async () => {
          await workflow.run(event as any, testSetup.mockStep as any)
        }).rejects.toThrow()
      })
    })
  })
})