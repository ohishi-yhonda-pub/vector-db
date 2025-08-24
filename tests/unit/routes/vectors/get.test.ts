import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { getVectorRoute, getVectorHandler } from '../../../../src/routes/api/vectors/get'

// Mock VectorizeService
vi.mock('../../../../src/services', () => ({
  VectorizeService: vi.fn().mockImplementation(() => ({
    getByIds: vi.fn()
  }))
}))

import { VectorizeService } from '../../../../src/services'

describe('Get Vector Route', () => {
  let app: OpenAPIHono<{ Bindings: Env }>
  let mockEnv: Env
  let mockGetByIds: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockEnv = {
      ENVIRONMENT: 'development' as const,
      DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
      DEFAULT_TEXT_GENERATION_MODEL: '@cf/google/gemma-3-12b-it',
      IMAGE_ANALYSIS_PROMPT: 'Describe this image',
      IMAGE_ANALYSIS_MAX_TOKENS: '512',
      TEXT_EXTRACTION_MAX_TOKENS: '1024',
      NOTION_API_KEY: 'test-key',
      AI: {} as any,
      VECTORIZE_INDEX: {} as any,
      VECTOR_CACHE: {} as any,
      NOTION_MANAGER: {} as any,
      AI_EMBEDDINGS: {} as any,
      DB: {} as any,
      BATCH_EMBEDDINGS_WORKFLOW: {} as any,
      VECTOR_OPERATIONS_WORKFLOW: {} as any,
      FILE_PROCESSING_WORKFLOW: {} as any,
      NOTION_SYNC_WORKFLOW: {} as any
    }

    // Get mock instance
    mockGetByIds = vi.fn()
    vi.mocked(VectorizeService).mockImplementation(() => ({
      getByIds: mockGetByIds
    } as any))

    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi(getVectorRoute, getVectorHandler)
  })

  describe('GET /vectors/{id}', () => {
    it('should get vector successfully', async () => {
      const mockVector = {
        id: 'vector-123',
        values: [0.1, 0.2, 0.3],
        metadata: {
          text: 'Original text',
          category: 'test'
        },
        namespace: 'default'
      }

      mockGetByIds.mockResolvedValue([mockVector])

      const request = new Request('http://localhost/vectors/vector-123', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockGetByIds).toHaveBeenCalledWith(['vector-123'])
      expect(result).toEqual({
        success: true,
        data: mockVector,
        message: 'ベクトルが見つかりました'
      })
    })

    it('should return 404 for non-existent vector', async () => {
      mockGetByIds.mockResolvedValue([])

      const request = new Request('http://localhost/vectors/non-existent', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(result).toEqual({
        success: false,
        error: 'Not Found',
        message: 'ベクトル non-existent が見つかりません'
      })
    })

    it('should return 404 when getByIds returns null', async () => {
      mockGetByIds.mockResolvedValue(null)

      const request = new Request('http://localhost/vectors/vector-null', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(result.error).toBe('Not Found')
    })

    it('should handle service errors', async () => {
      mockGetByIds.mockRejectedValue(new Error('Vectorize service error'))

      const request = new Request('http://localhost/vectors/vector-error', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Vectorize service error'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockGetByIds.mockRejectedValue('Unknown error')

      const request = new Request('http://localhost/vectors/vector-unknown', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('ベクトル取得中にエラーが発生しました')
    })

    it('should validate id parameter', async () => {
      const request = new Request('http://localhost/vectors/', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      
      expect(response.status).toBe(404) // Route not found
    })
  })
})