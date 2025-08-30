import { describe, it, expect, beforeEach } from 'vitest'
import { bulkSyncNotionPagesRoute, bulkSyncNotionPagesHandler } from '../../../../src/routes/api/notion/bulk-sync'
import { setupNotionRouteTest, createMockRequest } from '../../test-helpers'

describe('Bulk Sync Notion Pages Route', () => {
  let testSetup: ReturnType<typeof setupNotionRouteTest>

  beforeEach(() => {
    testSetup = setupNotionRouteTest()
    testSetup.app.openapi(bulkSyncNotionPagesRoute, bulkSyncNotionPagesHandler)
  })

  describe('POST /notion/pages/bulk-sync', () => {
    it('should start bulk sync with specific page IDs', async () => {
      const mockSyncJobs = [
        { pageId: 'page-1', jobId: 'job-1', status: 'queued' },
        { pageId: 'page-2', jobId: 'job-2', status: 'queued' }
      ]

      testSetup.mockNotionManager.createBulkSyncJob.mockResolvedValue({
        syncJobs: mockSyncJobs
      })

      const requestBody = {
        pageIds: ['page-1', 'page-2'],
        includeBlocks: true,
        includeProperties: true,
        maxPages: 50
      }

      const request = createMockRequest('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(testSetup.mockNotionManager.createBulkSyncJob).toHaveBeenCalledWith(['page-1', 'page-2'], {
        includeBlocks: true,
        includeProperties: true,
        namespace: undefined,
        maxPages: 50
      })
      expect(result).toEqual({
        success: true,
        data: {
          totalPages: 2,
          syncJobs: mockSyncJobs,
          message: '2個のページの同期処理を開始しました'
        }
      })
    })

    it('should start bulk sync with page discovery from NotionManager', async () => {
      const mockPages = [
        {
          id: 'discovered-page-1',
          createdTime: '2024-01-01T00:00:00.000Z',
          lastEditedTime: '2024-01-02T00:00:00.000Z'
        },
        {
          id: 'discovered-page-2', 
          createdTime: '2024-01-03T00:00:00.000Z',
          lastEditedTime: '2024-01-04T00:00:00.000Z'
        }
      ]

      const mockSyncJobs = [
        { pageId: 'discovered-page-1', jobId: 'job-d1', status: 'queued' },
        { pageId: 'discovered-page-2', jobId: 'job-d2', status: 'queued' }
      ]

      testSetup.mockNotionManager.listPages.mockResolvedValue(mockPages)
      testSetup.mockNotionManager.createBulkSyncJob.mockResolvedValue({
        syncJobs: mockSyncJobs
      })

      const requestBody = {
        includeBlocks: false,
        includeProperties: false,
        maxPages: 25,
        filterArchived: true,
        namespace: 'test-namespace'
      }

      const request = createMockRequest('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(testSetup.mockNotionManager.listPages).toHaveBeenCalledWith({
        fromCache: false,
        archived: true,
        limit: 25
      })
      expect(testSetup.mockNotionManager.createBulkSyncJob).toHaveBeenCalledWith(['discovered-page-1', 'discovered-page-2'], {
        includeBlocks: false,
        includeProperties: false,
        namespace: 'test-namespace',
        maxPages: 25
      })
      expect(result.data.totalPages).toBe(2)
    })

    it('should handle mixed page types from NotionManager', async () => {
      const mockPages = [
        // NotionPage type
        {
          id: 'notion-page-1',
          createdTime: '2024-01-01T00:00:00.000Z',
          lastEditedTime: '2024-01-02T00:00:00.000Z'
        },
        // Record<string, unknown> type
        {
          id: 'generic-page-1',
          title: 'Generic Page',
          someOtherField: 'value'
        }
      ]

      const mockSyncJobs = [
        { pageId: 'notion-page-1', jobId: 'job-n1', status: 'queued' },
        { pageId: 'generic-page-1', jobId: 'job-g1', status: 'queued' }
      ]

      testSetup.mockNotionManager.listPages.mockResolvedValue(mockPages)
      testSetup.mockNotionManager.createBulkSyncJob.mockResolvedValue({
        syncJobs: mockSyncJobs
      })

      const requestBody = {
        includeBlocks: true,
        includeProperties: true
      }

      const request = createMockRequest('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(testSetup.mockNotionManager.createBulkSyncJob).toHaveBeenCalledWith(['notion-page-1', 'generic-page-1'], {
        includeBlocks: true,
        includeProperties: true,
        namespace: undefined,
        maxPages: 50
      })
    })

    it('should respect maxPages limit when pageIds provided', async () => {
      const mockSyncJobs = [
        { pageId: 'page-1', jobId: 'job-1', status: 'queued' },
        { pageId: 'page-2', jobId: 'job-2', status: 'queued' }
      ]

      testSetup.mockNotionManager.createBulkSyncJob.mockResolvedValue({
        syncJobs: mockSyncJobs
      })

      const requestBody = {
        pageIds: ['page-1', 'page-2', 'page-3', 'page-4'],
        maxPages: 2
      }

      const request = createMockRequest('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(testSetup.mockNotionManager.createBulkSyncJob).toHaveBeenCalledWith(['page-1', 'page-2'], expect.any(Object))
      expect(result.data.totalPages).toBe(2)
    })

    it('should use default values for optional parameters', async () => {
      const mockPages = [
        {
          id: 'default-page-1',
          createdTime: '2024-01-01T00:00:00.000Z'
        }
      ]

      const mockSyncJobs = [
        { pageId: 'default-page-1', jobId: 'job-default', status: 'queued' }
      ]

      testSetup.mockNotionManager.listPages.mockResolvedValue(mockPages)
      testSetup.mockNotionManager.createBulkSyncJob.mockResolvedValue({
        syncJobs: mockSyncJobs
      })

      const requestBody = {}

      const request = createMockRequest('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(testSetup.mockNotionManager.listPages).toHaveBeenCalledWith({
        fromCache: false,
        archived: false,
        limit: 50
      })
      expect(testSetup.mockNotionManager.createBulkSyncJob).toHaveBeenCalledWith(['default-page-1'], {
        includeBlocks: true,
        includeProperties: true,
        namespace: undefined,
        maxPages: 50
      })
    })

    it('should handle empty pageIds array', async () => {
      const mockPages: any[] = []
      const mockSyncJobs: any[] = []

      testSetup.mockNotionManager.listPages.mockResolvedValue(mockPages)
      testSetup.mockNotionManager.createBulkSyncJob.mockResolvedValue({
        syncJobs: mockSyncJobs
      })

      const requestBody = {
        pageIds: []
      }

      const request = createMockRequest('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(testSetup.mockNotionManager.listPages).toHaveBeenCalled()
      expect(result.data.totalPages).toBe(0)
      expect(result.data.message).toBe('0個のページの同期処理を開始しました')
    })

    it('should handle missing Notion API key', async () => {
      testSetup.mockEnv.NOTION_API_KEY = ''

      const requestBody = {
        pageIds: ['test-page']
      }

      const request = createMockRequest('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(401)
      expect(result).toEqual({
        success: false,
        error: 'Unauthorized',
        message: 'Notion APIトークンが設定されていません'
      })
      expect(testSetup.mockNotionManager.listPages).not.toHaveBeenCalled()
      expect(testSetup.mockNotionManager.createBulkSyncJob).not.toHaveBeenCalled()
    })

    it('should handle NotionManager errors', async () => {
      testSetup.mockNotionManager.listPages.mockRejectedValue(new Error('NotionManager connection failed'))

      const requestBody = {
        includeBlocks: true
      }

      const request = createMockRequest('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'NotionManager connection failed'
      })
    })

    it('should handle non-Error exceptions', async () => {
      testSetup.mockNotionManager.createBulkSyncJob.mockRejectedValue('String error')

      const requestBody = {
        pageIds: ['test-page']
      }

      const request = createMockRequest('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('バルク同期処理の開始中にエラーが発生しました')
    })

    it('should handle invalid request body', async () => {
      const requestBody = {
        maxPages: 150 // exceeds max of 100
      }

      const request = createMockRequest('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(testSetup.mockNotionManager.createBulkSyncJob).not.toHaveBeenCalled()
    })

    it('should handle zero maxPages', async () => {
      const requestBody = {
        maxPages: 0 // below min of 1
      }

      const request = createMockRequest('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(testSetup.mockNotionManager.createBulkSyncJob).not.toHaveBeenCalled()
    })
  })
})