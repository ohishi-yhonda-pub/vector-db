import { describe, it, expect, vi, beforeEach } from 'vitest'
import { 
  NotionSyncManager, 
  type SyncJobData, 
  type SyncJobResult,
  type SyncProgress,
  type SyncStatistics
} from '../../../src/durable-objects/notion-sync-manager'
import { BaseJobManager, JobStatus } from '../../../src/base/job-manager'
import { AppError, ErrorCodes } from '../../../src/utils/error-handler'

// Mock BaseJobManager
vi.mock('../../../src/base/job-manager', () => ({
  BaseJobManager: vi.fn().mockImplementation(function(context: string, env?: any) {
    this.context = context
    this.env = env
    this.jobs = new Map()
    this.createJob = vi.fn().mockResolvedValue({ id: 'test-job-id' })
    this.getJob = vi.fn()
    this.getAllJobs = vi.fn()
    this.cancelJob = vi.fn()
    this.clearJobs = vi.fn()
    return this
  }),
  JobStatus: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
  }
}))

describe('NotionSyncManager', () => {
  let manager: NotionSyncManager
  let mockEnv: Env

  beforeEach(() => {
    vi.clearAllMocks()
    mockEnv = {} as Env
    manager = new NotionSyncManager('TestSync', mockEnv)
  })

  describe('constructor', () => {
    it('should initialize with default context', () => {
      const defaultManager = new NotionSyncManager()
      expect(BaseJobManager).toHaveBeenCalledWith('NotionSync', undefined)
    })

    it('should initialize with custom context and env', () => {
      expect(BaseJobManager).toHaveBeenCalledWith('TestSync', mockEnv)
    })
  })

  describe('createSyncJob', () => {
    it('should create sync job with valid data', async () => {
      const jobData: SyncJobData = {
        pageId: 'page-123',
        jobType: 'sync_page',
        includeBlocks: true,
        includeProperties: true,
        namespace: 'test-namespace'
      }

      const jobId = await manager.createSyncJob(jobData, 5)

      expect(manager.createJob).toHaveBeenCalledWith({
        type: 'sync_page',
        params: jobData,
        priority: 5
      })
      expect(jobId).toBe('test-job-id')
    })

    it('should use default priority when not specified', async () => {
      const jobData: SyncJobData = {
        pageId: 'page-123',
        jobType: 'sync_page'
      }

      await manager.createSyncJob(jobData)

      expect(manager.createJob).toHaveBeenCalledWith({
        type: 'sync_page',
        params: jobData,
        priority: 5
      })
    })

    it('should throw error for invalid job type', async () => {
      const jobData: SyncJobData = {
        pageId: 'page-123',
        jobType: 'invalid_type' as any
      }

      await expect(manager.createSyncJob(jobData)).rejects.toThrow(AppError)
      await expect(manager.createSyncJob(jobData)).rejects.toThrow('Invalid job type: invalid_type')
    })

    it('should throw conflict error when job already running for same page', async () => {
      const jobData: SyncJobData = {
        pageId: 'page-123',
        jobType: 'sync_page'
      }

      // Mock existing running job
      const existingJob = {
        id: 'existing-job-123',
        params: { pageId: 'page-123' },
        status: JobStatus.PROCESSING
      }
      manager.jobs.set('existing-job-123', existingJob as any)

      await expect(manager.createSyncJob(jobData)).rejects.toThrow(AppError)
      await expect(manager.createSyncJob(jobData)).rejects.toThrow('Sync job already running for page page-123')
    })

    it('should allow new job when no running job for same page', async () => {
      const jobData: SyncJobData = {
        pageId: 'page-123',
        jobType: 'sync_page'
      }

      // Mock completed job (should not conflict)
      const completedJob = {
        id: 'completed-job-123',
        params: { pageId: 'page-123' },
        status: JobStatus.COMPLETED
      }
      manager.jobs.set('completed-job-123', completedJob as any)

      const jobId = await manager.createSyncJob(jobData)
      expect(jobId).toBe('test-job-id')
    })

    it('should allow job without pageId', async () => {
      const jobData: SyncJobData = {
        jobType: 'bulk_sync',
        databaseId: 'db-123'
      }

      const jobId = await manager.createSyncJob(jobData)
      expect(jobId).toBe('test-job-id')
    })
  })

  describe('createBulkSyncJob', () => {
    it('should create bulk sync job with high priority', async () => {
      const jobId = await manager.createBulkSyncJob('database-123', {
        includeBlocks: true,
        includeProperties: false,
        namespace: 'bulk-test',
        limit: 100
      })

      expect(manager.createJob).toHaveBeenCalledWith({
        type: 'bulk_sync',
        params: {
          databaseId: 'database-123',
          jobType: 'bulk_sync',
          includeBlocks: true,
          includeProperties: false,
          namespace: 'bulk-test',
          limit: 100
        },
        priority: 10
      })
      expect(jobId).toBe('test-job-id')
    })

    it('should create bulk sync job with minimal options', async () => {
      const jobId = await manager.createBulkSyncJob('database-456')

      expect(manager.createJob).toHaveBeenCalledWith({
        type: 'bulk_sync',
        params: {
          databaseId: 'database-456',
          jobType: 'bulk_sync'
        },
        priority: 10
      })
      expect(jobId).toBe('test-job-id')
    })
  })

  describe('updateJobProgress', () => {
    it('should update job progress and calculate percentComplete', () => {
      const mockJob = {
        id: 'job-123',
        progress: {
          currentStep: 'Initial step',
          totalSteps: 5,
          completedSteps: 2,
          percentComplete: 40
        }
      }
      manager.jobs.set('job-123', mockJob as any)

      const progress: Partial<SyncProgress> = {
        currentStep: 'Processing blocks',
        completedSteps: 3,
        totalSteps: 10
      }

      manager.updateJobProgress('job-123', progress)

      expect(mockJob.progress).toEqual({
        currentStep: 'Processing blocks',
        totalSteps: 10,
        completedSteps: 3,
        percentComplete: 30
      })
    })

    it('should merge progress with existing progress', () => {
      const mockJob = {
        id: 'job-456',
        progress: {
          currentStep: 'Initial step',
          totalSteps: 10,
          completedSteps: 0,
          percentComplete: 0
        }
      }
      manager.jobs.set('job-456', mockJob as any)

      const progress: Partial<SyncProgress> = {
        currentStep: 'New step'
      }

      manager.updateJobProgress('job-456', progress)

      expect(mockJob.progress).toEqual({
        currentStep: 'New step',
        totalSteps: 10,
        completedSteps: 0,
        percentComplete: 0
      })
    })

    it('should throw error for non-existent job', () => {
      const progress: Partial<SyncProgress> = {
        currentStep: 'Processing',
        completedSteps: 1
      }

      expect(() => manager.updateJobProgress('non-existent', progress)).toThrow(AppError)
      expect(() => manager.updateJobProgress('non-existent', progress)).toThrow('Job not found: non-existent')
    })
  })

  describe('updateStatistics', () => {
    it('should update statistics for successful job', () => {
      const result: SyncJobResult = {
        success: true,
        vectorsCreated: 5,
        pagesProcessed: 1,
        blocksProcessed: 10,
        propertiesProcessed: 3
      }

      manager.updateStatistics(result)

      const stats = manager.getStatistics()
      expect(stats.totalSyncJobs).toBe(1)
      expect(stats.completedJobs).toBe(1)
      expect(stats.failedJobs).toBe(0)
      expect(stats.totalVectorsCreated).toBe(5)
      expect(stats.totalPages).toBe(1)
      expect(stats.lastSyncAt).toBeDefined()
    })

    it('should update statistics for failed job', () => {
      const result: SyncJobResult = {
        success: false,
        error: 'Sync failed'
      }

      manager.updateStatistics(result)

      const stats = manager.getStatistics()
      expect(stats.totalSyncJobs).toBe(1)
      expect(stats.completedJobs).toBe(0)
      expect(stats.failedJobs).toBe(1)
      expect(stats.totalVectorsCreated).toBe(0)
    })

    it('should calculate average processing time', () => {
      // Mock completed jobs
      const completedJob1 = {
        id: 'job-1',
        status: JobStatus.COMPLETED,
        createdAt: '2023-01-01T10:00:00Z',
        completedAt: '2023-01-01T10:01:00Z' // 1 minute = 60000ms
      }
      const completedJob2 = {
        id: 'job-2', 
        status: JobStatus.COMPLETED,
        createdAt: '2023-01-01T11:00:00Z',
        completedAt: '2023-01-01T11:02:00Z' // 2 minutes = 120000ms
      }

      manager.jobs.set('job-1', completedJob1 as any)
      manager.jobs.set('job-2', completedJob2 as any)

      const result: SyncJobResult = { success: true }
      manager.updateStatistics(result)

      const stats = manager.getStatistics()
      expect(stats.averageProcessingTime).toBe(90000) // Average of 60000 and 120000
    })

    it('should handle jobs without completedAt', () => {
      const incompleteJob = {
        id: 'job-1',
        status: JobStatus.COMPLETED,
        createdAt: '2023-01-01T10:00:00Z',
        completedAt: undefined
      }

      manager.jobs.set('job-1', incompleteJob as any)

      const result: SyncJobResult = { success: true }
      manager.updateStatistics(result)

      const stats = manager.getStatistics()
      expect(stats.averageProcessingTime).toBe(0)
    })
  })

  describe('getStatistics', () => {
    it('should return copy of statistics', () => {
      const stats1 = manager.getStatistics()
      const stats2 = manager.getStatistics()

      expect(stats1).toEqual(stats2)
      expect(stats1).not.toBe(stats2) // Different objects

      // Initial values
      expect(stats1).toEqual({
        totalPages: 0,
        totalSyncJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        totalVectorsCreated: 0
      })
    })
  })

  describe('cleanupOldJobs', () => {
    it('should remove old completed jobs', async () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 10) // 10 days ago

      const oldCompletedJob = {
        id: 'old-job',
        status: JobStatus.COMPLETED,
        createdAt: oldDate.toISOString()
      }
      const recentJob = {
        id: 'recent-job',
        status: JobStatus.COMPLETED,
        createdAt: new Date().toISOString()
      }
      const runningJob = {
        id: 'running-job',
        status: JobStatus.PROCESSING,
        createdAt: oldDate.toISOString()
      }

      manager.jobs.set('old-job', oldCompletedJob as any)
      manager.jobs.set('recent-job', recentJob as any)
      manager.jobs.set('running-job', runningJob as any)

      const deletedCount = await manager.cleanupOldJobs(7)

      expect(deletedCount).toBe(1)
      expect(manager.jobs.has('old-job')).toBe(false)
      expect(manager.jobs.has('recent-job')).toBe(true)
      expect(manager.jobs.has('running-job')).toBe(true) // Should not delete running jobs
    })

    it('should remove old failed jobs', async () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 10)

      const oldFailedJob = {
        id: 'old-failed-job',
        status: JobStatus.FAILED,
        createdAt: oldDate.toISOString()
      }

      manager.jobs.set('old-failed-job', oldFailedJob as any)

      const deletedCount = await manager.cleanupOldJobs(7)

      expect(deletedCount).toBe(1)
      expect(manager.jobs.has('old-failed-job')).toBe(false)
    })

    it('should use default retention period', async () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 10) // 10 days ago

      const oldJob = {
        id: 'old-job',
        status: JobStatus.COMPLETED,
        createdAt: oldDate.toISOString()
      }

      manager.jobs.set('old-job', oldJob as any)

      const deletedCount = await manager.cleanupOldJobs() // Default 7 days

      expect(deletedCount).toBe(1)
    })

    it('should return 0 when no jobs to cleanup', async () => {
      const deletedCount = await manager.cleanupOldJobs(7)
      expect(deletedCount).toBe(0)
    })
  })

  describe('isValidJobType', () => {
    it('should validate correct job types', () => {
      const validTypes = ['sync_page', 'bulk_sync', 'sync_blocks', 'sync_properties']
      
      for (const type of validTypes) {
        const jobData: SyncJobData = { jobType: type as any }
        expect(() => manager.createSyncJob(jobData)).not.toThrow()
      }
    })

    it('should reject invalid job types', async () => {
      const invalidTypes = ['invalid_type', 'sync_invalid', 'unknown']
      
      for (const type of invalidTypes) {
        const jobData: SyncJobData = { jobType: type as any }
        await expect(manager.createSyncJob(jobData)).rejects.toThrow(AppError)
      }
    })
  })

  describe('findRunningJobForPage', () => {
    it('should find pending job for page', async () => {
      const pendingJob = {
        id: 'pending-job',
        params: { pageId: 'page-123' },
        status: JobStatus.PENDING
      }
      manager.jobs.set('pending-job', pendingJob as any)

      const jobData: SyncJobData = {
        pageId: 'page-123',
        jobType: 'sync_page'
      }

      await expect(manager.createSyncJob(jobData)).rejects.toThrow('Sync job already running for page page-123')
    })

    it('should find processing job for page', async () => {
      const processingJob = {
        id: 'processing-job',
        params: { pageId: 'page-456' },
        status: JobStatus.PROCESSING
      }
      manager.jobs.set('processing-job', processingJob as any)

      const jobData: SyncJobData = {
        pageId: 'page-456',
        jobType: 'sync_page'
      }

      await expect(manager.createSyncJob(jobData)).rejects.toThrow('Sync job already running for page page-456')
    })

    it('should not find completed job for page', async () => {
      const completedJob = {
        id: 'completed-job',
        params: { pageId: 'page-789' },
        status: JobStatus.COMPLETED
      }
      manager.jobs.set('completed-job', completedJob as any)

      const jobData: SyncJobData = {
        pageId: 'page-789',
        jobType: 'sync_page'
      }

      const jobId = await manager.createSyncJob(jobData)
      expect(jobId).toBe('test-job-id')
    })
  })

  describe('getJobsForPage', () => {
    it('should return jobs for specific page', () => {
      const job1 = {
        id: 'job-1',
        params: { pageId: 'page-123', jobType: 'sync_page' },
        status: JobStatus.COMPLETED
      }
      const job2 = {
        id: 'job-2',
        params: { pageId: 'page-456', jobType: 'sync_page' },
        status: JobStatus.PENDING
      }
      const job3 = {
        id: 'job-3',
        params: { pageId: 'page-123', jobType: 'sync_blocks' },
        status: JobStatus.PROCESSING
      }

      manager.jobs.set('job-1', job1 as any)
      manager.jobs.set('job-2', job2 as any)
      manager.jobs.set('job-3', job3 as any)

      const result = manager.getJobsForPage('page-123')

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('job-1')
      expect(result[1].id).toBe('job-3')
    })

    it('should return empty array when no jobs found for page', () => {
      const result = manager.getJobsForPage('nonexistent-page')
      expect(result).toEqual([])
    })
  })

  describe('getActiveJobCount', () => {
    it('should count pending and processing jobs only', () => {
      const pendingJob = {
        id: 'job-1',
        status: JobStatus.PENDING
      }
      const processingJob = {
        id: 'job-2',
        status: JobStatus.PROCESSING
      }
      const completedJob = {
        id: 'job-3',
        status: JobStatus.COMPLETED
      }
      const failedJob = {
        id: 'job-4',
        status: JobStatus.FAILED
      }

      manager.jobs.set('job-1', pendingJob as any)
      manager.jobs.set('job-2', processingJob as any)
      manager.jobs.set('job-3', completedJob as any)
      manager.jobs.set('job-4', failedJob as any)

      const count = manager.getActiveJobCount()
      expect(count).toBe(2)
    })

    it('should return 0 when no active jobs', () => {
      const count = manager.getActiveJobCount()
      expect(count).toBe(0)
    })
  })

  describe('processJob', () => {
    it('should throw NOT_IMPLEMENTED error', async () => {
      const job = {
        id: 'test-job',
        params: { pageId: 'page-123', jobType: 'sync_page' },
        status: JobStatus.PENDING
      }

      await expect(manager['processJob'](job as any)).rejects.toThrow(AppError)
      await expect(manager['processJob'](job as any)).rejects.toThrow('Job processing must be implemented by parent class')
    })
  })

  describe('registerProcessors', () => {
    it('should have empty implementation', () => {
      // This method should exist but do nothing (empty implementation)
      expect(() => manager['registerProcessors']()).not.toThrow()
    })
  })
})