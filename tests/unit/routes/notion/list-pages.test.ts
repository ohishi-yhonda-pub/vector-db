import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listNotionPagesRoute, listNotionPagesHandler } from '../../../../src/routes/api/notion/list-pages'
import { setupNotionRouteTest, createMockRequest } from '../../test-helpers'

describe('List Notion Pages Route', () => {
  let testSetup: ReturnType<typeof setupNotionRouteTest>

  beforeEach(() => {
    testSetup = setupNotionRouteTest()
    testSetup.app.openapi(listNotionPagesRoute, listNotionPagesHandler)
  })

  describe('GET /notion/pages', () => {
    it('should list pages from Notion API successfully', async () => {
      const mockPages = [
        {
          id: 'page-1',
          url: 'https://notion.so/page-1',
          created_time: '2024-01-01T00:00:00.000Z',
          last_edited_time: '2024-01-02T00:00:00.000Z',
          archived: false,
          parent: { type: 'workspace', workspace: true },
          properties: {
            title: {
              title: [{ plain_text: 'Page 1 Title' }]
            }
          }
        },
        {
          id: 'page-2',
          url: 'https://notion.so/page-2',
          created_time: '2024-01-03T00:00:00.000Z',
          last_edited_time: '2024-01-04T00:00:00.000Z',
          archived: false,
          parent: { type: 'page_id', page_id: 'parent-page-id' },
          properties: {
            title: {
              title: [{ plain_text: 'Page 2 Title' }]
            }
          }
        }
      ]

      testSetup.mockNotionManager.listPages.mockResolvedValue(mockPages)

      const request = createMockRequest('http://localhost/notion/pages', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(testSetup.mockNotionManager.listPages).toHaveBeenCalledWith({
        fromCache: false,
        archived: false,
        limit: 100
      })
      expect(result).toEqual({
        success: true,
        data: {
          pages: [
            {
              id: 'page-1',
              title: 'Page 1 Title',
              url: 'https://notion.so/page-1',
              created_time: '2024-01-01T00:00:00.000Z',
              last_edited_time: '2024-01-02T00:00:00.000Z',
              archived: false,
              parent: { type: 'workspace', workspace: true }
            },
            {
              id: 'page-2',
              title: 'Page 2 Title',
              url: 'https://notion.so/page-2',
              created_time: '2024-01-03T00:00:00.000Z',
              last_edited_time: '2024-01-04T00:00:00.000Z',
              archived: false,
              parent: { type: 'page_id', page_id: 'parent-page-id' }
            }
          ],
          has_more: false,
          next_cursor: null
        }
      })
    })

    it('should list pages from cache successfully', async () => {
      const mockCachedPages = [
        {
          id: 'cached-page-1',
          notionPageId: 'cached-page-1',
          url: 'https://notion.so/cached-page-1',
          createdTime: '2024-01-01T00:00:00.000Z',
          lastEditedTime: '2024-01-02T00:00:00.000Z',
          archived: false,
          parent: JSON.stringify({ type: 'database_id', database_id: 'db-123' }),
          properties: JSON.stringify({
            title: {
              title: [{ plain_text: 'Cached Page 1' }]
            }
          })
        }
      ]

      testSetup.mockNotionManager.listPages.mockResolvedValue(mockCachedPages)

      const request = createMockRequest('http://localhost/notion/pages?from_cache=true', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(testSetup.mockNotionManager.listPages).toHaveBeenCalledWith({
        fromCache: true,
        archived: false,
        limit: 100
      })
      expect(result.data.pages[0]).toEqual({
        id: 'cached-page-1',
        title: 'Cached Page 1',
        url: 'https://notion.so/cached-page-1',
        created_time: '2024-01-01T00:00:00.000Z',
        last_edited_time: '2024-01-02T00:00:00.000Z',
        archived: false,
        parent: { type: 'database_id', database_id: 'db-123' }
      })
    })

    it('should handle page with no title', async () => {
      const mockPages = [
        {
          id: 'page-no-title',
          url: 'https://notion.so/page-no-title',
          created_time: '2024-01-01T00:00:00.000Z',
          last_edited_time: '2024-01-02T00:00:00.000Z',
          archived: false,
          parent: { type: 'workspace', workspace: true },
          properties: {}
        }
      ]

      testSetup.mockNotionManager.listPages.mockResolvedValue(mockPages)

      const request = createMockRequest('http://localhost/notion/pages', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.pages[0].title).toBe('Untitled')
    })

    it('should handle cached page with object parent and properties', async () => {
      const mockCachedPages = [
        {
          id: 'cached-page-2',
          notionPageId: 'cached-page-2',
          url: 'https://notion.so/cached-page-2',
          createdTime: '2024-01-01T00:00:00.000Z',
          lastEditedTime: '2024-01-02T00:00:00.000Z',
          archived: true,
          parent: { type: 'page_id', page_id: 'parent-123' }, // Already an object
          properties: { // Already an object
            title: {
              title: [{ plain_text: 'Object Props Page' }]
            }
          }
        }
      ]

      testSetup.mockNotionManager.listPages.mockResolvedValue(mockCachedPages)

      const request = createMockRequest('http://localhost/notion/pages?from_cache=true&filter_archived=true', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(testSetup.mockNotionManager.listPages).toHaveBeenCalledWith({
        fromCache: true,
        archived: true,
        limit: 100
      })
      expect(result.data.pages[0].title).toBe('Object Props Page')
      expect(result.data.pages[0].archived).toBe(true)
    })

    it('should handle query parameters', async () => {
      testSetup.mockNotionManager.listPages.mockResolvedValue([])

      const request = createMockRequest('http://localhost/notion/pages?page_size=50&filter_archived=true&start_cursor=cursor123', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(testSetup.mockNotionManager.listPages).toHaveBeenCalledWith({
        fromCache: false,
        archived: true,
        limit: 50
      })
    })

    it('should handle has_more when page_size limit is reached', async () => {
      const mockPages = Array(100).fill(null).map((_, i) => ({
        id: `page-${i}`,
        url: `https://notion.so/page-${i}`,
        created_time: '2024-01-01T00:00:00.000Z',
        last_edited_time: '2024-01-02T00:00:00.000Z',
        archived: false,
        parent: { type: 'workspace', workspace: true },
        properties: {}
      }))

      testSetup.mockNotionManager.listPages.mockResolvedValue(mockPages)

      const request = createMockRequest('http://localhost/notion/pages?page_size=100', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.has_more).toBe(true)
    })

    it('should handle missing Notion API key', async () => {
      testSetup.mockEnv.NOTION_API_KEY = ''

      const request = createMockRequest('http://localhost/notion/pages', {
        method: 'GET'
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

    it('should handle empty title array', async () => {
      const mockPages = [
        {
          id: 'page-empty-title',
          url: 'https://notion.so/page-empty-title',
          created_time: '2024-01-01T00:00:00.000Z',
          last_edited_time: '2024-01-02T00:00:00.000Z',
          archived: false,
          parent: { type: 'workspace', workspace: true },
          properties: {
            title: {
              title: []
            }
          }
        }
      ]

      testSetup.mockNotionManager.listPages.mockResolvedValue(mockPages)

      const request = createMockRequest('http://localhost/notion/pages', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.pages[0].title).toBe('Untitled')
    })

    it('should handle title without plain_text', async () => {
      const mockPages = [
        {
          id: 'page-no-plain-text',
          url: 'https://notion.so/page-no-plain-text',
          created_time: '2024-01-01T00:00:00.000Z',
          last_edited_time: '2024-01-02T00:00:00.000Z',
          archived: false,
          parent: { type: 'workspace', workspace: true },
          properties: {
            title: {
              title: [{ type: 'text', text: { content: 'Some text' } }] // No plain_text property
            }
          }
        }
      ]

      testSetup.mockNotionManager.listPages.mockResolvedValue(mockPages)

      const request = createMockRequest('http://localhost/notion/pages', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.pages[0].title).toBe('Untitled')
    })

    it('should handle parent without type', async () => {
      const mockPages = [
        {
          id: 'page-no-parent-type',
          url: 'https://notion.so/page-no-parent-type',
          created_time: '2024-01-01T00:00:00.000Z',
          last_edited_time: '2024-01-02T00:00:00.000Z',
          archived: false,
          parent: {}, // No type property
          properties: {}
        }
      ]

      testSetup.mockNotionManager.listPages.mockResolvedValue(mockPages)

      const request = createMockRequest('http://localhost/notion/pages', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.pages[0].parent.type).toBe('')
    })

    it('should handle invalid page_size', async () => {
      testSetup.mockNotionManager.listPages.mockResolvedValue([])

      const request = createMockRequest('http://localhost/notion/pages?page_size=invalid', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any
      
      expect(response.status).toBe(200)
      expect(testSetup.mockNotionManager.listPages).toHaveBeenCalledWith({
        fromCache: false,
        archived: false,
        limit: NaN // Transform converts invalid string to NaN
      })
    })

    it('should handle errors', async () => {
      testSetup.mockNotionManager.listPages.mockRejectedValue(new Error('Notion API error'))

      const request = createMockRequest('http://localhost/notion/pages', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Notion API error'
      })
    })

    it('should handle non-Error exceptions', async () => {
      testSetup.mockNotionManager.listPages.mockRejectedValue('String error')

      const request = createMockRequest('http://localhost/notion/pages', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('ページ一覧取得中にエラーが発生しました')
    })


    it('should handle cached page with invalid title structure (non-array)', async () => {
      const mockCachedPages = [
        {
          id: 'cached-page-invalid-title',
          notionPageId: 'cached-page-invalid-title',
          url: 'https://notion.so/cached-page-invalid-title',
          createdTime: '2024-01-01T00:00:00.000Z',
          lastEditedTime: '2024-01-02T00:00:00.000Z',
          archived: false,
          parent: JSON.stringify({ type: 'workspace', workspace: true }),
          properties: JSON.stringify({
            title: {
              title: "not-an-array" // This will fail Array.isArray check
            }
          })
        }
      ]

      testSetup.mockNotionManager.listPages.mockResolvedValue(mockCachedPages)

      const request = createMockRequest('http://localhost/notion/pages?from_cache=true', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.pages[0].title).toBe('Untitled')
    })

    it('should handle cached page with null title.title', async () => {
      const mockCachedPages = [
        {
          id: 'cached-page-null-title',
          notionPageId: 'cached-page-null-title',
          url: 'https://notion.so/cached-page-null-title',
          createdTime: '2024-01-01T00:00:00.000Z',
          lastEditedTime: '2024-01-02T00:00:00.000Z',
          archived: false,
          parent: JSON.stringify({ type: 'workspace', workspace: true }),
          properties: JSON.stringify({
            title: {
              title: null // This will fail the properties.title.title check
            }
          })
        }
      ]

      testSetup.mockNotionManager.listPages.mockResolvedValue(mockCachedPages)

      const request = createMockRequest('http://localhost/notion/pages?from_cache=true', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.pages[0].title).toBe('Untitled')
    })

    it('should handle API page with database parent', async () => {
      const mockPages = [
        {
          id: 'page-with-db-parent',
          url: 'https://notion.so/page-with-db-parent',
          created_time: '2024-01-01T00:00:00.000Z',
          last_edited_time: '2024-01-02T00:00:00.000Z',
          archived: false,
          parent: { 
            type: 'database_id', 
            database_id: 'database-123' // This should trigger the true branch
          },
          properties: {
            title: {
              title: [{ plain_text: 'Database Page' }]
            }
          }
        }
      ]

      testSetup.mockNotionManager.listPages.mockResolvedValue(mockPages)

      const request = createMockRequest('http://localhost/notion/pages', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.pages[0].parent.database_id).toBe('database-123')
      expect(result.data.pages[0].title).toBe('Database Page')
    })

    it('should handle cached page with valid title array for mapping', async () => {
      const mockCachedPages = [
        {
          id: 'cached-page-valid-title',
          notionPageId: 'cached-page-valid-title',
          url: 'https://notion.so/cached-page-valid-title',
          createdTime: '2024-01-01T00:00:00.000Z',
          lastEditedTime: '2024-01-02T00:00:00.000Z',
          archived: false,
          parent: JSON.stringify({ type: 'workspace', workspace: true }),
          properties: JSON.stringify({
            title: {
              title: [
                { plain_text: 'First part' },
                { plain_text: 'Second part' },
                { plain_text: null }, // Test the || '' fallback in map
                { plain_text: 'Third part' }
              ]
            }
          })
        }
      ]

      testSetup.mockNotionManager.listPages.mockResolvedValue(mockCachedPages)

      const request = createMockRequest('http://localhost/notion/pages?from_cache=true', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.pages[0].title).toBe('First partSecond partThird part')
    })
  })
})