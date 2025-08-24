import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { listNotionPagesRoute, listNotionPagesHandler } from '../../../../src/routes/api/notion/list-pages'

// Mock Notion Manager Durable Object
const mockNotionManager = {
  listPages: vi.fn()
}

// Mock Durable Object namespace
const mockNotionManagerNamespace = {
  idFromName: vi.fn().mockReturnValue('mock-id'),
  get: vi.fn().mockReturnValue(mockNotionManager)
}

describe('List Notion Pages Route', () => {
  let app: OpenAPIHono<{ Bindings: Env }>
  let mockEnv: Env

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockEnv = {
      ENVIRONMENT: 'development' as const,
      DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
      DEFAULT_TEXT_GENERATION_MODEL: '@cf/google/gemma-3-12b-it',
      IMAGE_ANALYSIS_PROMPT: 'Describe this image',
      IMAGE_ANALYSIS_MAX_TOKENS: '512',
      TEXT_EXTRACTION_MAX_TOKENS: '1024',
      NOTION_API_KEY: 'test-notion-key',
      AI: {} as any,
      VECTORIZE_INDEX: {} as any,
      VECTOR_CACHE: {} as any,
      NOTION_MANAGER: mockNotionManagerNamespace as any,
      AI_EMBEDDINGS: {} as any,
      DB: {} as any,
      BATCH_EMBEDDINGS_WORKFLOW: {} as any,
      VECTOR_OPERATIONS_WORKFLOW: {} as any,
      FILE_PROCESSING_WORKFLOW: {} as any,
      NOTION_SYNC_WORKFLOW: {} as any
    }

    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi(listNotionPagesRoute, listNotionPagesHandler)
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

      mockNotionManager.listPages.mockResolvedValue(mockPages)

      const request = new Request('http://localhost/notion/pages', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockNotionManager.listPages).toHaveBeenCalledWith({
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

      mockNotionManager.listPages.mockResolvedValue(mockCachedPages)

      const request = new Request('http://localhost/notion/pages?from_cache=true', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockNotionManager.listPages).toHaveBeenCalledWith({
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

      mockNotionManager.listPages.mockResolvedValue(mockPages)

      const request = new Request('http://localhost/notion/pages', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
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

      mockNotionManager.listPages.mockResolvedValue(mockCachedPages)

      const request = new Request('http://localhost/notion/pages?from_cache=true&filter_archived=true', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockNotionManager.listPages).toHaveBeenCalledWith({
        fromCache: true,
        archived: true,
        limit: 100
      })
      expect(result.data.pages[0].title).toBe('Object Props Page')
      expect(result.data.pages[0].archived).toBe(true)
    })

    it('should handle query parameters', async () => {
      mockNotionManager.listPages.mockResolvedValue([])

      const request = new Request('http://localhost/notion/pages?page_size=50&filter_archived=true&start_cursor=cursor123', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockNotionManager.listPages).toHaveBeenCalledWith({
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

      mockNotionManager.listPages.mockResolvedValue(mockPages)

      const request = new Request('http://localhost/notion/pages?page_size=100', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.has_more).toBe(true)
    })

    it('should handle missing Notion API key', async () => {
      mockEnv.NOTION_API_KEY = ''

      const request = new Request('http://localhost/notion/pages', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
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

      mockNotionManager.listPages.mockResolvedValue(mockPages)

      const request = new Request('http://localhost/notion/pages', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
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

      mockNotionManager.listPages.mockResolvedValue(mockPages)

      const request = new Request('http://localhost/notion/pages', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.pages[0].title).toBe('')
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

      mockNotionManager.listPages.mockResolvedValue(mockPages)

      const request = new Request('http://localhost/notion/pages', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.pages[0].parent.type).toBe('')
    })

    it('should handle invalid page_size', async () => {
      mockNotionManager.listPages.mockResolvedValue([])

      const request = new Request('http://localhost/notion/pages?page_size=invalid', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any
      
      expect(response.status).toBe(200)
      expect(mockNotionManager.listPages).toHaveBeenCalledWith({
        fromCache: false,
        archived: false,
        limit: NaN // Transform converts invalid string to NaN
      })
    })

    it('should handle errors', async () => {
      mockNotionManager.listPages.mockRejectedValue(new Error('Notion API error'))

      const request = new Request('http://localhost/notion/pages', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Notion API error'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockNotionManager.listPages.mockRejectedValue('String error')

      const request = new Request('http://localhost/notion/pages', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
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

      mockNotionManager.listPages.mockResolvedValue(mockCachedPages)

      const request = new Request('http://localhost/notion/pages?from_cache=true', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
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

      mockNotionManager.listPages.mockResolvedValue(mockCachedPages)

      const request = new Request('http://localhost/notion/pages?from_cache=true', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
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

      mockNotionManager.listPages.mockResolvedValue(mockPages)

      const request = new Request('http://localhost/notion/pages', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
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

      mockNotionManager.listPages.mockResolvedValue(mockCachedPages)

      const request = new Request('http://localhost/notion/pages?from_cache=true', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.pages[0].title).toBe('First partSecond partThird part')
    })
  })
})