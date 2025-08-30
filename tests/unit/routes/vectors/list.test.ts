import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { listVectorsRoute, listVectorsHandler } from '../../../../src/routes/api/vectors/list'

// Mock Vector Manager Durable Object
const mockVectorManager = {
  listVectors: vi.fn()
}

// Mock Durable Object namespace
const mockVectorCacheNamespace = {
  idFromName: vi.fn().mockReturnValue('mock-id'),
  get: vi.fn().mockReturnValue(mockVectorManager)
}

describe('List Vectors Route', () => {
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
      VECTOR_CACHE: mockVectorCacheNamespace as any,
      NOTION_MANAGER: {} as any,
      AI_EMBEDDINGS: {} as any,
      DB: {} as any,
      EMBEDDINGS_WORKFLOW: {} as any,
      BATCH_EMBEDDINGS_WORKFLOW: {} as any,
      VECTOR_OPERATIONS_WORKFLOW: {} as any,
      FILE_PROCESSING_WORKFLOW: {} as any,
      NOTION_SYNC_WORKFLOW: {} as any
    }

    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi(listVectorsRoute, listVectorsHandler)
  })

  describe('GET /vectors', () => {
    it('should list vectors successfully with default parameters', async () => {
      const mockResult = {
        vectors: [
          { id: 'vec-1', values: [0.1, 0.2], metadata: {} },
          { id: 'vec-2', values: [0.3, 0.4], metadata: {} }
        ],
        count: 2,
        nextCursor: 'next-page'
      }

      mockVectorManager.listVectors.mockResolvedValue(mockResult)

      const request = new Request('http://localhost/vectors', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockVectorManager.listVectors).toHaveBeenCalledWith({
        namespace: undefined,
        limit: 10,
        cursor: undefined
      })
      expect(result).toEqual({
        success: true,
        data: mockResult.vectors,
        count: 2,
        cursor: 'next-page',
        message: 'ベクトル一覧を取得しました'
      })
    })

    it('should handle namespace parameter', async () => {
      const mockResult = {
        vectors: [],
        count: 0
      }

      mockVectorManager.listVectors.mockResolvedValue(mockResult)

      const request = new Request('http://localhost/vectors?namespace=test-namespace', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockVectorManager.listVectors).toHaveBeenCalledWith({
        namespace: 'test-namespace',
        limit: 10,
        cursor: undefined
      })
      expect(result.success).toBe(true)
    })

    it('should handle limit parameter', async () => {
      const mockResult = {
        vectors: [],
        count: 0
      }

      mockVectorManager.listVectors.mockResolvedValue(mockResult)

      const request = new Request('http://localhost/vectors?limit=50', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockVectorManager.listVectors).toHaveBeenCalledWith({
        namespace: undefined,
        limit: 50,
        cursor: undefined
      })
      expect(result.success).toBe(true)
    })

    it('should handle cursor parameter', async () => {
      const mockResult = {
        vectors: [],
        count: 0,
        nextCursor: 'another-page'
      }

      mockVectorManager.listVectors.mockResolvedValue(mockResult)

      const request = new Request('http://localhost/vectors?cursor=next-page-token', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockVectorManager.listVectors).toHaveBeenCalledWith({
        namespace: undefined,
        limit: 10,
        cursor: 'next-page-token'
      })
      expect(result.cursor).toBe('another-page')
    })

    it('should handle all parameters combined', async () => {
      const mockResult = {
        vectors: [],
        count: 0
      }

      mockVectorManager.listVectors.mockResolvedValue(mockResult)

      const request = new Request('http://localhost/vectors?namespace=test&limit=25&cursor=abc123', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockVectorManager.listVectors).toHaveBeenCalledWith({
        namespace: 'test',
        limit: 25,
        cursor: 'abc123'
      })
      expect(result.success).toBe(true)
    })

    it('should validate limit parameter (too high)', async () => {
      const request = new Request('http://localhost/vectors?limit=200', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should validate limit parameter (too low)', async () => {
      const request = new Request('http://localhost/vectors?limit=0', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should validate limit parameter (non-numeric)', async () => {
      const request = new Request('http://localhost/vectors?limit=invalid', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should handle Durable Object errors', async () => {
      mockVectorManager.listVectors.mockRejectedValue(new Error('List vectors failed'))

      const request = new Request('http://localhost/vectors', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'List vectors failed'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockVectorManager.listVectors.mockRejectedValue('String error')

      const request = new Request('http://localhost/vectors', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('ベクトル一覧の取得中にエラーが発生しました')
    })

    it('should handle empty result', async () => {
      mockVectorManager.listVectors.mockResolvedValue({})

      const request = new Request('http://localhost/vectors', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result).toEqual({
        success: true,
        data: [],
        count: 0,
        cursor: undefined,
        message: 'ベクトル一覧を取得しました'
      })
    })
  })
})