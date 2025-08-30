import { describe, it, expect, vi, beforeEach } from 'vitest'
import { semanticSearchRoute, semanticSearchHandler } from '../../../../src/routes/api/search/semantic'
import { VectorizeService } from '../../../../src/services'
import { setupSearchRouteTest } from '../../test-helpers/test-scenarios'

// Mock VectorizeService
const mockVectorizeQuery = vi.fn()
vi.mock('../../../../src/services', () => ({
  VectorizeService: vi.fn(() => ({
    query: mockVectorizeQuery
  }))
}))

describe('Semantic Search Route', () => {
  let testSetup: ReturnType<typeof setupSearchRouteTest>

  beforeEach(() => {
    vi.clearAllMocks()
    
    testSetup = setupSearchRouteTest()
    
    // Add AI.run mock for embeddings
    const mockAIRun = vi.fn()
    testSetup.mockEnv.AI = {
      run: mockAIRun
    } as any
    
    // Override the VECTORIZE_INDEX query to use our mock
    testSetup.mockVectorizeIndex.query = mockVectorizeQuery
    
    testSetup.app.openapi(semanticSearchRoute, semanticSearchHandler)
  })

  describe('GET /search/semantic', () => {
    it('should perform semantic search successfully', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4]
      const mockSearchResults = {
        matches: [
          { id: 'match-1', score: 0.95, metadata: { title: 'Test 1' } },
          { id: 'match-2', score: 0.85, metadata: { title: 'Test 2' } }
        ]
      }

      ;(testSetup.mockEnv.AI.run as any).mockResolvedValue({
        data: [mockEmbedding]
      })
      mockVectorizeQuery.mockResolvedValue(mockSearchResults)

      const request = new Request('http://localhost/search/semantic?query=test+search+query&topK=5', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(testSetup.mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', { text: 'test search query' })
      expect(mockVectorizeQuery).toHaveBeenCalledWith(mockEmbedding, {
        topK: 5,
        namespace: undefined,
        returnMetadata: true
      })
      expect(result).toEqual({
        success: true,
        data: {
          matches: [
            { id: 'match-1', score: 0.95, metadata: { title: 'Test 1' } },
            { id: 'match-2', score: 0.85, metadata: { title: 'Test 2' } }
          ],
          query: 'test search query',
          namespace: undefined,
          processingTime: expect.any(Number)
        },
        message: '2件の結果が見つかりました'
      })
    })

    it('should handle search with namespace', async () => {
      const mockEmbedding = [0.5, 0.6, 0.7, 0.8]
      const mockSearchResults = {
        matches: [
          { id: 'ns-match-1', score: 0.9, metadata: { source: 'namespace' } }
        ]
      }

      ;(testSetup.mockEnv.AI.run as any).mockResolvedValue({
        data: [mockEmbedding]
      })
      mockVectorizeQuery.mockResolvedValue(mockSearchResults)

      const request = new Request('http://localhost/search/semantic?query=namespace+search&namespace=test-namespace', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockVectorizeQuery).toHaveBeenCalledWith(mockEmbedding, {
        topK: 10,
        namespace: 'test-namespace',
        returnMetadata: true
      })
      expect(result.data.namespace).toBe('test-namespace')
    })

    it('should use default topK when not provided', async () => {
      const mockEmbedding = [0.1, 0.2]
      const mockSearchResults = { matches: [] }

      ;(testSetup.mockEnv.AI.run as any).mockResolvedValue({
        data: [mockEmbedding]
      })
      mockVectorizeQuery.mockResolvedValue(mockSearchResults)

      const request = new Request('http://localhost/search/semantic?query=minimal+search', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockVectorizeQuery).toHaveBeenCalledWith(mockEmbedding, {
        topK: 10,
        namespace: undefined,
        returnMetadata: true
      })
      expect(result.message).toBe('0件の結果が見つかりました')
    })

    it('should validate required query parameter', async () => {
      const request = new Request('http://localhost/search/semantic', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should validate topK range (too high)', async () => {
      const request = new Request('http://localhost/search/semantic?query=test&topK=150', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should validate topK range (too low)', async () => {
      const request = new Request('http://localhost/search/semantic?query=test&topK=0', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should validate topK is numeric', async () => {
      const request = new Request('http://localhost/search/semantic?query=test&topK=invalid', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should handle AI embedding generation failure', async () => {
      ;(testSetup.mockEnv.AI.run as any).mockResolvedValue({
        data: []
      })

      const request = new Request('http://localhost/search/semantic?query=test+query', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to generate embedding for query'
      })
    })

    it('should handle AI run without data property', async () => {
      ;(testSetup.mockEnv.AI.run as any).mockResolvedValue({
        error: 'AI error'
      })

      const request = new Request('http://localhost/search/semantic?query=test+query', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('Failed to generate embedding for query')
    })

    it('should handle vectorize query errors', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3]

      ;(testSetup.mockEnv.AI.run as any).mockResolvedValue({
        data: [mockEmbedding]
      })
      mockVectorizeQuery.mockRejectedValue(new Error('Vectorize search failed'))

      const request = new Request('http://localhost/search/semantic?query=error+test', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Vectorize search failed'
      })
    })

    it('should handle non-Error exceptions', async () => {
      const mockEmbedding = [0.1, 0.2]

      ;(testSetup.mockEnv.AI.run as any).mockResolvedValue({
        data: [mockEmbedding]
      })
      mockVectorizeQuery.mockRejectedValue('String error')

      const request = new Request('http://localhost/search/semantic?query=non-error+test', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('検索中にエラーが発生しました')
    })

    it('should handle empty search results', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3]

      ;(testSetup.mockEnv.AI.run as any).mockResolvedValue({
        data: [mockEmbedding]
      })
      mockVectorizeQuery.mockResolvedValue({ matches: [] })

      const request = new Request('http://localhost/search/semantic?query=no+results', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.matches).toEqual([])
      expect(result.message).toBe('0件の結果が見つかりました')
    })

    it('should handle special characters in query', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3]
      const mockSearchResults = {
        matches: [
          { id: 'special-1', score: 0.88, metadata: { special: true } }
        ]
      }

      ;(testSetup.mockEnv.AI.run as any).mockResolvedValue({
        data: [mockEmbedding]
      })
      mockVectorizeQuery.mockResolvedValue(mockSearchResults)

      const request = new Request('http://localhost/search/semantic?query=special%26chars%2Btest', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(testSetup.mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', { text: 'special&chars+test' })
      expect(result.data.query).toBe('special&chars+test')
    })
  })
})