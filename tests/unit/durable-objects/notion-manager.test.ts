import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupDurableObjectTest } from '../test-helpers'

// Mock the Agent class first
vi.mock('agents', () => ({
  Agent: class {
    constructor(public ctx: any, public env: any) {
      this.state = {
        syncJobs: {},
        stats: {
          totalPages: 0,
          totalSyncJobs: 0,
          completedJobs: 0,
          failedJobs: 0,
          totalVectorsCreated: 0
        },
        settings: {
          autoSyncEnabled: false,
          defaultNamespace: 'notion',
          maxConcurrentJobs: 5,
          includeBlocksByDefault: true,
          includePropertiesByDefault: true
        }
      }
    }
    state: any
    setState(newState: any) {
      this.state = { ...this.state, ...newState }
    }
  }
}))

// Mock NotionService
vi.mock('../../../src/services/notion.service', () => ({
  NotionService: vi.fn().mockImplementation(() => ({
    getPage: vi.fn(),
    fetchPageFromNotion: vi.fn(),
    savePage: vi.fn(),
    getAllPagesFromCache: vi.fn(),
    searchAllPages: vi.fn()
  }))
}))

// Mock database
vi.mock('../../../src/db', () => ({
  getDb: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue({})
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue({})
      }))
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue({})
    }))
  }))
}))

// Mock schema
vi.mock('../../../src/db/schema', () => ({
  notionSyncJobs: {
    id: 'id',
    pageId: 'pageId',
    jobType: 'jobType',
    status: 'status',
    completedAt: 'completedAt',
    error: 'error',
    metadata: 'metadata'
  }
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ field, value }))
}))

// Now import after mocks are set up
import { NotionManager } from '../../../src/durable-objects/notion-manager'
import { eq } from 'drizzle-orm'

describe('NotionManager Durable Object', () => {
  let notionManager: NotionManager
  let testSetup: ReturnType<typeof setupDurableObjectTest>
  let mockWorkflow: any

  beforeEach(() => {
    testSetup = setupDurableObjectTest()
    
    mockWorkflow = {
      id: 'workflow-123',
      status: vi.fn().mockResolvedValue({ status: 'running' })
    }

    testSetup.mockEnv.NOTION_API_KEY = 'test-notion-key'
    testSetup.mockEnv.NOTION_SYNC_WORKFLOW = {
      create: vi.fn().mockResolvedValue(mockWorkflow),
      get: vi.fn().mockResolvedValue(mockWorkflow)
    }

    testSetup.mockCtx.storage = {
      get: vi.fn(),
      put: vi.fn()
    }

    notionManager = new NotionManager(testSetup.mockCtx, testSetup.mockEnv)
  })

  describe('constructor', () => {
    it('should initialize with correct initial state', () => {
      expect(notionManager.initialState).toEqual({
        syncJobs: {},
        stats: {
          totalPages: 0,
          totalSyncJobs: 0,
          completedJobs: 0,
          failedJobs: 0,
          totalVectorsCreated: 0
        },
        settings: {
          autoSyncEnabled: false,
          defaultNamespace: 'notion',
          maxConcurrentJobs: 5,
          includeBlocksByDefault: true,
          includePropertiesByDefault: true
        }
      })
    })
  })

  describe('createSyncJob', () => {
    it('should create sync job with default options', async () => {
      const pageId = 'page-123'
      const result = await notionManager.createSyncJob(pageId)

      expect(testSetup.mockEnv.NOTION_SYNC_WORKFLOW.create).toHaveBeenCalledWith({
        id: expect.stringContaining(`notion_sync_${pageId}_`),
        params: {
          pageId,
          notionToken: 'test-notion-key',
          includeBlocks: true,
          includeProperties: true,
          namespace: 'notion'
        }
      })

      expect(result).toEqual({
        jobId: expect.stringContaining(`notion_sync_${pageId}_`),
        workflowId: 'workflow-123',
        status: 'processing'
      })

      expect(notionManager.state.syncJobs[result.jobId]).toBeDefined()
      expect(notionManager.state.stats.totalSyncJobs).toBe(1)
    })

    it('should create sync job with custom options', async () => {
      const pageId = 'page-456'
      const options = {
        includeBlocks: false,
        includeProperties: false,
        namespace: 'custom-namespace'
      }

      const result = await notionManager.createSyncJob(pageId, options)

      expect(testSetup.mockEnv.NOTION_SYNC_WORKFLOW.create).toHaveBeenCalledWith({
        id: expect.stringContaining(`notion_sync_${pageId}_`),
        params: {
          pageId,
          notionToken: 'test-notion-key',
          includeBlocks: false,
          includeProperties: false,
          namespace: 'custom-namespace'
        }
      })

      expect(notionManager.state.syncJobs[result.jobId].metadata).toEqual(options)
    })
  })

  describe('createBulkSyncJob', () => {
    it('should create bulk sync job for multiple pages', async () => {
      const pageIds = ['page-1', 'page-2', 'page-3']
      const result = await notionManager.createBulkSyncJob(pageIds)

      expect(result.jobId).toContain('bulk_sync_')
      expect(result.syncJobs).toHaveLength(3)
      expect(result.syncJobs[0]).toMatchObject({
        pageId: 'page-1',
        jobId: expect.any(String),
        status: 'processing'
      })

      expect(notionManager.state.syncJobs[result.jobId]).toBeDefined()
      expect(notionManager.state.syncJobs[result.jobId].jobType).toBe('bulk_sync')
    })

    it('should respect maxPages option', async () => {
      const pageIds = Array.from({ length: 100 }, (_, i) => `page-${i}`)
      const result = await notionManager.createBulkSyncJob(pageIds, { maxPages: 10 })

      expect(result.syncJobs).toHaveLength(10)
    })

    it('should handle errors gracefully', async () => {
      // Make createSyncJob fail for second page
      const createSyncJobSpy = vi.spyOn(notionManager, 'createSyncJob')
        .mockResolvedValueOnce({ jobId: 'job-1', workflowId: 'wf-1', status: 'processing' })
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce({ jobId: 'job-3', workflowId: 'wf-3', status: 'processing' })

      const pageIds = ['page-1', 'page-2', 'page-3']
      const result = await notionManager.createBulkSyncJob(pageIds)

      expect(result.syncJobs).toHaveLength(3)
      expect(result.syncJobs[1]).toMatchObject({
        pageId: 'page-2',
        jobId: expect.stringContaining('failed_'),
        status: 'failed'
      })
    })
  })

  describe('updateJobStatus', () => {
    it('should update job status to completed', async () => {
      // Create a job first
      const pageId = 'page-123'
      const { jobId } = await notionManager.createSyncJob(pageId)

      // Update status
      await notionManager.updateJobStatus(jobId, 'completed', {
        metadata: { vectorsCreated: 10 }
      })

      const job = notionManager.state.syncJobs[jobId]
      expect(job.status).toBe('completed')
      expect(job.completedAt).toBeDefined()
      expect(notionManager.state.stats.completedJobs).toBe(1)
      expect(notionManager.state.stats.totalVectorsCreated).toBe(10)
      expect(notionManager.state.stats.lastSyncAt).toBeDefined()
    })

    it('should handle zero vectorsCreated in metadata', async () => {
      const pageId = 'page-123'
      const { jobId } = await notionManager.createSyncJob(pageId)

      await notionManager.updateJobStatus(jobId, 'completed', {
        metadata: { vectorsCreated: 0 }
      })

      expect(notionManager.state.stats.totalVectorsCreated).toBe(0)
    })

    it('should update job status to failed', async () => {
      const pageId = 'page-123'
      const { jobId } = await notionManager.createSyncJob(pageId)

      await notionManager.updateJobStatus(jobId, 'failed', {
        error: 'Something went wrong'
      })

      const job = notionManager.state.syncJobs[jobId]
      expect(job.status).toBe('failed')
      expect(job.error).toBe('Something went wrong')
      expect(job.completedAt).toBeDefined()
      expect(notionManager.state.stats.failedJobs).toBe(1)
    })

    it('should do nothing if job does not exist', async () => {
      await notionManager.updateJobStatus('non-existent-job', 'completed')
      expect(notionManager.state.stats.completedJobs).toBe(0)
    })
  })

  describe('getJobStatus', () => {
    it('should return job status when exists', async () => {
      const pageId = 'page-123'
      const { jobId } = await notionManager.createSyncJob(pageId)

      const job = await notionManager.getJobStatus(jobId)
      expect(job).toBeDefined()
      expect(job?.pageId).toBe(pageId)
    })

    it('should return null when job does not exist', async () => {
      const job = await notionManager.getJobStatus('non-existent-job')
      expect(job).toBeNull()
    })
  })

  describe('getAllJobs', () => {
    it('should return all jobs', async () => {
      await notionManager.createSyncJob('page-1')
      await notionManager.createSyncJob('page-2')
      await notionManager.createSyncJob('page-3')

      const jobs = await notionManager.getAllJobs()
      expect(jobs).toHaveLength(3)
    })
  })

  describe('getActiveJobs', () => {
    it('should return only active jobs', async () => {
      const { jobId: job1 } = await notionManager.createSyncJob('page-1')
      const { jobId: job2 } = await notionManager.createSyncJob('page-2')
      const { jobId: job3 } = await notionManager.createSyncJob('page-3')

      // Mark job2 as completed
      await notionManager.updateJobStatus(job2, 'completed')

      const activeJobs = await notionManager.getActiveJobs()
      expect(activeJobs).toHaveLength(2)
      expect(activeJobs.map(j => j.id)).toContain(job1)
      expect(activeJobs.map(j => j.id)).toContain(job3)
      expect(activeJobs.map(j => j.id)).not.toContain(job2)
    })
  })

  describe('getStats', () => {
    it('should return current statistics', async () => {
      await notionManager.createSyncJob('page-1')
      await notionManager.createSyncJob('page-2')
      
      const stats = await notionManager.getStats()
      expect(stats.totalSyncJobs).toBe(2)
      expect(stats.completedJobs).toBe(0)
      expect(stats.failedJobs).toBe(0)
    })
  })

  describe('updateSettings', () => {
    it('should update settings', async () => {
      await notionManager.updateSettings({
        autoSyncEnabled: true,
        defaultNamespace: 'custom',
        maxConcurrentJobs: 10
      })

      const settings = await notionManager.getSettings()
      expect(settings.autoSyncEnabled).toBe(true)
      expect(settings.defaultNamespace).toBe('custom')
      expect(settings.maxConcurrentJobs).toBe(10)
      // Unchanged settings should remain
      expect(settings.includeBlocksByDefault).toBe(true)
    })
  })

  describe('getPage', () => {
    it('should get page from cache first', async () => {
      const mockNotionService = {
        getPage: vi.fn().mockResolvedValue({ id: 'page-123', title: 'Test Page' }),
        fetchPageFromNotion: vi.fn(),
        savePage: vi.fn()
      }
      
      // Access private method through any
      ;(notionManager as any).notionService = mockNotionService

      const page = await notionManager.getPage('page-123')
      
      expect(mockNotionService.getPage).toHaveBeenCalledWith('page-123')
      expect(mockNotionService.fetchPageFromNotion).not.toHaveBeenCalled()
      expect(page).toEqual({ id: 'page-123', title: 'Test Page' })
    })

    it('should fetch from Notion API if not in cache', async () => {
      const mockPage = { id: 'page-456', title: 'New Page' }
      const mockNotionService = {
        getPage: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(mockPage),
        fetchPageFromNotion: vi.fn().mockResolvedValue(mockPage),
        savePage: vi.fn()
      }
      
      ;(notionManager as any).notionService = mockNotionService

      const page = await notionManager.getPage('page-456')
      
      expect(mockNotionService.getPage).toHaveBeenCalledTimes(2)
      expect(mockNotionService.fetchPageFromNotion).toHaveBeenCalledWith('page-456')
      expect(mockNotionService.savePage).toHaveBeenCalledWith(mockPage)
      expect(page).toEqual(mockPage)
    })

    it('should return null when page not found in Notion', async () => {
      const mockNotionService = {
        getPage: vi.fn().mockResolvedValue(null),
        fetchPageFromNotion: vi.fn().mockResolvedValue(null),
        savePage: vi.fn()
      }
      
      ;(notionManager as any).notionService = mockNotionService

      const page = await notionManager.getPage('non-existent-page')
      
      expect(mockNotionService.getPage).toHaveBeenCalledWith('non-existent-page')
      expect(mockNotionService.fetchPageFromNotion).toHaveBeenCalledWith('non-existent-page')
      expect(mockNotionService.savePage).not.toHaveBeenCalled()
      expect(page).toBeNull()
    })
  })

  describe('listPages', () => {
    it('should list pages from cache when fromCache is true', async () => {
      const mockPages = [
        { id: 'page-1', title: 'Page 1' },
        { id: 'page-2', title: 'Page 2' }
      ]
      
      const mockNotionService = {
        getAllPagesFromCache: vi.fn().mockResolvedValue(mockPages),
        searchAllPages: vi.fn(),
        savePage: vi.fn()
      }
      
      ;(notionManager as any).notionService = mockNotionService

      const pages = await notionManager.listPages({ fromCache: true, limit: 10 })
      
      expect(mockNotionService.getAllPagesFromCache).toHaveBeenCalledWith({
        archived: undefined,
        limit: 10
      })
      expect(mockNotionService.searchAllPages).not.toHaveBeenCalled()
      expect(pages).toEqual(mockPages)
    })

    it('should search from Notion API and cache results', async () => {
      const mockPages = [
        { id: 'page-1', title: 'Page 1' },
        { id: 'page-2', title: 'Page 2' }
      ]
      
      const mockNotionService = {
        getAllPagesFromCache: vi.fn(),
        searchAllPages: vi.fn().mockResolvedValue({ results: mockPages }),
        savePage: vi.fn()
      }
      
      ;(notionManager as any).notionService = mockNotionService

      const pages = await notionManager.listPages({ limit: 50 })
      
      expect(mockNotionService.searchAllPages).toHaveBeenCalledWith({
        page_size: 50
      })
      expect(mockNotionService.savePage).toHaveBeenCalledTimes(2)
      expect(pages).toEqual(mockPages)
    })

    it('should use default limit when not specified', async () => {
      const mockPages: any[] = []
      
      const mockNotionService = {
        getAllPagesFromCache: vi.fn(),
        searchAllPages: vi.fn().mockResolvedValue({ results: mockPages }),
        savePage: vi.fn()
      }
      
      ;(notionManager as any).notionService = mockNotionService

      await notionManager.listPages()
      
      expect(mockNotionService.searchAllPages).toHaveBeenCalledWith({
        page_size: 100
      })
    })
  })

  describe('cleanupOldJobs', () => {
    it('should cleanup old completed and failed jobs', async () => {
      // Create some jobs
      const { jobId: job1 } = await notionManager.createSyncJob('page-1')
      const { jobId: job2 } = await notionManager.createSyncJob('page-2')
      const { jobId: job3 } = await notionManager.createSyncJob('page-3')

      // Set old timestamps and statuses
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      notionManager.state.syncJobs[job1].startedAt = oldTime
      notionManager.state.syncJobs[job1].status = 'completed'
      
      notionManager.state.syncJobs[job2].startedAt = oldTime
      notionManager.state.syncJobs[job2].status = 'failed'

      // job3 is recent and processing
      notionManager.state.syncJobs[job3].status = 'processing'

      const deletedCount = await notionManager.cleanupOldJobs(24)

      expect(deletedCount).toBe(2)
      expect(notionManager.state.syncJobs[job1]).toBeUndefined()
      expect(notionManager.state.syncJobs[job2]).toBeUndefined()
      expect(notionManager.state.syncJobs[job3]).toBeDefined()
    })

    it('should not cleanup recent jobs', async () => {
      const { jobId } = await notionManager.createSyncJob('page-1')
      await notionManager.updateJobStatus(jobId, 'completed')

      const deletedCount = await notionManager.cleanupOldJobs(24)
      
      expect(deletedCount).toBe(0)
      expect(notionManager.state.syncJobs[jobId]).toBeDefined()
    })

    it('should not cleanup processing jobs even if old', async () => {
      const { jobId } = await notionManager.createSyncJob('page-1')
      
      // Make job old but keep as processing
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      notionManager.state.syncJobs[jobId].startedAt = oldTime
      notionManager.state.syncJobs[jobId].status = 'processing'

      const deletedCount = await notionManager.cleanupOldJobs(24)
      
      expect(deletedCount).toBe(0)
      expect(notionManager.state.syncJobs[jobId]).toBeDefined()
    })

    it('should use default hours when not specified', async () => {
      const { jobId } = await notionManager.createSyncJob('page-1')
      
      // Make job 25 hours old (older than default 24 hours)
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      notionManager.state.syncJobs[jobId].startedAt = oldTime
      notionManager.state.syncJobs[jobId].status = 'completed'
      await notionManager.updateJobStatus(jobId, 'completed')

      const deletedCount = await notionManager.cleanupOldJobs()
      
      expect(deletedCount).toBe(1)
      expect(notionManager.state.syncJobs[jobId]).toBeUndefined()
    })
  })

  describe('getWorkflowStatus', () => {
    it('should return workflow status', async () => {
      const expectedStatus = { status: 'completed', output: { success: true } }
      mockWorkflow.status.mockResolvedValueOnce(expectedStatus)

      const status = await notionManager.getWorkflowStatus('workflow-123')
      
      expect(testSetup.mockEnv.NOTION_SYNC_WORKFLOW.get).toHaveBeenCalledWith('workflow-123')
      expect(status).toEqual(expectedStatus)
    })

    it('should handle errors gracefully', async () => {
      testSetup.mockEnv.NOTION_SYNC_WORKFLOW.get.mockRejectedValueOnce(new Error('Not found'))

      const status = await notionManager.getWorkflowStatus('non-existent')
      
      expect(status).toBeNull()
    })
  })

  describe('getNotionService', () => {
    it('should throw error if NOTION_API_KEY is not configured', () => {
      delete testSetup.mockEnv.NOTION_API_KEY
      const manager = new NotionManager(testSetup.mockCtx, testSetup.mockEnv)

      expect(() => (manager as any).getNotionService()).toThrow('Notion API token not configured')
    })

    it('should create NotionService instance once', () => {
      const service1 = (notionManager as any).getNotionService()
      const service2 = (notionManager as any).getNotionService()
      
      expect(service1).toBe(service2)
    })
  })
})