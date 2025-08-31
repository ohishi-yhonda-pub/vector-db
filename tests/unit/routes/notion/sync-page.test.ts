import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncNotionPageRoute, syncNotionPageHandler } from '../../../../src/routes/api/notion/sync-page'
import { setupNotionRouteTest, createMockRequest } from '../../test-helpers'

// Mock NotionOrchestrator
const mockSyncPage = vi.fn()

vi.mock('../../../../src/services/notion-orchestrator', () => ({
  NotionOrchestrator: vi.fn().mockImplementation(() => ({
    syncPage: mockSyncPage
  }))
}))

describe('Sync Notion Page Route', () => {
  let testSetup: ReturnType<typeof setupNotionRouteTest>

  beforeEach(() => {
    vi.clearAllMocks()
    testSetup = setupNotionRouteTest()
    testSetup.app.openapi(syncNotionPageRoute, syncNotionPageHandler)
  })

  describe('POST /notion/pages/{pageId}/sync', () => {
    it('should sync page successfully with all options', async () => {
      const mockSyncResult = {
        page: {
          id: 'page-123',
          object: 'page',
          created_time: '2024-01-01T00:00:00.000Z',
          last_edited_time: '2024-01-02T00:00:00.000Z',
          archived: false,
          url: 'https://notion.so/page-123',
          properties: {
            title: {
              title: [{ plain_text: 'Test Page' }]
            }
          }
        },
        blocks: [
          {
            id: 'block-1',
            type: 'paragraph',
            paragraph: {
              text: [{ plain_text: 'Block content' }]
            }
          }
        ]
      }
      
      mockSyncPage.mockResolvedValue(mockSyncResult)

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
      expect(mockSyncPage).toHaveBeenCalledWith('page-123')
      expect(result).toEqual({
        success: true,
        data: {
          ...mockSyncResult,
          message: 'ページの同期処理を開始しました'
        }
      })
    })

    it('should sync page successfully with minimal options', async () => {
      const mockSyncResult = {
        page: {
          id: 'page-456',
          object: 'page',
          created_time: '2024-01-03T00:00:00.000Z',
          last_edited_time: '2024-01-04T00:00:00.000Z',
          archived: false,
          url: 'https://notion.so/page-456',
          properties: {}
        },
        blocks: []
      }
      
      mockSyncPage.mockResolvedValue(mockSyncResult)

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
      expect(mockSyncPage).toHaveBeenCalledWith('page-456')
      expect(result.data.page.id).toBe('page-456')
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
        code: 'UNAUTHORIZED',
        error: 'Notion APIトークンが設定されていません'
      })
    })

    it('should handle page not found scenario', async () => {
      const mockSyncResult = {
        page: null,
        blocks: []
      }
      
      mockSyncPage.mockResolvedValue(mockSyncResult)

      const request = createMockRequest('http://localhost/notion/pages/not-found/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: {}
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(result.data.page).toBeNull()
      expect(result.data.blocks).toEqual([])
    })

    it('should handle sync errors', async () => {
      mockSyncPage.mockRejectedValue(new Error('Sync failed'))

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
        error: 'INTERNAL_ERROR',
        message: 'Sync failed',
        path: '/notion/pages/page-error/sync',
        timestamp: expect.any(String)
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockSyncPage.mockRejectedValue('String error')

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
      expect(result.message).toBe('An unexpected error occurred')
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
  })
})