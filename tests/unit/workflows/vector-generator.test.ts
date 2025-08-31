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
import { VectorGenerator } from '../../../src/workflows/vector-generator'
import { TextChunk } from '../../../src/workflows/chunk-processor'
import { AppError, ErrorCodes } from '../../../src/utils/error-handler'

describe('VectorGenerator Workflow', () => {
  let workflow: VectorGenerator
  let testSetup: ReturnType<typeof setupWorkflowTest>

  const mockChunks: TextChunk[] = [
    {
      id: 'chunk-1',
      text: 'This is the first chunk of text',
      index: 0,
      startOffset: 0,
      endOffset: 31,
      metadata: { source: 'test.txt' }
    },
    {
      id: 'chunk-2', 
      text: 'This is the second chunk of text',
      index: 1,
      startOffset: 31,
      endOffset: 63,
      metadata: { source: 'test.txt' }
    },
    {
      id: 'chunk-3',
      text: 'This is the third chunk of text',
      index: 2,
      startOffset: 63,
      endOffset: 94,
      metadata: { source: 'test.txt' }
    }
  ]

  beforeEach(() => {
    testSetup = setupWorkflowTest()
    
    // Mock Vectorize operations
    testSetup.mockEnv.VECTORIZE_INDEX = {
      insert: vi.fn().mockResolvedValue({}),
      query: vi.fn(),
      upsert: vi.fn(),
      deleteByIds: vi.fn(),
      describe: vi.fn()
    }

    // Mock AI embedding generation
    testSetup.mockEnv.AI = {
      run: vi.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5])
    }

    testSetup.mockEnv.DEFAULT_EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'

    workflow = new VectorGenerator(testSetup.mockCtx, testSetup.mockEnv)
  })

  describe('execute (via run)', () => {
    // Create mock event and step for workflow testing
    const createMockEvent = (payload: any) => ({
      payload,
      timestamp: new Date()
    })

    const mockStep = {
      do: vi.fn().mockImplementation(async (name: string, fn: () => Promise<any>) => {
        return await fn()
      }),
      sleep: vi.fn(),
      sleepUntil: vi.fn(),
      waitUntil: vi.fn()
    }

    it('should generate vectors for all chunks', async () => {
      const params = {
        chunks: mockChunks,
        namespace: 'test-namespace',
        model: '@cf/baai/bge-base-en-v1.5'
      }

      const result = await workflow.run(createMockEvent(params) as any, mockStep as any)

      expect(result.success).toBe(true)
      expect(result.data?.totalVectors).toBe(3)
      expect(result.data?.vectorIds).toHaveLength(3)
      expect(result.data?.failedChunks).toBe(0)
      expect(result.data?.vectorIds).toEqual(['chunk-1', 'chunk-2', 'chunk-3'])

      // Verify Vectorize insert calls
      expect(testSetup.mockEnv.VECTORIZE_INDEX.insert).toHaveBeenCalledTimes(3)
      expect(testSetup.mockEnv.AI.run).toHaveBeenCalledTimes(3)
    })

    it('should handle empty chunks array', async () => {
      const params = {
        chunks: [],
        namespace: 'test-namespace'
      }

      const result = await workflow.run(createMockEvent(params) as any, mockStep as any)

      expect(result.success).toBe(true)
      expect(result.data?.totalVectors).toBe(0)
      expect(result.data?.vectorIds).toEqual([])
      expect(result.data?.failedChunks).toBe(0)

      expect(testSetup.mockEnv.VECTORIZE_INDEX.insert).not.toHaveBeenCalled()
      expect(testSetup.mockEnv.AI.run).not.toHaveBeenCalled()
    })

    it('should handle undefined chunks', async () => {
      const params = {
        chunks: undefined as any,
        namespace: 'test-namespace'
      }

      const result = await workflow.run(createMockEvent(params) as any, mockStep as any)

      expect(result.success).toBe(true)
      expect(result.data?.totalVectors).toBe(0)
      expect(result.data?.vectorIds).toEqual([])
      expect(result.data?.failedChunks).toBe(0)
    })

    it('should handle embedding generation failures', async () => {
      // Make AI.run fail for second chunk
      testSetup.mockEnv.AI.run
        .mockResolvedValueOnce([0.1, 0.2, 0.3])
        .mockRejectedValueOnce(new Error('Embedding failed'))
        .mockResolvedValueOnce([0.4, 0.5, 0.6])

      const params = {
        chunks: mockChunks,
        namespace: 'test-namespace'
      }

      const result = await workflow.run(createMockEvent(params) as any, mockStep as any)

      expect(result.success).toBe(true)
      expect(result.data?.totalVectors).toBe(2)
      expect(result.data?.vectorIds).toHaveLength(2)
      expect(result.data?.failedChunks).toBe(1)
      expect(result.data?.vectorIds).toEqual(['chunk-1', 'chunk-3'])
    })
  })

  describe('determineBatchSize', () => {
    it('should use default batch size when not specified', () => {
      const batchSize = workflow['determineBatchSize']()
      expect(batchSize).toBe(5) // DEFAULT_BATCH_SIZE
    })

    it('should use requested size when valid', () => {
      const batchSize = workflow['determineBatchSize'](3)
      expect(batchSize).toBe(3)
    })

    it('should limit to maximum batch size', () => {
      const batchSize = workflow['determineBatchSize'](15)
      expect(batchSize).toBe(10) // MAX_BATCH_SIZE
    })

    it('should use default for invalid sizes', () => {
      expect(workflow['determineBatchSize'](0)).toBe(5)
      expect(workflow['determineBatchSize'](-1)).toBe(5)
    })
  })

  describe('createBatches', () => {
    it('should split chunks into correct batch sizes', () => {
      const batches = workflow['createBatches'](mockChunks, 2)
      
      expect(batches).toHaveLength(2)
      expect(batches[0]).toHaveLength(2)
      expect(batches[1]).toHaveLength(1)
      expect(batches[0][0].id).toBe('chunk-1')
      expect(batches[0][1].id).toBe('chunk-2')
      expect(batches[1][0].id).toBe('chunk-3')
    })

    it('should handle single batch', () => {
      const batches = workflow['createBatches'](mockChunks, 5)
      
      expect(batches).toHaveLength(1)
      expect(batches[0]).toHaveLength(3)
    })

    it('should handle empty chunks', () => {
      const batches = workflow['createBatches']([], 2)
      
      expect(batches).toHaveLength(0)
    })
  })

  describe('generateEmbedding', () => {
    it('should generate embedding with default model', async () => {
      const result = await workflow['generateEmbedding']('test text')
      
      expect(result.success).toBe(true)
      expect(result.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5])
      expect(result.model).toBe('@cf/baai/bge-base-en-v1.5')
      
      expect(testSetup.mockEnv.AI.run).toHaveBeenCalledWith(
        '@cf/baai/bge-base-en-v1.5',
        { text: 'test text' }
      )
    })

    it('should generate embedding with custom model', async () => {
      const result = await workflow['generateEmbedding']('test text', '@cf/baai/bge-large-en-v1.5')
      
      expect(result.success).toBe(true)
      expect(result.model).toBe('@cf/baai/bge-large-en-v1.5')
    })

    it('should handle response with data field', async () => {
      testSetup.mockEnv.AI.run.mockResolvedValue({
        data: [0.7, 0.8, 0.9]
      })

      const result = await workflow['generateEmbedding']('test text')
      
      expect(result.success).toBe(true)
      expect(result.embedding).toEqual([0.7, 0.8, 0.9])
    })

    it('should handle response with values field', async () => {
      testSetup.mockEnv.AI.run.mockResolvedValue({
        values: [0.4, 0.5, 0.6]
      })

      const result = await workflow['generateEmbedding']('test text')
      
      expect(result.success).toBe(true)
      expect(result.embedding).toEqual([0.4, 0.5, 0.6])
    })

    it('should handle unexpected response format', async () => {
      testSetup.mockEnv.AI.run.mockResolvedValue({ unexpected: 'format' })

      const result = await workflow['generateEmbedding']('test text')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Unexpected embedding response format')
      expect(result.embedding).toEqual([])
    })

    it('should handle AI service errors', async () => {
      testSetup.mockEnv.AI.run.mockRejectedValue(new Error('AI service unavailable'))

      const result = await workflow['generateEmbedding']('test text')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('AI service unavailable')
      expect(result.embedding).toEqual([])
    })

    it('should handle non-Error exceptions', async () => {
      testSetup.mockEnv.AI.run.mockRejectedValue('String error')

      const result = await workflow['generateEmbedding']('test text')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Unknown error')
    })
  })

  describe('saveVector', () => {
    it('should save vector successfully', async () => {
      const vector = {
        id: 'test-vector',
        values: [0.1, 0.2, 0.3],
        namespace: 'test',
        metadata: { source: 'test' }
      }

      const vectorId = await workflow['saveVector'](vector)
      
      expect(vectorId).toBe('test-vector')
      expect(testSetup.mockEnv.VECTORIZE_INDEX.insert).toHaveBeenCalledWith([vector])
    })

    it('should handle vectorize errors', async () => {
      testSetup.mockEnv.VECTORIZE_INDEX.insert.mockRejectedValue(new Error('Vectorize error'))

      const vector = {
        id: 'test-vector',
        values: [0.1, 0.2, 0.3],
        namespace: 'test'
      }

      await expect(workflow['saveVector'](vector)).rejects.toThrow(AppError)
      await expect(workflow['saveVector'](vector)).rejects.toThrow('Failed to save vector: test-vector')
    })
  })

  describe('aggregateResults', () => {
    it('should aggregate successful results', () => {
      const results = [
        { vectorIds: ['v1', 'v2'], failed: 0 },
        { vectorIds: ['v3'], failed: 1 },
        { vectorIds: ['v4', 'v5'], failed: 0 }
      ]

      const aggregated = workflow['aggregateResults'](results)

      expect(aggregated.vectorIds).toEqual(['v1', 'v2', 'v3', 'v4', 'v5'])
      expect(aggregated.totalVectors).toBe(5)
      expect(aggregated.failedChunks).toBe(1)
      expect(aggregated.metadata?.successRate).toBe(83) // 5/(5+1) * 100
      expect(aggregated.metadata?.processedAt).toBeDefined()
    })

    it('should handle all failed results', () => {
      const results = [
        { vectorIds: [], failed: 2 },
        { vectorIds: [], failed: 1 }
      ]

      const aggregated = workflow['aggregateResults'](results)

      expect(aggregated.vectorIds).toEqual([])
      expect(aggregated.totalVectors).toBe(0)
      expect(aggregated.failedChunks).toBe(3)
      expect(aggregated.metadata?.successRate).toBe(0)
    })

    it('should handle empty results', () => {
      const results: Array<{ vectorIds: string[], failed: number }> = []

      const aggregated = workflow['aggregateResults'](results)

      expect(aggregated.vectorIds).toEqual([])
      expect(aggregated.totalVectors).toBe(0)
      expect(aggregated.failedChunks).toBe(0)
      expect(aggregated.metadata?.successRate).toBe(0)
    })
  })

  describe('processBatch', () => {
    it('should process all chunks in batch successfully', async () => {
      const batch = mockChunks.slice(0, 2)
      const params = {
        chunks: mockChunks,
        namespace: 'test',
        model: '@cf/baai/bge-base-en-v1.5'
      }

      const result = await workflow['processBatch'](batch, params)

      expect(result.vectorIds).toHaveLength(2)
      expect(result.failed).toBe(0)
      expect(result.vectorIds).toEqual(['chunk-1', 'chunk-2'])
    })

    it('should handle mixed success and failure in batch', async () => {
      testSetup.mockEnv.AI.run
        .mockResolvedValueOnce([0.1, 0.2, 0.3])
        .mockRejectedValueOnce(new Error('Failed'))

      const batch = mockChunks.slice(0, 2)
      const params = {
        chunks: mockChunks,
        namespace: 'test'
      }

      const result = await workflow['processBatch'](batch, params)

      expect(result.vectorIds).toHaveLength(1)
      expect(result.failed).toBe(1)
      expect(result.vectorIds).toEqual(['chunk-1'])
    })
  })

  describe('generateVectorForChunk', () => {
    it('should generate vector for chunk successfully', async () => {
      const chunk = mockChunks[0]
      const params = {
        chunks: mockChunks,
        namespace: 'test',
        metadata: { author: 'test' }
      }

      const vectorId = await workflow['generateVectorForChunk'](chunk, params)

      expect(vectorId).toBe('chunk-1')
      expect(testSetup.mockEnv.AI.run).toHaveBeenCalledWith(
        '@cf/baai/bge-base-en-v1.5',
        { text: chunk.text }
      )
      expect(testSetup.mockEnv.VECTORIZE_INDEX.insert).toHaveBeenCalledWith([{
        id: 'chunk-1',
        values: [0.1, 0.2, 0.3, 0.4, 0.5],
        namespace: 'test',
        metadata: {
          source: 'test.txt',
          author: 'test',
          chunkIndex: 0,
          textPreview: 'This is the first chunk of text'
        }
      }])
    })

    it('should handle embedding generation failure', async () => {
      testSetup.mockEnv.AI.run.mockRejectedValue(new Error('Embedding failed'))

      const chunk = mockChunks[0]
      const params = { chunks: mockChunks, namespace: 'test' }

      await expect(workflow['generateVectorForChunk'](chunk, params)).rejects.toThrow('Failed to generate embedding: Embedding failed')
    })

    it('should handle unsuccessful embedding result', async () => {
      // Mock the generateEmbedding method to return unsuccessful result
      const originalGenerateEmbedding = workflow['generateEmbedding']
      workflow['generateEmbedding'] = vi.fn().mockResolvedValue({
        success: false,
        error: 'Model unavailable',
        embedding: [],
        model: '@cf/baai/bge-base-en-v1.5'
      })

      const chunk = mockChunks[0]
      const params = { chunks: mockChunks, namespace: 'test' }

      await expect(workflow['generateVectorForChunk'](chunk, params)).rejects.toThrow('Failed to generate embedding: Model unavailable')

      // Restore original method
      workflow['generateEmbedding'] = originalGenerateEmbedding
    })
  })
})