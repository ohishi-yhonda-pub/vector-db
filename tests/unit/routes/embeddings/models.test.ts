import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { listModelsRoute, listModelsHandler } from '../../../../src/routes/api/embeddings/models'

// Mock AI Embeddings Durable Object
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

  beforeEach(() => {
    vi.clearAllMocks()
    
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
    app.openapi(listModelsRoute, listModelsHandler)
  })

  describe('GET /embeddings/models', () => {
    it('should list available models successfully', async () => {
      const mockModels = [
        {
          name: '@cf/baai/bge-base-en-v1.5',
          description: 'BAAI General Embedding Base EN v1.5',
          dimensions: 768,
          maxTokens: 512,
          recommended: true
        },
        {
          name: '@cf/baai/bge-small-en-v1.5',
          description: 'BAAI General Embedding Small EN v1.5',
          dimensions: 384,
          maxTokens: 512,
          recommended: false
        },
        {
          name: '@cf/baai/bge-large-en-v1.5',
          description: 'BAAI General Embedding Large EN v1.5',
          dimensions: 1024,
          maxTokens: 512,
          recommended: false
        }
      ]

      mockAIEmbeddings.getAvailableModels.mockResolvedValue(mockModels)

      const request = new Request('http://localhost/embeddings/models', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockAIEmbeddings.getAvailableModels).toHaveBeenCalled()
      expect(result).toEqual({
        success: true,
        data: mockModels
      })
    })

    it('should handle empty models list', async () => {
      mockAIEmbeddings.getAvailableModels.mockResolvedValue([])

      const request = new Request('http://localhost/embeddings/models', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result).toEqual({
        success: true,
        data: []
      })
    })

    it('should handle Durable Object errors', async () => {
      mockAIEmbeddings.getAvailableModels.mockRejectedValue(new Error('Failed to fetch models'))

      const request = new Request('http://localhost/embeddings/models', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to fetch models'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockAIEmbeddings.getAvailableModels.mockRejectedValue('Unknown error')

      const request = new Request('http://localhost/embeddings/models', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'モデル一覧の取得中にエラーが発生しました'
      })
    })

    it('should handle network timeouts', async () => {
      mockAIEmbeddings.getAvailableModels.mockRejectedValue(new Error('Request timeout'))

      const request = new Request('http://localhost/embeddings/models', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('Request timeout')
    })
  })
})