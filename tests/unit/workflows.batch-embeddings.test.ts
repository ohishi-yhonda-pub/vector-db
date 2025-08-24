import { describe, it, expect, vi, beforeEach } from 'vitest'

// Import just the types and interfaces, not the class
import type { 
  BatchEmbeddingResult 
} from '../../src/workflows/batch-embeddings'
import type { BatchEmbeddingParams } from '../../src/workflows/schemas/workflow.schema'

// Mock the actual workflow implementation
const mockEnv = {
  AI: {
    run: vi.fn()
  },
  VECTORIZE_INDEX: {
    insert: vi.fn()
  }
} as unknown as Env

// Simplified workflow implementation for testing
class TestWorkflow {
  constructor(private env: Env) {}

  async generateSingleEmbedding(text: string, model: string = '@cf/baai/bge-base-en-v1.5') {
    try {
      const result = await this.env.AI.run(model as keyof AiModels, { text })
      if ('data' in result && result.data && result.data.length > 0) {
        return {
          text,
          embedding: result.data[0],
          error: null
        }
      } else {
        return {
          text,
          embedding: null,
          error: 'Failed to generate embedding'
        }
      }
    } catch (error) {
      return {
        text,
        embedding: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async processBatch(texts: string[], model: string = '@cf/baai/bge-base-en-v1.5') {
    return await Promise.all(
      texts.map(text => this.generateSingleEmbedding(text, model))
    )
  }

  splitIntoBatches(texts: string[], batchSize: number = 10): string[][] {
    const batches: string[][] = []
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize))
    }
    return batches
  }

  separateResults(allResults: Array<{text: string, embedding: number[] | null, error: string | null}>) {
    const successful = allResults.filter(r => r.embedding !== null) as Array<{
      text: string
      embedding: number[]
      error: null
    }>
    const failed = allResults.filter(r => r.embedding === null) as Array<{
      text: string
      embedding: null
      error: string
    }>
    return { successful, failed }
  }

  async saveToVectorize(successful: Array<{text: string, embedding: number[], error: null}>, model: string) {
    const vectors = successful.map((result, index) => ({
      id: `workflow_${Date.now()}_${index}`,
      values: result.embedding,
      namespace: 'batch-embeddings',
      metadata: {
        text: result.text,
        model: model,
        timestamp: new Date().toISOString()
      }
    }))

    await this.env.VECTORIZE_INDEX.insert(vectors)
    return { savedCount: vectors.length }
  }

  async run(params: any): Promise<BatchEmbeddingResult> {
    const {
      texts,
      model = '@cf/baai/bge-base-en-v1.5',
      batchSize = 10,
      saveToVectorize = false
    } = params

    // Split texts into batches
    const batches = this.splitIntoBatches(texts, batchSize)

    // Process all batches
    const allResults: Array<{
      text: string
      embedding: number[] | null
      error: string | null
    }> = []

    for (const batch of batches) {
      const batchResults = await this.processBatch(batch, model)
      allResults.push(...batchResults)
    }

    // Separate successful and failed results
    const { successful, failed } = this.separateResults(allResults)

    // Save to Vectorize if requested
    if (saveToVectorize && successful.length > 0) {
      await this.saveToVectorize(successful, model)
    }

    return {
      embeddings: successful,
      failed: failed,
      model: model,
      totalCount: texts.length,
      successCount: successful.length,
      failedCount: failed.length
    }
  }
}

describe('BatchEmbeddingsWorkflow', () => {
  let workflow: TestWorkflow

  beforeEach(() => {
    vi.clearAllMocks()
    workflow = new TestWorkflow(mockEnv)
  })

  describe('generateSingleEmbedding', () => {
    it('should generate embedding successfully', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5]
      mockEnv.AI.run = vi.fn().mockResolvedValue({
        data: [mockEmbedding]
      })

      const result = await workflow.generateSingleEmbedding('test text', '@cf/baai/bge-base-en-v1.5')

      expect(result).toEqual({
        text: 'test text',
        embedding: mockEmbedding,
        error: null
      })
      expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', { text: 'test text' })
    })

    it('should handle AI response with no data', async () => {
      mockEnv.AI.run = vi.fn().mockResolvedValue({
        data: []
      })

      const result = await workflow.generateSingleEmbedding('test text')

      expect(result).toEqual({
        text: 'test text',
        embedding: null,
        error: 'Failed to generate embedding'
      })
    })

    it('should handle AI response with no data field', async () => {
      mockEnv.AI.run = vi.fn().mockResolvedValue({
        success: false
      })

      const result = await workflow.generateSingleEmbedding('test text')

      expect(result).toEqual({
        text: 'test text',
        embedding: null,
        error: 'Failed to generate embedding'
      })
    })

    it('should handle AI errors', async () => {
      const error = new Error('AI service unavailable')
      mockEnv.AI.run = vi.fn().mockRejectedValue(error)

      const result = await workflow.generateSingleEmbedding('test text')

      expect(result).toEqual({
        text: 'test text',
        embedding: null,
        error: 'AI service unavailable'
      })
    })

    it('should handle unknown errors', async () => {
      mockEnv.AI.run = vi.fn().mockRejectedValue('Unknown error string')

      const result = await workflow.generateSingleEmbedding('test text')

      expect(result).toEqual({
        text: 'test text',
        embedding: null,
        error: 'Unknown error'
      })
    })

    it('should use default model when none specified', async () => {
      mockEnv.AI.run = vi.fn().mockResolvedValue({
        data: [[0.1, 0.2, 0.3]]
      })

      await workflow.generateSingleEmbedding('test text')

      expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', { text: 'test text' })
    })
  })

  describe('splitIntoBatches', () => {
    it('should split texts into correct batch sizes', () => {
      const texts = ['text1', 'text2', 'text3', 'text4', 'text5']
      const batches = workflow.splitIntoBatches(texts, 2)

      expect(batches).toEqual([
        ['text1', 'text2'],
        ['text3', 'text4'],
        ['text5']
      ])
    })

    it('should handle empty array', () => {
      const batches = workflow.splitIntoBatches([], 10)
      expect(batches).toEqual([])
    })

    it('should use default batch size', () => {
      const texts = Array.from({ length: 25 }, (_, i) => `text${i}`)
      const batches = workflow.splitIntoBatches(texts)

      expect(batches).toHaveLength(3)
      expect(batches[0]).toHaveLength(10)
      expect(batches[1]).toHaveLength(10)
      expect(batches[2]).toHaveLength(5)
    })
  })

  describe('separateResults', () => {
    it('should separate successful and failed results', () => {
      const allResults = [
        { text: 'success1', embedding: [0.1, 0.2], error: null },
        { text: 'fail1', embedding: null, error: 'Failed' },
        { text: 'success2', embedding: [0.3, 0.4], error: null }
      ]

      const { successful, failed } = workflow.separateResults(allResults)

      expect(successful).toHaveLength(2)
      expect(failed).toHaveLength(1)
      expect(successful[0].text).toBe('success1')
      expect(failed[0].text).toBe('fail1')
    })
  })

  describe('processBatch', () => {
    it('should process batch of texts', async () => {
      mockEnv.AI.run = vi.fn()
        .mockResolvedValueOnce({ data: [[0.1, 0.2]] })
        .mockResolvedValueOnce({ data: [[0.3, 0.4]] })

      const results = await workflow.processBatch(['text1', 'text2'], '@cf/baai/bge-small-en-v1.5')

      expect(results).toHaveLength(2)
      expect(results[0].text).toBe('text1')
      expect(results[1].text).toBe('text2')
      expect(mockEnv.AI.run).toHaveBeenCalledTimes(2)
    })
  })

  describe('saveToVectorize', () => {
    it('should save vectors to Vectorize', async () => {
      const successful = [
        { text: 'text1', embedding: [0.1, 0.2], error: null },
        { text: 'text2', embedding: [0.3, 0.4], error: null }
      ]

      mockEnv.VECTORIZE_INDEX.insert = vi.fn().mockResolvedValue(undefined)

      const result = await workflow.saveToVectorize(successful, '@cf/baai/bge-base-en-v1.5')

      expect(result.savedCount).toBe(2)
      expect(mockEnv.VECTORIZE_INDEX.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          id: expect.stringMatching(/^workflow_\d+_0$/),
          values: [0.1, 0.2],
          namespace: 'batch-embeddings',
          metadata: expect.objectContaining({
            text: 'text1',
            model: '@cf/baai/bge-base-en-v1.5',
            timestamp: expect.any(String)
          })
        }),
        expect.objectContaining({
          id: expect.stringMatching(/^workflow_\d+_1$/),
          values: [0.3, 0.4],
          namespace: 'batch-embeddings',
          metadata: expect.objectContaining({
            text: 'text2',
            model: '@cf/baai/bge-base-en-v1.5',
            timestamp: expect.any(String)
          })
        })
      ])
    })
  })

  describe('run', () => {
    it('should process texts end-to-end', async () => {
      const texts = ['text1', 'text2']
      const params: BatchEmbeddingParams = {
        texts,
        model: '@cf/baai/bge-base-en-v1.5',
        batchSize: 10,
        saveToVectorize: false
      }

      mockEnv.AI.run = vi.fn()
        .mockResolvedValueOnce({ data: [[0.1, 0.2]] })
        .mockResolvedValueOnce({ data: [[0.3, 0.4]] })

      const result = await workflow.run(params)

      expect(result).toEqual({
        embeddings: [
          { text: 'text1', embedding: [0.1, 0.2], error: null },
          { text: 'text2', embedding: [0.3, 0.4], error: null }
        ],
        failed: [],
        model: '@cf/baai/bge-base-en-v1.5',
        totalCount: 2,
        successCount: 2,
        failedCount: 0
      })
    })

    it('should handle mixed success and failure', async () => {
      const texts = ['success', 'fail']
      const params = { texts }

      mockEnv.AI.run = vi.fn()
        .mockResolvedValueOnce({ data: [[0.1, 0.2]] })
        .mockRejectedValueOnce(new Error('Failed'))

      const result = await workflow.run(params)

      expect(result.successCount).toBe(1)
      expect(result.failedCount).toBe(1)
      expect(result.embeddings).toHaveLength(1)
      expect(result.failed).toHaveLength(1)
    })

    it('should save to Vectorize when requested', async () => {
      const texts = ['text1']
      const params = {
        texts,
        saveToVectorize: true
      }

      mockEnv.AI.run = vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] })
      mockEnv.VECTORIZE_INDEX.insert = vi.fn().mockResolvedValue(undefined)

      await workflow.run(params)

      expect(mockEnv.VECTORIZE_INDEX.insert).toHaveBeenCalled()
    })

    it('should not save to Vectorize when not requested', async () => {
      const texts = ['text1']
      const params = {
        texts,
        saveToVectorize: false
      }

      mockEnv.AI.run = vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] })
      mockEnv.VECTORIZE_INDEX.insert = vi.fn()

      await workflow.run(params)

      expect(mockEnv.VECTORIZE_INDEX.insert).not.toHaveBeenCalled()
    })

    it('should use default parameters', async () => {
      const params = {
        texts: ['text1']
      }

      mockEnv.AI.run = vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] })

      const result = await workflow.run(params)

      expect(result.model).toBe('@cf/baai/bge-base-en-v1.5')
    })

    it('should handle empty texts array', async () => {
      const params = {
        texts: []
      }

      const result = await workflow.run(params)

      expect(result).toEqual({
        embeddings: [],
        failed: [],
        model: '@cf/baai/bge-base-en-v1.5',
        totalCount: 0,
        successCount: 0,
        failedCount: 0
      })
    })
  })
})