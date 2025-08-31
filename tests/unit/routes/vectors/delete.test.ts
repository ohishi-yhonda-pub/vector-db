import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deleteVectorRoute, deleteVectorHandler } from '../../../../src/routes/api/vectors/delete'
import { setupVectorRouteTest, createMockRequest } from '../../test-helpers'

describe('Delete Vector Route', () => {
  let testSetup: ReturnType<typeof setupVectorRouteTest>

  beforeEach(() => {
    vi.clearAllMocks()
    testSetup = setupVectorRouteTest()
    
    // Add the deleteVectorsAsync method to our mock
    testSetup.mockVectorManager.deleteVectorsAsync = vi.fn()
    
    testSetup.app.openapi(deleteVectorRoute, deleteVectorHandler)
  })

  describe('DELETE /vectors/{id}', () => {
    it('should delete vector successfully', async () => {
      const mockResult = {
        jobId: 'job-delete-123',
        workflowId: 'workflow-delete-456',
        status: 'processing'
      }

      testSetup.mockVectorManager.deleteVectorsAsync.mockResolvedValue(mockResult)

      const request = new Request('http://localhost/vectors/vector-123', {
        method: 'DELETE'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(testSetup.mockVectorManager.deleteVectorsAsync).toHaveBeenCalledWith(['vector-123'])
      expect(result).toEqual({
        success: true,
        data: {
          jobId: 'job-delete-123',
          workflowId: 'workflow-delete-456',
          status: 'processing'
        }
      })
    })

    it('should handle special characters in vector ID', async () => {
      const mockResult = {
        jobId: 'job-special',
        workflowId: 'workflow-special',
        status: 'processing'
      }

      testSetup.mockVectorManager.deleteVectorsAsync.mockResolvedValue(mockResult)

      const specialId = 'vector-!@#$%'
      const encodedId = encodeURIComponent(specialId)
      const request = new Request(`http://localhost/vectors/${encodedId}`, {
        method: 'DELETE'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(testSetup.mockVectorManager.deleteVectorsAsync).toHaveBeenCalledWith([specialId])
      expect(result.success).toBe(true)
    })

    it('should handle VectorManager errors', async () => {
      testSetup.mockVectorManager.deleteVectorsAsync.mockRejectedValue(
        new Error('VectorManager error')
      )

      const request = new Request('http://localhost/vectors/test-id', {
        method: 'DELETE'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'VectorManager error',
        path: '/vectors/test-id',
        timestamp: expect.any(String)
      })
    })

    it('should handle non-Error exceptions', async () => {
      testSetup.mockVectorManager.deleteVectorsAsync.mockRejectedValue('String error')

      const request = new Request('http://localhost/vectors/test-id', {
        method: 'DELETE'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('An unexpected error occurred')
    })

    it('should handle empty ID parameter', async () => {
      const request = new Request('http://localhost/vectors/', {
        method: 'DELETE'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      
      // This should return 404 as the route won't match
      expect(response.status).toBe(404)
    })

    it('should handle long vector ID', async () => {
      const longId = 'a'.repeat(256)
      const mockResult = {
        jobId: 'job-long',
        workflowId: 'workflow-long',
        status: 'processing'
      }

      testSetup.mockVectorManager.deleteVectorsAsync.mockResolvedValue(mockResult)

      const request = new Request(`http://localhost/vectors/${longId}`, {
        method: 'DELETE'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(testSetup.mockVectorManager.deleteVectorsAsync).toHaveBeenCalledWith([longId])
      expect(result.data.jobId).toBe('job-long')
    })

    it('should handle workflow creation with metadata', async () => {
      const mockResult = {
        jobId: 'job-metadata',
        workflowId: 'workflow-metadata',
        status: 'processing',
        metadata: {
          timestamp: '2024-01-01T00:00:00Z',
          requestId: 'req-123'
        }
      }

      testSetup.mockVectorManager.deleteVectorsAsync.mockResolvedValue(mockResult)

      const request = new Request('http://localhost/vectors/vector-with-metadata', {
        method: 'DELETE'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      // Note: The handler doesn't currently pass through metadata from the workflow result
      expect(result.data.jobId).toBe('job-metadata')
    })

    it('should handle multiple consecutive delete requests', async () => {
      const mockResult1 = {
        jobId: 'job-1',
        workflowId: 'workflow-1',
        status: 'processing'
      }
      const mockResult2 = {
        jobId: 'job-2',
        workflowId: 'workflow-2',
        status: 'processing'
      }

      testSetup.mockVectorManager.deleteVectorsAsync
        .mockResolvedValueOnce(mockResult1)
        .mockResolvedValueOnce(mockResult2)

      const request1 = new Request('http://localhost/vectors/vector-1', {
        method: 'DELETE'
      })
      const request2 = new Request('http://localhost/vectors/vector-2', {
        method: 'DELETE'
      })

      const response1 = await testSetup.app.fetch(request1, testSetup.mockEnv)
      const response2 = await testSetup.app.fetch(request2, testSetup.mockEnv)

      const result1 = await response1.json() as any
      const result2 = await response2.json() as any

      expect(response1.status).toBe(202)
      expect(response2.status).toBe(202)
      expect(result1.data.jobId).toBe('job-1')
      expect(result2.data.jobId).toBe('job-2')
      expect(testSetup.mockVectorManager.deleteVectorsAsync).toHaveBeenCalledTimes(2)
    })

    it('should handle UUID format vector ID', async () => {
      const uuidId = '550e8400-e29b-41d4-a716-446655440000'
      const mockResult = {
        jobId: 'job-uuid',
        workflowId: 'workflow-uuid',
        status: 'processing'
      }

      testSetup.mockVectorManager.deleteVectorsAsync.mockResolvedValue(mockResult)

      const request = new Request(`http://localhost/vectors/${uuidId}`, {
        method: 'DELETE'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(testSetup.mockVectorManager.deleteVectorsAsync).toHaveBeenCalledWith([uuidId])
      expect(result.success).toBe(true)
    })

    it('should handle vector ID with slashes (URL encoded)', async () => {
      const idWithSlash = 'namespace/vector/123'
      const encodedId = encodeURIComponent(idWithSlash)
      const mockResult = {
        jobId: 'job-slash',
        workflowId: 'workflow-slash',
        status: 'processing'
      }

      testSetup.mockVectorManager.deleteVectorsAsync.mockResolvedValue(mockResult)

      const request = new Request(`http://localhost/vectors/${encodedId}`, {
        method: 'DELETE'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(testSetup.mockVectorManager.deleteVectorsAsync).toHaveBeenCalledWith([idWithSlash])
      expect(result.success).toBe(true)
    })
  })
})