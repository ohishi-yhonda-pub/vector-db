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

// Import after mocking (zodは実際のものを使用)
import { BatchEmbeddingsWorkflow } from '../../../src/workflows/batch-embeddings'

// Mock WorkflowEvent
const createMockEvent = (payload: any) => ({
  payload,
  timestamp: new Date()
})

describe('BatchEmbeddingsWorkflow', () => {
  let workflow: BatchEmbeddingsWorkflow
  let testSetup: ReturnType<typeof setupWorkflowTest>

  beforeEach(() => {
    vi.clearAllMocks()
    testSetup = setupWorkflowTest()
    
    // Add VECTORIZE_INDEX to mockEnv
    testSetup.mockEnv.VECTORIZE_INDEX = {
      insert: vi.fn()
    }
    
    workflow = new BatchEmbeddingsWorkflow(testSetup.mockCtx, testSetup.mockEnv)
  })

  describe('generateSingleEmbedding', () => {
    it('should generate embedding successfully', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3]
      testSetup.mockAI.run.mockResolvedValueOnce({
        data: [mockEmbedding]
      })

      const result = await (workflow as any).generateSingleEmbedding('test text')
      
      expect(testSetup.mockAI.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', { text: 'test text' })
      expect(result).toEqual({
        text: 'test text',
        embedding: mockEmbedding,
        error: null
      })
    })

    it('should handle empty data response', async () => {
      testSetup.mockAI.run.mockResolvedValueOnce({
        data: []
      })

      const result = await (workflow as any).generateSingleEmbedding('test text')
      
      expect(result).toEqual({
        text: 'test text',
        embedding: null,
        error: 'Failed to generate embedding'
      })
    })

    it('should handle missing data property', async () => {
      testSetup.mockAI.run.mockResolvedValueOnce({})

      const result = await (workflow as any).generateSingleEmbedding('test text')
      
      expect(result).toEqual({
        text: 'test text',
        embedding: null,
        error: 'Failed to generate embedding'
      })
    })

    it('should handle AI run errors', async () => {
      testSetup.mockAI.run.mockRejectedValueOnce(new Error('AI service error'))

      const result = await (workflow as any).generateSingleEmbedding('test text')
      
      expect(result).toEqual({
        text: 'test text',
        embedding: null,
        error: 'AI service error'
      })
    })

    it('should handle non-Error exceptions', async () => {
      testSetup.mockAI.run.mockRejectedValueOnce('Unknown error')

      const result = await (workflow as any).generateSingleEmbedding('test text')
      
      expect(result).toEqual({
        text: 'test text',
        embedding: null,
        error: 'Unknown error'
      })
    })

    it('should use custom model when provided', async () => {
      testSetup.mockAI.run.mockResolvedValueOnce({
        data: [[0.1, 0.2]]
      })

      await (workflow as any).generateSingleEmbedding('test text', '@cf/baai/bge-large-en-v1.5')
      
      expect(testSetup.mockAI.run).toHaveBeenCalledWith('@cf/baai/bge-large-en-v1.5', { text: 'test text' })
    })
  })

  describe('run', () => {
    it('should process single batch successfully', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3]
      const texts = ['text1', 'text2']
      
      testSetup.mockStep.do.mockImplementation(async (name, fn) => fn())
      testSetup.mockAI.run.mockResolvedValue({
        data: [mockEmbedding]
      })

      const event = createMockEvent({ texts })
      const result = await workflow.run(event as any, testSetup.mockStep as any)

      expect(testSetup.mockStep.do).toHaveBeenCalledWith('process-batch-0', expect.any(Function))
      expect(testSetup.mockStep.sleep).not.toHaveBeenCalled()
      expect(result).toMatchObject({
        totalCount: 2,
        successCount: 2,
        failedCount: 0,
        model: '@cf/baai/bge-base-en-v1.5'
      })
    })

    it('should process multiple batches with delays', async () => {
      const texts = Array(25).fill('text') // 3 batches with default batch size 10
      
      testSetup.mockStep.do.mockImplementation(async (name, fn) => fn())
      testSetup.mockAI.run.mockResolvedValue({
        data: [[0.1, 0.2, 0.3]]
      })

      const event = createMockEvent({ texts })
      const result = await workflow.run(event as any, testSetup.mockStep as any)

      expect(testSetup.mockStep.do).toHaveBeenCalledTimes(3)
      expect(testSetup.mockStep.sleep).toHaveBeenCalledTimes(2)
      expect(testSetup.mockStep.sleep).toHaveBeenCalledWith('batch-delay', 100)
      expect(result.totalCount).toBe(25)
    })

    it('should handle mixed success and failure', async () => {
      const texts = ['success1', 'fail1', 'success2']
      
      testSetup.mockStep.do.mockImplementation(async (name, fn) => fn())
      testSetup.mockAI.run
        .mockResolvedValueOnce({ data: [[0.1, 0.2]] })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ data: [[0.3, 0.4]] })

      const event = createMockEvent({ texts })
      const result = await workflow.run(event as any, testSetup.mockStep as any)

      expect(result.successCount).toBe(2)
      expect(result.failedCount).toBe(1)
      expect(result.failed[0]).toMatchObject({
        text: 'fail1',
        embedding: null,
        error: 'Failed'
      })
    })

    it('should return embeddings without saving to Vectorize', async () => {
      const texts = ['text1', 'text2']
      
      testSetup.mockStep.do.mockImplementation(async (name, fn) => fn())
      
      testSetup.mockAI.run.mockResolvedValue({
        data: [[0.1, 0.2, 0.3]]
      })

      const event = createMockEvent({ texts })
      const result = await workflow.run(event as any, testSetup.mockStep as any)

      // Should NOT save to Vectorize anymore
      expect(testSetup.mockEnv.VECTORIZE_INDEX.insert).not.toHaveBeenCalled()
      
      // Should return embeddings in result
      expect(result.embeddings).toHaveLength(2)
      expect(result.embeddings[0]).toEqual({
        text: 'text1',
        embedding: [0.1, 0.2, 0.3],
        error: null
      })
    })

    it('should handle all embeddings failing', async () => {
      const texts = ['text1', 'text2']
      
      testSetup.mockStep.do.mockImplementation(async (name, fn) => fn())
      testSetup.mockAI.run.mockRejectedValue(new Error('Failed'))

      const event = createMockEvent({ texts })
      const result = await workflow.run(event as any, testSetup.mockStep as any)

      expect(testSetup.mockStep.do).toHaveBeenCalledTimes(1) // Only process batch
      expect(testSetup.mockEnv.VECTORIZE_INDEX.insert).not.toHaveBeenCalled()
      expect(result.failedCount).toBe(2)
      expect(result.failed).toHaveLength(2)
    })

    it('should use custom parameters', async () => {
      const texts = ['text1', 'text2', 'text3', 'text4', 'text5']
      const customModel = '@cf/baai/bge-large-en-v1.5'
      const customBatchSize = 2
      
      testSetup.mockStep.do.mockImplementation(async (name, fn) => fn())
      testSetup.mockAI.run.mockResolvedValue({
        data: [[0.1, 0.2]]
      })

      const event = createMockEvent({ 
        texts, 
        model: customModel,
        batchSize: customBatchSize
      })
      
      await workflow.run(event as any, testSetup.mockStep as any)

      expect(testSetup.mockStep.do).toHaveBeenCalledTimes(3) // 5 texts / batch size 2 = 3 batches
      expect(testSetup.mockAI.run).toHaveBeenCalledWith(customModel, expect.any(Object))
    })

    it('should handle empty texts array', async () => {
      const event = createMockEvent({ texts: [] })
      const result = await workflow.run(event as any, testSetup.mockStep as any)

      expect(result).toMatchObject({
        totalCount: 0,
        successCount: 0,
        failedCount: 0,
        embeddings: [],
        failed: []
      })
    })
  })
})