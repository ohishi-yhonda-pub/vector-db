import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getJobStatusRoute, getJobStatusHandler, getAllJobsRoute, getAllJobsHandler } from '../../../../src/routes/api/vectors/status'
import { setupVectorRouteTest } from '../../test-helpers'

describe('Vector Job Status Routes', () => {
  let testSetup: ReturnType<typeof setupVectorRouteTest>

  beforeEach(() => {
    vi.clearAllMocks()
    testSetup = setupVectorRouteTest()
    testSetup.app.openapi(getJobStatusRoute, getJobStatusHandler)
    testSetup.app.openapi(getAllJobsRoute, getAllJobsHandler)
  })

  describe('GET /vectors/jobs/{jobId}', () => {
    it('should return job status successfully', async () => {
      const mockJob = {
        id: 'job-123',
        type: 'create',
        status: 'completed',
        createdAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:01:00Z',
        text: 'Test text',
        model: '@cf/baai/bge-base-en-v1.5',
        namespace: 'test',
        metadata: { test: 'value' },
        vectorId: 'vec-123'
      }

      testSetup.mockVectorManager.getJobStatus.mockResolvedValueOnce(mockJob)

      const response = await testSetup.app.request('/vectors/jobs/job-123', {
        method: 'GET',
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json() as any
      expect(json).toEqual({
        success: true,
        data: mockJob
      })
      
      expect(testSetup.mockVectorCacheNamespace.idFromName).toHaveBeenCalledWith('default')
      expect(testSetup.mockVectorCacheNamespace.get).toHaveBeenCalledWith('mock-id')
      expect(testSetup.mockVectorManager.getJobStatus).toHaveBeenCalledWith('job-123')
    })

    it('should return 404 when job not found', async () => {
      testSetup.mockVectorManager.getJobStatus.mockResolvedValueOnce(undefined)

      const response = await testSetup.app.request('/vectors/jobs/non-existent-job', {
        method: 'GET',
      }, testSetup.mockEnv)

      expect(response.status).toBe(404)
      const json = await response.json() as any
      expect(json).toEqual({
        success: false,
        error: 'Not Found',
        message: 'ジョブ non-existent-job が見つかりません'
      })
    })

    it('should handle errors gracefully', async () => {
      testSetup.mockVectorManager.getJobStatus.mockRejectedValueOnce(new Error('Database error'))

      const response = await testSetup.app.request('/vectors/jobs/job-123', {
        method: 'GET',
      }, testSetup.mockEnv)

      expect(response.status).toBe(500)
      const json = await response.json() as any
      expect(json).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Database error'
      })
    })

    it('should handle invalid job data gracefully', async () => {
      const invalidJob = {
        id: 'job-123',
        // Missing required fields
        type: 'invalid-type',
        status: 'invalid-status'
      }

      testSetup.mockVectorManager.getJobStatus.mockResolvedValueOnce(invalidJob)

      const response = await testSetup.app.request('/vectors/jobs/job-123', {
        method: 'GET',
      }, testSetup.mockEnv)

      expect(response.status).toBe(500)
      const json = await response.json() as any
      expect(json.success).toBe(false)
      expect(json.error).toBe('Internal Server Error')
    })
  })

  describe('GET /vectors/jobs', () => {
    it('should return all jobs successfully', async () => {
      const mockJobs = [
        {
          id: 'job-123',
          type: 'create',
          status: 'completed',
          createdAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
          text: 'Test text 1',
          model: '@cf/baai/bge-base-en-v1.5',
          namespace: 'test',
          metadata: { test: 'value1' },
          vectorId: 'vec-123'
        },
        {
          id: 'job-456',
          type: 'delete',
          status: 'processing',
          createdAt: '2024-01-01T00:02:00Z',
          vectorIds: ['vec-001', 'vec-002']
        }
      ]

      testSetup.mockVectorManager.getAllJobs.mockResolvedValueOnce(mockJobs)

      const response = await testSetup.app.request('/vectors/jobs', {
        method: 'GET',
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json() as any
      expect(json).toEqual({
        success: true,
        data: {
          jobs: mockJobs,
          total: 2
        }
      })
      
      expect(testSetup.mockVectorCacheNamespace.idFromName).toHaveBeenCalledWith('default')
      expect(testSetup.mockVectorCacheNamespace.get).toHaveBeenCalledWith('mock-id')
      expect(testSetup.mockVectorManager.getAllJobs).toHaveBeenCalled()
    })

    it('should return empty array when no jobs exist', async () => {
      testSetup.mockVectorManager.getAllJobs.mockResolvedValueOnce([])

      const response = await testSetup.app.request('/vectors/jobs', {
        method: 'GET',
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json() as any
      expect(json).toEqual({
        success: true,
        data: {
          jobs: [],
          total: 0
        }
      })
    })

    it('should handle errors gracefully', async () => {
      testSetup.mockVectorManager.getAllJobs.mockRejectedValueOnce(new Error('Database connection failed'))

      const response = await testSetup.app.request('/vectors/jobs', {
        method: 'GET',
      }, testSetup.mockEnv)

      expect(response.status).toBe(500)
      const json = await response.json() as any
      expect(json).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Database connection failed'
      })
    })

    it('should handle non-Error exceptions in getJobStatus', async () => {
      testSetup.mockVectorManager.getJobStatus.mockRejectedValueOnce('String error')

      const response = await testSetup.app.request('/vectors/jobs/job-123', {
        method: 'GET',
      }, testSetup.mockEnv)

      expect(response.status).toBe(500)
      const json = await response.json() as any
      expect(json).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'ジョブステータス取得中にエラーが発生しました'
      })
    })

    it('should handle non-Error exceptions in getAllJobs', async () => {
      testSetup.mockVectorManager.getAllJobs.mockRejectedValueOnce('String error')

      const response = await testSetup.app.request('/vectors/jobs', {
        method: 'GET',
      }, testSetup.mockEnv)

      expect(response.status).toBe(500)
      const json = await response.json() as any
      expect(json).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'ジョブ一覧取得中にエラーが発生しました'
      })
    })

    it('should handle invalid jobs data gracefully', async () => {
      const invalidJobs = [
        {
          id: 'job-123',
          // Missing required fields
          type: 'invalid-type'
        }
      ]

      testSetup.mockVectorManager.getAllJobs.mockResolvedValueOnce(invalidJobs)

      const response = await testSetup.app.request('/vectors/jobs', {
        method: 'GET',
      }, testSetup.mockEnv)

      expect(response.status).toBe(500)
      const json = await response.json() as any
      expect(json.success).toBe(false)
      expect(json.error).toBe('Internal Server Error')
    })
  })
})