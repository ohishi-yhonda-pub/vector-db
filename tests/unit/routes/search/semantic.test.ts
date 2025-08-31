import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { 
  semanticSearchRoute, 
  semanticSearchHandler,
  semanticSearchPostRoute,
  semanticSearchPostHandler
} from '../../../../src/routes/api/search/semantic'
import { VectorizeService } from '../../../../src/services'

// Mock VectorizeService and SearchService
const mockVectorizeQuery = vi.fn()
const mockSearchByText = vi.fn()

vi.mock('../../../../src/services', () => ({
  VectorizeService: vi.fn(() => ({
    query: mockVectorizeQuery
  }))
}))

vi.mock('../../../../src/routes/api/search/search-service', () => ({
  SearchService: vi.fn(() => ({
    searchByText: mockSearchByText
  }))
}))

describe('Semantic Search Route', () => {
  let app: OpenAPIHono<{ Bindings: Env }>
  let mockEnv: Env

  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchByText.mockReset()
    
    // Mock AI.run for embeddings
    const mockAIRun = vi.fn()
    
    mockEnv = {
      ENVIRONMENT: 'development' as const,
      DEFAULT_EMBEDDING_MODEL: 'test-model',
      DEFAULT_TEXT_GENERATION_MODEL: '@cf/meta/llama-3.1-8b-instruct',
      IMAGE_ANALYSIS_PROMPT: 'test-prompt',
      IMAGE_ANALYSIS_MAX_TOKENS: '1000',
      TEXT_EXTRACTION_MAX_TOKENS: '4000',
      NOTION_API_KEY: 'test-key',
      AI: {
        run: mockAIRun
      } as any,
      VECTORIZE_INDEX: {
        query: mockVectorizeQuery
      } as any,
      VECTOR_CACHE: {} as any,
      NOTION_MANAGER: {} as any,
      AI_EMBEDDINGS: {} as any,
      DB: {} as any,
      BATCH_EMBEDDINGS_WORKFLOW: {} as any,
      VECTOR_OPERATIONS_WORKFLOW: {} as any,
      FILE_PROCESSING_WORKFLOW: {} as any,
      NOTION_SYNC_WORKFLOW: {} as any,
      EMBEDDINGS_WORKFLOW: {} as any
    }

    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi(semanticSearchRoute, semanticSearchHandler)
    app.openapi(semanticSearchPostRoute, semanticSearchPostHandler)
  })

  describe('GET /search/semantic', () => {
    it('should perform semantic search successfully', async () => {
      const mockSearchResults = [
        { id: 'match-1', score: 0.95, metadata: { title: 'Test 1' } },
        { id: 'match-2', score: 0.85, metadata: { title: 'Test 2' } }
      ]

      mockSearchByText.mockResolvedValue(mockSearchResults)

      const request = new Request('http://localhost/search/semantic?query=test+search+query&topK=5', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockSearchByText).toHaveBeenCalledWith('test search query', {
        topK: 5,
        namespace: undefined,
        includeMetadata: true,
        includeValues: false
      })
      expect(result).toEqual({
        success: true,
        data: {
          matches: mockSearchResults,
          query: 'test search query',
          namespace: undefined,
          processingTime: expect.any(Number)
        },
        message: '2件の結果が見つかりました'
      })
    })

    it('should handle search with namespace', async () => {
      const mockSearchResults = [
        { id: 'ns-match-1', score: 0.9, metadata: { source: 'namespace' } }
      ]

      mockSearchByText.mockResolvedValue(mockSearchResults)

      const request = new Request('http://localhost/search/semantic?query=namespace+search&namespace=test-namespace', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockSearchByText).toHaveBeenCalledWith('namespace search', {
        topK: 10,
        namespace: 'test-namespace',
        includeMetadata: true,
        includeValues: false
      })
      expect(result.data.namespace).toBe('test-namespace')
    })

    it('should use default topK when not provided', async () => {
      const mockSearchResults = []

      mockSearchByText.mockResolvedValue(mockSearchResults)

      const request = new Request('http://localhost/search/semantic?query=minimal+search', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockSearchByText).toHaveBeenCalledWith('minimal search', {
        topK: 10,
        namespace: undefined,
        includeMetadata: true,
        includeValues: false
      })
      expect(result.message).toBe('0件の結果が見つかりました')
    })

    it('should validate required query parameter', async () => {
      const request = new Request('http://localhost/search/semantic', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should validate topK range (too high)', async () => {
      const request = new Request('http://localhost/search/semantic?query=test&topK=150', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should validate topK range (too low)', async () => {
      const request = new Request('http://localhost/search/semantic?query=test&topK=0', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should validate topK is numeric', async () => {
      const request = new Request('http://localhost/search/semantic?query=test&topK=invalid', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should handle AI embedding generation failure', async () => {
      mockSearchByText.mockRejectedValue(new Error('Failed to generate embedding for query'))

      const request = new Request('http://localhost/search/semantic?query=test+query', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.message).toBe('Failed to generate embedding for query')
    })

    it('should handle AI run without data property', async () => {
      mockSearchByText.mockRejectedValue(new Error('Failed to generate embedding for query'))

      const request = new Request('http://localhost/search/semantic?query=test+query', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('Failed to generate embedding for query')
    })

    it('should handle vectorize query errors', async () => {
      mockSearchByText.mockRejectedValue(new Error('Vectorize search failed'))

      const request = new Request('http://localhost/search/semantic?query=error+test', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.message).toBe('Vectorize search failed')
    })

    it('should handle non-Error exceptions', async () => {
      mockSearchByText.mockRejectedValue('String error')

      const request = new Request('http://localhost/search/semantic?query=non-error+test', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('検索中にエラーが発生しました')
    })

    it('should handle empty search results', async () => {
      mockSearchByText.mockResolvedValue([])

      const request = new Request('http://localhost/search/semantic?query=no+results', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.matches).toEqual([])
      expect(result.message).toBe('0件の結果が見つかりました')
    })

    it('should handle special characters in query', async () => {
      const mockSearchResults = [
        { id: 'special-1', score: 0.88, metadata: { special: true } }
      ]

      mockSearchByText.mockResolvedValue(mockSearchResults)

      const request = new Request('http://localhost/search/semantic?query=special%26chars%2Btest', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockSearchByText).toHaveBeenCalledWith('special&chars+test', {
        topK: 10,
        namespace: undefined,
        includeMetadata: true,
        includeValues: false
      })
      expect(result.data.query).toBe('special&chars+test')
    })
  })

  describe('POST /search/semantic', () => {
    it('should perform semantic search successfully with POST', async () => {
      const mockSearchResults = [
        { id: 'post-match-1', score: 0.92, metadata: { title: 'POST Test 1' } },
        { id: 'post-match-2', score: 0.82, metadata: { title: 'POST Test 2' } }
      ]

      mockSearchByText.mockResolvedValue(mockSearchResults)

      const request = new Request('http://localhost/search/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'test post search query',
          topK: 8,
          namespace: 'test-namespace'
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockSearchByText).toHaveBeenCalledWith('test post search query', {
        topK: 8,
        namespace: 'test-namespace',
        includeMetadata: true,
        includeValues: false
      })
      expect(result).toEqual({
        success: true,
        data: {
          matches: mockSearchResults,
          query: 'test post search query',
          namespace: 'test-namespace',
          processingTime: expect.any(Number)
        },
        message: '2件の結果が見つかりました'
      })
    })

    it('should handle POST request without namespace', async () => {
      const mockSearchResults = []

      mockSearchByText.mockResolvedValue(mockSearchResults)

      const request = new Request('http://localhost/search/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'simple post query'
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockSearchByText).toHaveBeenCalledWith('simple post query', {
        topK: 10,
        namespace: undefined,
        includeMetadata: true,
        includeValues: false
      })
      expect(result.message).toBe('0件の結果が見つかりました')
    })

    it('should validate required query in POST body', async () => {
      const request = new Request('http://localhost/search/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topK: 5
        })
      })

      const response = await app.fetch(request, mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should handle AI error in POST request', async () => {
      mockSearchByText.mockRejectedValue(new Error('AI service error'))

      const request = new Request('http://localhost/search/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'error test query'
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.message).toBe('AI service error')
    })

    it('should handle vectorize error in POST request', async () => {
      mockSearchByText.mockRejectedValue(new Error('Vectorize error'))

      const request = new Request('http://localhost/search/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'vectorize error test'
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.success).toBe(false)
      expect(result.message).toBe('Vectorize error')
    })

    it('should validate topK range in POST body', async () => {
      const request = new Request('http://localhost/search/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'test',
          topK: 200
        })
      })

      const response = await app.fetch(request, mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should handle invalid JSON in POST body', async () => {
      const request = new Request('http://localhost/search/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      })

      const response = await app.fetch(request, mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should handle non-string query in POST body', async () => {
      const request = new Request('http://localhost/search/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 123
        })
      })

      const response = await app.fetch(request, mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should handle AppError with custom status code in POST', async () => {
      const { AppError } = await import('../../../../src/utils/error-handler')
      
      mockSearchByText.mockRejectedValue(
        new AppError('SEARCH_ERROR', 'Custom search error', 403)
      )

      const request = new Request('http://localhost/search/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'app error test'
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(403)
      expect(result.success).toBe(false)
      expect(result.error).toBe('SEARCH_ERROR')
      expect(result.message).toBe('Custom search error')
    })

    it('should handle non-Error exception in POST', async () => {
      mockSearchByText.mockRejectedValue('String error')

      const request = new Request('http://localhost/search/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'non-error test'
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('検索中にエラーが発生しました')
    })
  })
})