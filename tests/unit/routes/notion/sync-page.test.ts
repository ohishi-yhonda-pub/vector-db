import { describe, it, expect, beforeEach } from 'vitest'
import { syncNotionPageRoute, syncNotionPageHandler } from '../../../../src/routes/api/notion/sync-page'
import { setupNotionRouteTest, createMockRequest } from '../../test-helpers'

describe('Sync Notion Page Route', () => {
  let testSetup: ReturnType<typeof setupNotionRouteTest>

  beforeEach(() => {
    testSetup = setupNotionRouteTest()
    testSetup.app.openapi(syncNotionPageRoute, syncNotionPageHandler)
  })

  describe('POST /notion/pages/{pageId}/sync', () => {
    it('should sync page successfully with all options', async () => {
      const mockJobResult = {
        jobId: 'job-123',
        status: 'processing'
      }
      
      testSetup.mockNotionManager.createSyncJob.mockResolvedValue(mockJobResult)

      const request = createMockRequest('http://localhost/notion/pages/page-123/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          includeBlocks: true,
          includeProperties: true,
          namespace: 'custom-namespace'
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(testSetup.mockNotionManager.createSyncJob).toHaveBeenCalledWith('page-123', {
        includeBlocks: true,
        includeProperties: true,
        namespace: 'custom-namespace'
      })
      expect(result).toEqual({
        success: true,
        data: {
          jobId: 'job-123',
          pageId: 'page-123',
          status: 'processing',
          message: 'ページの同期処理を開始しました'
        }
      })
    })

    it('should sync page successfully with minimal options', async () => {
      const mockJobResult = {
        jobId: 'job-456',
        status: 'queued'
      }
      
      testSetup.mockNotionManager.createSyncJob.mockResolvedValue(mockJobResult)

      const request = createMockRequest('http://localhost/notion/pages/page-456/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: {}
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(testSetup.mockNotionManager.createSyncJob).toHaveBeenCalledWith('page-456', {
        includeBlocks: true, // defaults to true from schema
        includeProperties: true, // defaults to true from schema
        namespace: undefined
      })
      expect(result.data.jobId).toBe('job-456')
      expect(result.data.status).toBe('queued')
    })

    it('should handle missing Notion API key', async () => {
      testSetup.mockEnv.NOTION_API_KEY = ''

      const request = createMockRequest('http://localhost/notion/pages/page-123/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: {}
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(401)
      expect(result).toEqual({
        success: false,
        error: 'Unauthorized',
        message: 'Notion APIトークンが設定されていません'
      })
    })

    it('should handle sync with includeBlocks only', async () => {
      const mockJobResult = {
        jobId: 'job-789',
        status: 'processing'
      }
      
      testSetup.mockNotionManager.createSyncJob.mockResolvedValue(mockJobResult)

      const request = createMockRequest('http://localhost/notion/pages/page-789/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          includeBlocks: true
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(testSetup.mockNotionManager.createSyncJob).toHaveBeenCalledWith('page-789', {
        includeBlocks: true,
        includeProperties: true, // defaults to true from schema
        namespace: undefined
      })
    })

    it('should handle errors from createSyncJob', async () => {
      testSetup.mockNotionManager.createSyncJob.mockRejectedValue(new Error('Sync job creation failed'))

      const request = createMockRequest('http://localhost/notion/pages/page-error/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: {}
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Sync job creation failed'
      })
    })

    it('should handle non-Error exceptions', async () => {
      testSetup.mockNotionManager.createSyncJob.mockRejectedValue('String error')

      const request = createMockRequest('http://localhost/notion/pages/page-error/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: {}
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('同期処理の開始中にエラーが発生しました')
    })


    it('should handle invalid JSON body', async () => {
      const request = createMockRequest('http://localhost/notion/pages/page-123/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: 'invalid json'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)

      expect(response.status).toBe(400)
    })

    it('should handle different sync job statuses', async () => {
      const mockJobResult = {
        jobId: 'job-status',
        status: 'completed'
      }
      
      testSetup.mockNotionManager.createSyncJob.mockResolvedValue(mockJobResult)

      const request = createMockRequest('http://localhost/notion/pages/page-status/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          namespace: 'test-namespace'
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(result.data.status).toBe('completed')
    })
  })
})