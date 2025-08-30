import { describe, it, expect, vi, beforeEach } from 'vitest'
import { batchEmbeddingRoute, batchEmbeddingHandler } from '../../../../src/routes/api/embeddings/batch'
import { setupEmbeddingsRouteTest } from '../../test-helpers/test-scenarios'
import { createMockRequest } from '../../test-helpers'

// Mock AI Embeddings Durable Object
const mockAIEmbeddings = {
  generateBatchEmbeddings: vi.fn()
}

// Mock Durable Object namespace
const mockAIEmbeddingsNamespace = {
  idFromName: vi.fn().mockReturnValue('mock-id'),
  get: vi.fn().mockReturnValue(mockAIEmbeddings)
}

describe('Batch Embeddings Route', () => {
  let testSetup: ReturnType<typeof setupEmbeddingsRouteTest>

  beforeEach(() => {
    vi.clearAllMocks()
    
    testSetup = setupEmbeddingsRouteTest()
    
    // Add AI_EMBEDDINGS mock for this specific test
    testSetup.mockEnv.AI_EMBEDDINGS = mockAIEmbeddingsNamespace as any
    
    testSetup.app.openapi(batchEmbeddingRoute, batchEmbeddingHandler)
  })

  describe('POST /embeddings/batch', () => {
    it('should generate batch embeddings successfully', async () => {
      const mockResult = {
        jobId: 'job-batch-123',
        workflowId: 'workflow-batch-456',
        status: 'processing',
        textsCount: 3
      }

      mockAIEmbeddings.generateBatchEmbeddings.mockResolvedValue(mockResult)

      const request = createMockRequest('http://localhost/embeddings/batch', {
        method: 'POST',
        body: {
          texts: ['Text 1', 'Text 2', 'Text 3'],
          model: '@cf/baai/bge-base-en-v1.5',
          batchSize: 10,
          saveToVectorize: true
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockAIEmbeddings.generateBatchEmbeddings).toHaveBeenCalledWith(
        ['Text 1', 'Text 2', 'Text 3'],
        '@cf/baai/bge-base-en-v1.5',
        {
          batchSize: 10,
          saveToVectorize: true
        }
      )
      expect(result).toEqual({
        success: true,
        data: mockResult,
        message: '3件のテキストの処理を開始しました'
      })
    })

    it('should work with minimal parameters', async () => {
      const mockResult = {
        jobId: 'job-batch-minimal',
        workflowId: 'workflow-batch-minimal',
        status: 'processing',
        textsCount: 2
      }

      mockAIEmbeddings.generateBatchEmbeddings.mockResolvedValue(mockResult)

      const request = createMockRequest('http://localhost/embeddings/batch', {
        method: 'POST',
        body: {
          texts: ['Text 1', 'Text 2']
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockAIEmbeddings.generateBatchEmbeddings).toHaveBeenCalledWith(
        ['Text 1', 'Text 2'],
        undefined,
        {
          batchSize: undefined,
          saveToVectorize: undefined
        }
      )
      expect(result.success).toBe(true)
    })

    it('should return 400 for invalid request body', async () => {
      const request = createMockRequest('http://localhost/embeddings/batch', {
        method: 'POST',
        body: {
          // missing required texts field
          model: '@cf/baai/bge-base-en-v1.5'
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result).toHaveProperty('error')
    })

    it('should return 400 for empty texts array', async () => {
      const request = createMockRequest('http://localhost/embeddings/batch', {
        method: 'POST',
        body: {
          texts: []
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result).toHaveProperty('error')
    })

    it('should handle Durable Object errors', async () => {
      mockAIEmbeddings.generateBatchEmbeddings.mockRejectedValue(new Error('Batch processing error'))

      const request = createMockRequest('http://localhost/embeddings/batch', {
        method: 'POST',
        body: {
          texts: ['Text 1', 'Text 2']
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Batch processing error'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockAIEmbeddings.generateBatchEmbeddings.mockRejectedValue('String error')

      const request = createMockRequest('http://localhost/embeddings/batch', {
        method: 'POST',
        body: {
          texts: ['Text 1']
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('バッチ埋め込み生成中にエラーが発生しました')
    })
  })
})