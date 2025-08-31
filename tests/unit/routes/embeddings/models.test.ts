import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { getAvailableModelsRoute, getAvailableModelsHandler, getModelDetailsRoute, getModelDetailsHandler } from '../../../../src/routes/api/embeddings/models'
import { EmbeddingService } from '../../../../src/routes/api/embeddings/embedding-service'

// Mock EmbeddingService
vi.mock('../../../../src/routes/api/embeddings/embedding-service', () => ({
  EmbeddingService: vi.fn().mockImplementation(() => ({
    getAvailableModels: vi.fn()
  }))
}))

// Mock AI Embeddings Durable Object (for backward compatibility)
const mockAIEmbeddings = {
  getAvailableModels: vi.fn()
}

// Mock Durable Object namespace
const mockAIEmbeddingsNamespace = {
  idFromName: vi.fn().mockReturnValue('mock-id'),
  get: vi.fn().mockReturnValue(mockAIEmbeddings)
}

describe('List Models Route', () => {
  let app: OpenAPIHono<{ Bindings: Env }>
  let mockEnv: Env
  let mockEmbeddingService: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock EmbeddingService instance
    mockEmbeddingService = {
      getAvailableModels: vi.fn()
    }
    
    ;(EmbeddingService as any).mockImplementation(() => mockEmbeddingService)
    
    mockEnv = {
      ENVIRONMENT: 'development' as const,
      DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
      DEFAULT_TEXT_GENERATION_MODEL: '@cf/google/gemma-3-12b-it',
      IMAGE_ANALYSIS_PROMPT: 'Describe this image in detail. Include any text visible in the image.',
      IMAGE_ANALYSIS_MAX_TOKENS: '512',
      TEXT_EXTRACTION_MAX_TOKENS: '1024',
      NOTION_API_KEY: '',
      AI: {} as any,
      VECTORIZE_INDEX: {} as any,
      VECTOR_CACHE: {
        idFromName: vi.fn().mockReturnValue('mock-vector-id'),
        get: vi.fn().mockReturnValue({})
      } as any,
      NOTION_MANAGER: {} as any,
      AI_EMBEDDINGS: mockAIEmbeddingsNamespace as any,
      DB: {} as any,
      EMBEDDINGS_WORKFLOW: {} as Workflow,
      BATCH_EMBEDDINGS_WORKFLOW: {} as any,
      VECTOR_OPERATIONS_WORKFLOW: {} as any,
      FILE_PROCESSING_WORKFLOW: {} as any,
      NOTION_SYNC_WORKFLOW: {} as any
    }

    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi(getAvailableModelsRoute, getAvailableModelsHandler)
    app.openapi(getModelDetailsRoute, getModelDetailsHandler)
  })

  describe('GET /embeddings/models', () => {
    it('should list available models successfully', async () => {
      const mockModels = [
        {
          id: '@cf/baai/bge-base-en-v1.5',
          name: 'BAAI General Embedding Base EN v1.5',
          dimensions: 768,
          maxTokens: 512,
          supported: true
        },
        {
          id: '@cf/baai/bge-small-en-v1.5',
          name: 'BAAI General Embedding Small EN v1.5',
          dimensions: 384,
          maxTokens: 512,
          supported: true
        },
        {
          id: '@cf/baai/bge-large-en-v1.5',
          name: 'BAAI General Embedding Large EN v1.5',
          dimensions: 1024,
          maxTokens: 512,
          supported: true
        }
      ]

      mockEmbeddingService.getAvailableModels.mockResolvedValue({
        models: mockModels,
        defaultModel: '@cf/baai/bge-base-en-v1.5'
      })

      const request = new Request('http://localhost/embeddings/models', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      // EmbeddingService should be called instead
      expect(result).toEqual({
        success: true,
        data: {
          models: mockModels,
          defaultModel: '@cf/baai/bge-base-en-v1.5'
        },
        message: '3個のモデルが利用可能です'
      })
    })

    it('should handle empty models list', async () => {
      mockEmbeddingService.getAvailableModels.mockResolvedValue({
        models: [],
        defaultModel: '@cf/baai/bge-base-en-v1.5'
      })

      const request = new Request('http://localhost/embeddings/models', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result).toEqual({
        success: true,
        data: {
          models: [],
          defaultModel: '@cf/baai/bge-base-en-v1.5'
        },
        message: '0個のモデルが利用可能です'
      })
    })

    it('should handle Durable Object errors', async () => {
      mockEmbeddingService.getAvailableModels.mockRejectedValue(new Error('Failed to fetch models'))

      const request = new Request('http://localhost/embeddings/models', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      // EmbeddingServiceがAppErrorをスローするため、エラーレスポンスの形式が異なる
      expect(result.success).toBe(false)
      expect(result.error).toBe('Internal Server Error')
      expect(result.message).toBe('Failed to fetch models')
    })

    it('should handle non-Error exceptions', async () => {
      mockEmbeddingService.getAvailableModels.mockRejectedValue('Unknown error')

      const request = new Request('http://localhost/embeddings/models', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      // EmbeddingServiceがエラーをラップするため、メッセージが異なる
      expect(result.success).toBe(false)
      expect(result.error).toBe('Internal Server Error')
      expect(result.message).toBe('モデル一覧取得中にエラーが発生しました')
    })

    it('should handle network timeouts', async () => {
      mockEmbeddingService.getAvailableModels.mockRejectedValue(new Error('Request timeout'))

      const request = new Request('http://localhost/embeddings/models', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('Request timeout')
    })

    it('should handle AppError with custom code', async () => {
      const { AppError } = await import('../../../../src/utils/error-handler')
      mockEmbeddingService.getAvailableModels.mockRejectedValue(
        new AppError('CUSTOM_ERROR', 'Custom error message', 500)
      )

      const request = new Request('http://localhost/embeddings/models', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error).toBe('CUSTOM_ERROR')
      expect(result.message).toBe('Custom error message')
    })
  })

  describe('GET /embeddings/models/{modelId}', () => {
    it('should get model details successfully', async () => {
      const mockModels = [
        {
          id: '@cf/baai/bge-base-en-v1.5',
          name: 'BAAI General Embedding Base EN v1.5',
          dimensions: 768,
          maxTokens: 512,
          supported: true
        },
        {
          id: '@cf/baai/bge-small-en-v1.5',
          name: 'BAAI General Embedding Small EN v1.5',
          dimensions: 384,
          maxTokens: 512,
          supported: true
        }
      ]

      mockEmbeddingService.getAvailableModels.mockResolvedValue({
        models: mockModels,
        defaultModel: '@cf/baai/bge-base-en-v1.5'
      })

      // URLエンコードしてパスパラメータを送信
      const modelId = encodeURIComponent('@cf/baai/bge-base-en-v1.5')
      const request = new Request(`http://localhost/embeddings/models/${modelId}`, {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.id).toBe('@cf/baai/bge-base-en-v1.5')
      expect(result.data.name).toBe('BAAI General Embedding Base EN v1.5')
      expect(result.data.description).toContain('BAAI BGE Base')
      expect(result.data.performance).toEqual({ speed: 'medium', quality: 'medium' })
      expect(result.message).toContain('モデル @cf/baai/bge-base-en-v1.5 の詳細情報')
    })

    it('should return 404 for non-existent model', async () => {
      const mockModels = [
        {
          id: '@cf/baai/bge-base-en-v1.5',
          name: 'BAAI General Embedding Base EN v1.5',
          dimensions: 768,
          maxTokens: 512,
          supported: true
        }
      ]

      mockEmbeddingService.getAvailableModels.mockResolvedValue({
        models: mockModels,
        defaultModel: '@cf/baai/bge-base-en-v1.5'
      })

      const request = new Request('http://localhost/embeddings/models/' + encodeURIComponent('non-existent-model'), {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(result.success).toBe(false)
      expect(result.error).toBe('MODEL_NOT_FOUND')
      expect(result.message).toContain('Model not found: non-existent-model')
    })

    it('should handle embedding service errors', async () => {
      mockAIEmbeddings.getAvailableModels.mockRejectedValue(new Error('Service unavailable'))

      const request = new Request('http://localhost/embeddings/models/' + encodeURIComponent('@cf/baai/bge-base-en-v1.5'), {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Internal Server Error')
    })

    it('should handle AppError with MODEL_NOT_FOUND in getModelDetails', async () => {
      const { AppError } = await import('../../../../src/utils/error-handler')
      mockEmbeddingService.getAvailableModels.mockRejectedValue(
        new AppError('MODEL_NOT_FOUND', 'Model not found: test-model', 404)
      )

      const request = new Request('http://localhost/embeddings/models/test-model', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(result.success).toBe(false)
      expect(result.error).toBe('MODEL_NOT_FOUND')
      expect(result.message).toBe('Model not found: test-model')
    })

    it('should handle AppError with custom error code in getModelDetails', async () => {
      const { AppError } = await import('../../../../src/utils/error-handler')
      mockEmbeddingService.getAvailableModels.mockRejectedValue(
        new AppError('EMBEDDING_ERROR', 'Embedding service error', 500)
      )

      const request = new Request('http://localhost/embeddings/models/some-model', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error).toBe('EMBEDDING_ERROR')
      expect(result.message).toBe('Embedding service error')
    })

    it('should handle different model performance characteristics', async () => {
      const mockModels = [
        {
          id: 'text-embedding-3-large',
          name: 'OpenAI Embedding v3 Large',
          dimensions: 3072,
          maxTokens: 8192,
          supported: true
        }
      ]

      mockEmbeddingService.getAvailableModels.mockResolvedValue({
        models: mockModels,
        defaultModel: '@cf/baai/bge-base-en-v1.5'
      })

      const request = new Request('http://localhost/embeddings/models/' + encodeURIComponent('text-embedding-3-large'), {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.performance).toEqual({ speed: 'slow', quality: 'high' })
      expect(result.data.description).toContain('OpenAI Embedding v3 Large')
    })

    it('should handle non-Error exceptions in model details', async () => {
      mockEmbeddingService.getAvailableModels.mockRejectedValue('Unknown error string')

      const request = new Request('http://localhost/embeddings/models/' + encodeURIComponent('@cf/baai/bge-base-en-v1.5'), {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Internal Server Error')
      expect(result.message).toBe('モデル詳細取得中にエラーが発生しました')
    })

    it('should return default description for unknown models', async () => {
      const mockModels = [
        {
          id: 'custom-model',
          name: 'Custom Model',
          dimensions: 512,
          maxTokens: 256,
          supported: true
        }
      ]

      mockEmbeddingService.getAvailableModels.mockResolvedValue({
        models: mockModels,
        defaultModel: '@cf/baai/bge-base-en-v1.5'
      })

      const request = new Request('http://localhost/embeddings/models/' + encodeURIComponent('custom-model'), {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.description).toBe('埋め込みモデル')
      expect(result.data.performance).toEqual({ speed: 'medium', quality: 'medium' })
    })
  })
})