import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getVectorRoute, getVectorHandler } from '../../../../src/routes/api/vectors/get'
import { setupVectorRouteTest, TestVectors } from '../../test-helpers'

// Mock VectorizeService
const mockGetByIds = vi.fn()

vi.mock('../../../../src/services', () => ({
  VectorizeService: vi.fn(() => ({
    getByIds: mockGetByIds
  }))
}))

describe('Get Vector Route', () => {
  let testSetup: ReturnType<typeof setupVectorRouteTest>

  beforeEach(() => {
    vi.clearAllMocks()
    testSetup = setupVectorRouteTest()
    
    // Override the VECTORIZE_INDEX with our mock
    testSetup.mockEnv.VECTORIZE_INDEX = {
      getByIds: mockGetByIds
    } as any
    
    testSetup.app.openapi(getVectorRoute, getVectorHandler)
  })

  describe('GET /vectors/{id}', () => {
    it('should get vector successfully', async () => {
      const mockVector = {
        ...TestVectors.withEmbedding,
        id: 'test-vector-123'
      }

      mockGetByIds.mockResolvedValue([mockVector])

      const request = new Request('http://localhost/vectors/test-vector-123', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockGetByIds).toHaveBeenCalledWith(['test-vector-123'])
      expect(result).toEqual({
        success: true,
        data: mockVector,
        message: 'ベクトルが見つかりました'
      })
    })

    it('should return 404 when vector not found', async () => {
      mockGetByIds.mockResolvedValue([])

      const request = new Request('http://localhost/vectors/non-existent', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(result).toEqual({
        success: false,
        code: 'NOT_FOUND',
        error: 'ベクトル non-existent が見つかりません not found'
      })
    })

    it('should handle special characters in vector ID', async () => {
      const specialId = 'test-vector-!@#$%'
      const mockVector = {
        ...TestVectors.simple,
        id: specialId
      }

      mockGetByIds.mockResolvedValue([mockVector])

      const encodedId = encodeURIComponent(specialId)
      const request = new Request(`http://localhost/vectors/${encodedId}`, {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockGetByIds).toHaveBeenCalledWith([specialId])
      expect(result.data.id).toBe(specialId)
    })

    it('should handle VectorizeService errors', async () => {
      mockGetByIds.mockRejectedValue(new Error('Vectorize service error'))

      const request = new Request('http://localhost/vectors/test-id', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'VECTORIZE_ERROR',
        message: 'Vectorize service error',
        path: '/vectors/test-id',
        timestamp: expect.any(String)
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockGetByIds.mockRejectedValue('String error')

      const request = new Request('http://localhost/vectors/test-id', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('An unexpected error occurred')
    })

    it('should handle vector with metadata', async () => {
      const mockVector = {
        ...TestVectors.withEmbedding,
        id: 'vector-with-metadata',
        metadata: {
          source: 'test-source',
          timestamp: '2024-01-01T00:00:00Z',
          tags: ['tag1', 'tag2']
        }
      }

      mockGetByIds.mockResolvedValue([mockVector])

      const request = new Request('http://localhost/vectors/vector-with-metadata', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.metadata).toEqual(mockVector.metadata)
    })

    it('should handle vector without metadata', async () => {
      const mockVector = {
        id: 'simple-vector',
        values: [0.1, 0.2, 0.3]
      }

      mockGetByIds.mockResolvedValue([mockVector])

      const request = new Request('http://localhost/vectors/simple-vector', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data).toEqual(mockVector)
    })

    it('should handle empty ID parameter', async () => {
      const request = new Request('http://localhost/vectors/', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      
      // This should return 404 as the route won't match
      expect(response.status).toBe(404)
    })

    it('should handle long vector ID', async () => {
      const longId = 'a'.repeat(256)
      const mockVector = {
        ...TestVectors.simple,
        id: longId
      }

      mockGetByIds.mockResolvedValue([mockVector])

      const request = new Request(`http://localhost/vectors/${longId}`, {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockGetByIds).toHaveBeenCalledWith([longId])
      expect(result.data.id).toBe(longId)
    })

    it('should handle vector with large values array', async () => {
      const mockVector = {
        id: 'large-vector',
        values: new Array(1536).fill(0.1),
        metadata: { dimensions: 1536 }
      }

      mockGetByIds.mockResolvedValue([mockVector])

      const request = new Request('http://localhost/vectors/large-vector', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.values).toHaveLength(1536)
      expect(result.data.metadata.dimensions).toBe(1536)
    })
  })
})