import { describe, it, expect, beforeEach, vi } from 'vitest'
import { VectorJobService } from '../../../../src/routes/api/vectors/job-service'
import type { VectorJob } from '../../../../src/schemas/vector.schema'

describe('VectorJobService', () => {
  let service: VectorJobService
  let mockVectorManager: any
  let mockEnv: Env

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockVectorManager = {
      getJobStatus: vi.fn(),
      getAllJobs: vi.fn()
    }

    mockEnv = {
      VECTOR_CACHE: {
        idFromName: vi.fn().mockReturnValue('test-id'),
        get: vi.fn().mockReturnValue(mockVectorManager)
      }
    } as any

    service = new VectorJobService(mockEnv)
  })

  describe('getJobStatus', () => {
    it('should get job status successfully', async () => {
      const mockJob: VectorJob = {
        id: 'job-123',
        type: 'create',
        status: 'completed',
        vectorId: 'vec-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        completedAt: '2024-01-01T00:01:00.000Z'
      }

      mockVectorManager.getJobStatus.mockResolvedValue(mockJob)

      const result = await service.getJobStatus('job-123')

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockJob)
      expect(result.error).toBeUndefined()
      expect(mockVectorManager.getJobStatus).toHaveBeenCalledWith('job-123')
    })

    it('should return error when job not found', async () => {
      mockVectorManager.getJobStatus.mockResolvedValue(null)

      const result = await service.getJobStatus('nonexistent')

      expect(result.success).toBe(false)
      expect(result.data).toBeUndefined()
      expect(result.error).toEqual({
        success: false,
        error: 'Not Found',
        message: 'ジョブ nonexistent が見つかりません'
      })
    })

    it('should throw error on exception', async () => {
      mockVectorManager.getJobStatus.mockRejectedValue(new Error('Connection failed'))

      await expect(service.getJobStatus('job-123')).rejects.toThrow('Connection failed')
    })
  })

  describe('getAllJobs', () => {
    it('should get all jobs successfully', async () => {
      const mockJobs: VectorJob[] = [
        {
          id: 'job-1',
          type: 'create',
          status: 'completed',
          vectorId: 'vec-1',
          createdAt: '2024-01-01T00:00:00.000Z',
          completedAt: '2024-01-01T00:01:00.000Z'
        },
        {
          id: 'job-2',
          type: 'delete',
          status: 'processing',
          vectorIds: ['vec-2'],
          createdAt: '2024-01-02T00:00:00.000Z'
        }
      ]

      mockVectorManager.getAllJobs.mockResolvedValue(mockJobs)

      const result = await service.getAllJobs()

      expect(result.jobs).toEqual(mockJobs)
      expect(result.total).toBe(2)
      expect(mockVectorManager.getAllJobs).toHaveBeenCalled()
    })

    it('should handle empty jobs list', async () => {
      mockVectorManager.getAllJobs.mockResolvedValue([])

      const result = await service.getAllJobs()

      expect(result.jobs).toEqual([])
      expect(result.total).toBe(0)
    })
  })

  describe('filterJobsByStatus', () => {
    const mockJobs: VectorJob[] = [
      { id: 'job-1', status: 'completed' } as VectorJob,
      { id: 'job-2', status: 'processing' } as VectorJob,
      { id: 'job-3', status: 'failed' } as VectorJob,
      { id: 'job-4', status: 'completed' } as VectorJob
    ]

    it('should filter jobs by status', () => {
      const filtered = service.filterJobsByStatus(mockJobs, 'completed')
      
      expect(filtered).toHaveLength(2)
      expect(filtered[0].id).toBe('job-1')
      expect(filtered[1].id).toBe('job-4')
    })

    it('should return all jobs when status is undefined', () => {
      const filtered = service.filterJobsByStatus(mockJobs)
      
      expect(filtered).toEqual(mockJobs)
    })
  })

  describe('sortJobsByDate', () => {
    const mockJobs: VectorJob[] = [
      { id: 'job-1', createdAt: '2024-01-03T00:00:00.000Z' } as VectorJob,
      { id: 'job-2', createdAt: '2024-01-01T00:00:00.000Z' } as VectorJob,
      { id: 'job-3', createdAt: '2024-01-02T00:00:00.000Z' } as VectorJob
    ]

    it('should sort jobs by date descending by default', () => {
      const sorted = service.sortJobsByDate(mockJobs)
      
      expect(sorted[0].id).toBe('job-1')
      expect(sorted[1].id).toBe('job-3')
      expect(sorted[2].id).toBe('job-2')
    })

    it('should sort jobs by date ascending', () => {
      const sorted = service.sortJobsByDate(mockJobs, 'asc')
      
      expect(sorted[0].id).toBe('job-2')
      expect(sorted[1].id).toBe('job-3')
      expect(sorted[2].id).toBe('job-1')
    })

    it('should not mutate original array', () => {
      const original = [...mockJobs]
      service.sortJobsByDate(mockJobs)
      
      expect(mockJobs).toEqual(original)
    })
  })

  describe('getJobsSummary', () => {
    it('should calculate jobs summary', () => {
      const mockJobs: VectorJob[] = [
        { id: 'job-1', status: 'completed' } as VectorJob,
        { id: 'job-2', status: 'processing' } as VectorJob,
        { id: 'job-3', status: 'failed' } as VectorJob,
        { id: 'job-4', status: 'completed' } as VectorJob,
        { id: 'job-5', status: 'pending' } as VectorJob
      ]

      const summary = service.getJobsSummary(mockJobs)

      expect(summary).toEqual({
        total: 5,
        pending: 1,
        processing: 1,
        completed: 2,
        failed: 1
      })
    })

    it('should handle empty jobs list', () => {
      const summary = service.getJobsSummary([])

      expect(summary).toEqual({
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0
      })
    })
  })
})