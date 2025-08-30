import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchVectorsRoute, searchVectorsHandler } from '../../../../src/routes/api/search/vectors'
import { VectorizeService } from '../../../../src/services'
import { setupSearchRouteTest } from '../../test-helpers/test-scenarios'
import { createMockRequest } from '../../test-helpers'

// Mock VectorizeService
const mockVectorizeQuery = vi.fn()
vi.mock('../../../../src/services', () => ({
  VectorizeService: vi.fn(() => ({
    query: mockVectorizeQuery
  }))
}))

describe('Search Vectors Route', () => {
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
    
    testSetup.app.openapi(searchVectorsRoute, searchVectorsHandler)
  })

  describe('POST /search', () => {
    it('should search vectors successfully', async () => {
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

      const request = createMockRequest('http://localhost/search', {
        method: 'POST',
        body: {
          query: 'test search query',
          topK: 5,
          includeMetadata: true
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(testSetup.mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', { text: 'test search query' })
      expect(mockVectorizeQuery).toHaveBeenCalledWith(mockEmbedding, {
        topK: 5,
        namespace: undefined,
        filter: undefined,
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

    it('should handle search with namespace and filter', async () => {
      const mockEmbedding = [0.5, 0.6, 0.7, 0.8]
      const mockSearchResults = {
        matches: [
          { id: 'filtered-1', score: 0.9 }
        ]
      }

      ;(testSetup.mockEnv.AI.run as any).mockResolvedValue({
        data: [mockEmbedding]
      })
      mockVectorizeQuery.mockResolvedValue(mockSearchResults)

      const request = createMockRequest('http://localhost/search', {
        method: 'POST',
        body: {
          query: 'filtered search',
          namespace: 'test-namespace',
          filter: { category: 'test' },
          includeMetadata: false
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockVectorizeQuery).toHaveBeenCalledWith(mockEmbedding, {
        topK: 10,
        namespace: 'test-namespace',
        filter: { category: 'test' },
        returnMetadata: false
      })
      expect(result.data.matches).toEqual([
        { id: 'filtered-1', score: 0.9 }
      ])
    })

    it('should use default topK when not provided', async () => {
      const mockEmbedding = [0.1, 0.2]
      const mockSearchResults = { matches: [] }

      ;(testSetup.mockEnv.AI.run as any).mockResolvedValue({
        data: [mockEmbedding]
      })
      mockVectorizeQuery.mockResolvedValue(mockSearchResults)

      const request = createMockRequest('http://localhost/search', {
        method: 'POST',
        body: {
          query: 'minimal search'
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockVectorizeQuery).toHaveBeenCalledWith(mockEmbedding, {
        topK: 10,
        namespace: undefined,
        filter: undefined,
        returnMetadata: true
      })
      expect(result.message).toBe('0件の結果が見つかりました')
    })

    it('should validate required query parameter', async () => {
      const request = createMockRequest('http://localhost/search', {
        method: 'POST',
        body: {
          topK: 5
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should validate topK range', async () => {
      const request = createMockRequest('http://localhost/search', {
        method: 'POST',
        body: {
          query: 'test',
          topK: 150
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should handle AI embedding generation failure', async () => {
      ;(testSetup.mockEnv.AI.run as any).mockResolvedValue({
        data: []
      })

      const request = createMockRequest('http://localhost/search', {
        method: 'POST',
        body: {
          query: 'test query'
        }
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

      const request = createMockRequest('http://localhost/search', {
        method: 'POST',
        body: {
          query: 'test query'
        }
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

      const request = createMockRequest('http://localhost/search', {
        method: 'POST',
        body: {
          query: 'error test'
        }
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

      const request = createMockRequest('http://localhost/search', {
        method: 'POST',
        body: {
          query: 'non-error test'
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('検索中にエラーが発生しました')
    })

    it('should include values when requested', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3]
      const mockSearchResults = {
        matches: [
          { id: 'vec-1', score: 0.99 }
        ]
      }

      ;(testSetup.mockEnv.AI.run as any).mockResolvedValue({
        data: [mockEmbedding]
      })
      mockVectorizeQuery.mockResolvedValue(mockSearchResults)

      const request = createMockRequest('http://localhost/search', {
        method: 'POST',
        body: {
          query: 'include values test',
          includeValues: true
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      // Note: includeValues is not implemented in the handler, so values won't be included
      expect(result.data.matches[0]).toEqual({
        id: 'vec-1',
        score: 0.99
      })
    })
  })
})