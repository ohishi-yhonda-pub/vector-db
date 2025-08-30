import { describe, it, expect, vi, beforeEach } from 'vitest'
import { similarSearchRoute, similarSearchHandler } from '../../../../src/routes/api/search/similar'
import { VectorizeService } from '../../../../src/services'
import { setupSearchRouteTest } from '../../test-helpers/test-scenarios'
import { createMockRequest } from '../../test-helpers'

// Mock VectorizeService
const mockFindSimilar = vi.fn()
const mockGetByIds = vi.fn()
vi.mock('../../../../src/services', () => ({
  VectorizeService: vi.fn(() => ({
    findSimilar: mockFindSimilar,
    getByIds: mockGetByIds
  }))
}))

describe('Similar Search Route', () => {
  let testSetup: ReturnType<typeof setupSearchRouteTest>

  beforeEach(() => {
    vi.clearAllMocks()
    
    testSetup = setupSearchRouteTest()
    testSetup.app.openapi(similarSearchRoute, similarSearchHandler)
  })

  describe('POST /search/similar', () => {
    it('should find similar vectors successfully', async () => {
      const mockSearchResults = {
        matches: [
          { id: 'similar-1', score: 0.98, metadata: { title: 'Similar 1' } },
          { id: 'similar-2', score: 0.92, metadata: { title: 'Similar 2' } }
        ]
      }

      mockFindSimilar.mockResolvedValue(mockSearchResults)

      const request = createMockRequest('http://localhost/search/similar', {
        method: 'POST',
        body: {
          vectorId: 'vec_123456',
          topK: 5
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockFindSimilar).toHaveBeenCalledWith('vec_123456', {
        topK: 5,
        namespace: undefined,
        excludeSelf: true,
        returnMetadata: true
      })
      expect(result).toEqual({
        success: true,
        data: {
          matches: [
            { id: 'similar-1', score: 0.98, metadata: { title: 'Similar 1' } },
            { id: 'similar-2', score: 0.92, metadata: { title: 'Similar 2' } }
          ],
          query: 'Similar to vec_123456',
          namespace: undefined,
          processingTime: expect.any(Number)
        },
        message: '2件の類似ベクトルが見つかりました'
      })
    })

    it('should handle namespace and excludeSelf parameters', async () => {
      const mockSearchResults = {
        matches: [
          { id: 'ns-similar-1', score: 0.95, metadata: { ns: 'test' } }
        ]
      }

      mockFindSimilar.mockResolvedValue(mockSearchResults)

      const request = createMockRequest('http://localhost/search/similar', {
        method: 'POST',
        body: {
          vectorId: 'vec_test',
          namespace: 'test-namespace',
          excludeSelf: false
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockFindSimilar).toHaveBeenCalledWith('vec_test', {
        topK: 10,
        namespace: 'test-namespace',
        excludeSelf: false,
        returnMetadata: true
      })
      expect(result.data.namespace).toBe('test-namespace')
    })

    it('should use default values when optional parameters are not provided', async () => {
      const mockSearchResults = {
        matches: []
      }

      mockFindSimilar.mockResolvedValue(mockSearchResults)

      const request = createMockRequest('http://localhost/search/similar', {
        method: 'POST',
        body: {
          vectorId: 'vec_minimal'
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockFindSimilar).toHaveBeenCalledWith('vec_minimal', {
        topK: 10,
        namespace: undefined,
        excludeSelf: true,
        returnMetadata: true
      })
      expect(result.message).toBe('0件の類似ベクトルが見つかりました')
    })

    it('should validate required vectorId parameter', async () => {
      const request = createMockRequest('http://localhost/search/similar', {
        method: 'POST',
        body: {
          topK: 5
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should validate empty vectorId', async () => {
      const request = createMockRequest('http://localhost/search/similar', {
        method: 'POST',
        body: {
          vectorId: ''
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should validate topK range (too high)', async () => {
      const request = createMockRequest('http://localhost/search/similar', {
        method: 'POST',
        body: {
          vectorId: 'vec_test',
          topK: 150
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should validate topK range (too low)', async () => {
      const request = createMockRequest('http://localhost/search/similar', {
        method: 'POST',
        body: {
          vectorId: 'vec_test',
          topK: 0
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      
      expect(response.status).toBe(400)
    })

    it('should handle vector not found error', async () => {
      mockFindSimilar.mockRejectedValue(new Error('Vector not found'))

      const request = createMockRequest('http://localhost/search/similar', {
        method: 'POST',
        body: {
          vectorId: 'vec_nonexistent'
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(result).toEqual({
        success: false,
        error: 'Not Found',
        message: 'Vector not found'
      })
    })

    it('should handle other errors', async () => {
      mockFindSimilar.mockRejectedValue(new Error('Search failed'))

      const request = createMockRequest('http://localhost/search/similar', {
        method: 'POST',
        body: {
          vectorId: 'vec_error'
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Search failed'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockFindSimilar.mockRejectedValue('String error')

      const request = createMockRequest('http://localhost/search/similar', {
        method: 'POST',
        body: {
          vectorId: 'vec_unknown'
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('類似検索中にエラーが発生しました')
    })

    it('should handle empty search results', async () => {
      mockFindSimilar.mockResolvedValue({ matches: [] })

      const request = createMockRequest('http://localhost/search/similar', {
        method: 'POST',
        body: {
          vectorId: 'vec_no_similar'
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.matches).toEqual([])
      expect(result.message).toBe('0件の類似ベクトルが見つかりました')
    })

    it('should handle special characters in vectorId', async () => {
      const mockSearchResults = {
        matches: [
          { id: 'special-match', score: 0.89, metadata: {} }
        ]
      }

      mockFindSimilar.mockResolvedValue(mockSearchResults)

      const request = createMockRequest('http://localhost/search/similar', {
        method: 'POST',
        body: {
          vectorId: 'vec_special-chars_123'
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockFindSimilar).toHaveBeenCalledWith('vec_special-chars_123', expect.any(Object))
      expect(result.data.query).toBe('Similar to vec_special-chars_123')
    })
  })
})