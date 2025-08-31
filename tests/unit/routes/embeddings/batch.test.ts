import { describe, it, expect, vi, beforeEach } from 'vitest'
import { batchEmbeddingRoute, batchEmbeddingHandler } from '../../../../src/routes/api/embeddings/batch'
import { setupEmbeddingsRouteTest } from '../../test-helpers/test-scenarios'
import { createMockRequest } from '../../test-helpers'
import { EmbeddingService } from '../../../../src/routes/api/embeddings/embedding-service'

// Mock EmbeddingService
vi.mock('../../../../src/routes/api/embeddings/embedding-service', () => ({
  EmbeddingService: vi.fn().mockImplementation(() => ({
    generateBatchEmbeddings: vi.fn()
  }))
}))

// Mock AI Embeddings Durable Object (for backward compatibility)
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
  let mockEmbeddingService: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock EmbeddingService instance
    mockEmbeddingService = {
      generateBatchEmbeddings: vi.fn()
    }
    
    ;(EmbeddingService as any).mockImplementation(() => mockEmbeddingService)
    
    testSetup = setupEmbeddingsRouteTest()
    
    // Add AI_EMBEDDINGS mock for this specific test
    testSetup.mockEnv.AI_EMBEDDINGS = mockAIEmbeddingsNamespace as any
    
    testSetup.app.openapi(batchEmbeddingRoute, batchEmbeddingHandler)
  })

  describe('POST /embeddings/batch', () => {
    it('should generate batch embeddings successfully', async () => {
      const mockResult = {
        batchId: 'batch-123',
        workflowIds: ['workflow-1', 'workflow-2', 'workflow-3'],
        textsCount: 3,
        status: 'queued'
      }

      mockEmbeddingService.generateBatchEmbeddings.mockResolvedValue(mockResult)

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
      expect(mockEmbeddingService.generateBatchEmbeddings).toHaveBeenCalledWith(
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
        batchId: 'batch-minimal',
        workflowIds: ['workflow-1', 'workflow-2'],
        textsCount: 2,
        status: 'queued'
      }

      mockEmbeddingService.generateBatchEmbeddings.mockResolvedValue(mockResult)

      const request = createMockRequest('http://localhost/embeddings/batch', {
        method: 'POST',
        body: {
          texts: ['Text 1', 'Text 2']
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockEmbeddingService.generateBatchEmbeddings).toHaveBeenCalledWith(
        ['Text 1', 'Text 2'],
        undefined,  // modelが未指定の場合
        {
          batchSize: undefined,  // batch.tsでの実際の値
          saveToVectorize: undefined  // batch.tsでの実際の値
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

    it('should return 400 for empty text string in array', async () => {
      const request = createMockRequest('http://localhost/embeddings/batch', {
        method: 'POST',
        body: {
          texts: ['Valid text', '', 'Another valid text']
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('VALIDATION_ERROR')
      expect(result.message).toContain('Text at index 1 cannot be empty')
    })

    it('should return 400 for whitespace-only text string', async () => {
      const request = createMockRequest('http://localhost/embeddings/batch', {
        method: 'POST',
        body: {
          texts: ['Valid text', '   ', 'Another valid text']
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('VALIDATION_ERROR')
      expect(result.message).toContain('Text at index 1 cannot be empty')
    })

    it('should handle Durable Object errors', async () => {
      mockEmbeddingService.generateBatchEmbeddings.mockRejectedValue(new Error('Batch processing error'))

      const request = createMockRequest('http://localhost/embeddings/batch', {
        method: 'POST',
        body: {
          texts: ['Text 1', 'Text 2']
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      // EmbeddingServiceがAppErrorをスローするため、エラーレスポンスの形式が異なる
      expect(result.success).toBe(false)
      expect(result.error).toBe('Internal Server Error')
      expect(result.message).toBe('Batch processing error')
    })

    it('should handle non-Error exceptions', async () => {
      mockEmbeddingService.generateBatchEmbeddings.mockRejectedValue('String error')

      const request = createMockRequest('http://localhost/embeddings/batch', {
        method: 'POST',
        body: {
          texts: ['Text 1']
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      // EmbeddingServiceがエラーをラップするため、メッセージが異なる
      expect(result.success).toBe(false)
      expect(result.error).toBe('Internal Server Error')
      expect(result.message).toBe('バッチ埋め込み生成中にエラーが発生しました')
    })
  })
})