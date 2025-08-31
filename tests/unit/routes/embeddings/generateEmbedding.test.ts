import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateEmbeddingRoute, generateEmbeddingHandler } from '../../../../src/routes/api/embeddings/generate'
import { setupEmbeddingsRouteTest } from '../../test-helpers'
import { AppError, ErrorCodes } from '../../../../src/utils/error-handler'

// Mock EmbeddingService
const mockGenerateEmbedding = vi.fn()
vi.mock('../../../../src/routes/api/embeddings/embedding-service', () => ({
  EmbeddingService: vi.fn().mockImplementation(() => ({
    generateEmbedding: mockGenerateEmbedding
  }))
}))

// Mock logger
vi.mock('../../../../src/middleware/logging', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn()
  })
}))

describe('Generate Embedding Route', () => {
  let testSetup: ReturnType<typeof setupEmbeddingsRouteTest>

  beforeEach(() => {
    vi.clearAllMocks()
    
    testSetup = setupEmbeddingsRouteTest()
    testSetup.app.openapi(generateEmbeddingRoute, generateEmbeddingHandler)
  })

  describe('POST /embeddings', () => {
    it('should generate embeddings successfully', async () => {
      const mockResult = {
        workflowId: 'workflow-123',
        status: 'queued' as const,
        model: '@cf/baai/bge-base-en-v1.5',
        startedAt: '2024-01-01T00:00:00Z'
      }
      
      mockGenerateEmbedding.mockResolvedValue(mockResult)

      const response = await testSetup.app.request('/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: 'Test text for embedding',
          model: '@cf/baai/bge-base-en-v1.5'
        })
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      
      const result = await response.json()
      expect(result).toEqual({
        success: true,
        data: mockResult,
        message: 'テキストの処理を開始しました'
      })

      expect(mockGenerateEmbedding).toHaveBeenCalledWith(
        'Test text for embedding',
        '@cf/baai/bge-base-en-v1.5'
      )
    })

    it('should generate embeddings without model (use default)', async () => {
      const mockResult = {
        workflowId: 'workflow-456',
        status: 'queued' as const,
        startedAt: '2024-01-01T00:00:00Z'
      }
      
      mockGenerateEmbedding.mockResolvedValue(mockResult)

      const response = await testSetup.app.request('/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: 'Test text without model'
        })
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      expect(mockGenerateEmbedding).toHaveBeenCalledWith(
        'Test text without model',
        undefined
      )
    })

    it('should reject empty text', async () => {
      const response = await testSetup.app.request('/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: ''
        })
      }, testSetup.mockEnv)

      expect(response.status).toBe(400)
      
      const result = await response.json()
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should reject whitespace-only text', async () => {
      const response = await testSetup.app.request('/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: '   \n\t   '
        })
      }, testSetup.mockEnv)

      expect(response.status).toBe(400)
      
      const result = await response.json()
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle missing text field', async () => {
      const response = await testSetup.app.request('/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: '@cf/baai/bge-base-en-v1.5'
        })
      }, testSetup.mockEnv)

      expect(response.status).toBe(400)
    })

    it('should handle AppError from EmbeddingService', async () => {
      const appError = new AppError(
        ErrorCodes.EMBEDDING_GENERATION_ERROR,
        'AI service unavailable',
        500
      )
      
      mockGenerateEmbedding.mockRejectedValue(appError)

      const response = await testSetup.app.request('/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: 'Test text'
        })
      }, testSetup.mockEnv)

      expect(response.status).toBe(500)
      
      const result = await response.json()
      expect(result).toEqual({
        success: false,
        error: 'EMBEDDING_GENERATION_ERROR',
        message: 'AI service unavailable'
      })
    })

    it('should handle unexpected errors', async () => {
      mockGenerateEmbedding.mockRejectedValue(new Error('Unexpected error'))

      const response = await testSetup.app.request('/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: 'Test text'
        })
      }, testSetup.mockEnv)

      expect(response.status).toBe(500)
      
      const result = await response.json()
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Unexpected error'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockGenerateEmbedding.mockRejectedValue('String error')

      const response = await testSetup.app.request('/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: 'Test text'
        })
      }, testSetup.mockEnv)

      expect(response.status).toBe(500)
      
      const result = await response.json()
      expect(result.message).toBe('埋め込み生成中にエラーが発生しました')
    })

    it('should handle invalid JSON', async () => {
      const response = await testSetup.app.request('/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: 'invalid json'
      }, testSetup.mockEnv)

      expect(response.status).toBe(400)
    })

    it('should handle large text input', async () => {
      const largeText = 'A'.repeat(10000)
      const mockResult = {
        workflowId: 'workflow-large',
        status: 'queued' as const
      }
      
      mockGenerateEmbedding.mockResolvedValue(mockResult)

      const response = await testSetup.app.request('/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: largeText
        })
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      expect(mockGenerateEmbedding).toHaveBeenCalledWith(largeText, undefined)
    })
  })
})