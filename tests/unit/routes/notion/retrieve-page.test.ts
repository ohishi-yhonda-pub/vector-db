import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { retrieveNotionPageRoute, retrieveNotionPageHandler } from '../../../../src/routes/api/notion/retrieve-page'

// Mock NotionService methods
const mockGetPage = vi.fn()
const mockFetchPageFromNotion = vi.fn()
const mockSavePage = vi.fn()

vi.mock('../../../../src/services/notion.service', () => ({
  NotionService: vi.fn().mockImplementation(() => ({
    getPage: mockGetPage,
    fetchPageFromNotion: mockFetchPageFromNotion,
    savePage: mockSavePage
  }))
}))

describe('Retrieve Notion Page Route', () => {
  let app: OpenAPIHono<{ Bindings: Env }>
  let mockEnv: Env

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockEnv = {
      ENVIRONMENT: 'development' as const,
      DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
      DEFAULT_TEXT_GENERATION_MODEL: '@cf/google/gemma-3-12b-it',
      IMAGE_ANALYSIS_PROMPT: 'Describe this image in detail. Include any text visible in the image.',
      IMAGE_ANALYSIS_MAX_TOKENS: '512',
      TEXT_EXTRACTION_MAX_TOKENS: '1024',
      NOTION_API_KEY: 'test-notion-api-key',
      AI: {} as any,
      VECTORIZE_INDEX: {} as any,
      VECTOR_CACHE: {} as any,
      NOTION_MANAGER: {} as any,
      AI_EMBEDDINGS: {} as any,
      DB: {} as any,
      EMBEDDINGS_WORKFLOW: {} as any,
      BATCH_EMBEDDINGS_WORKFLOW: {} as any,
      VECTOR_OPERATIONS_WORKFLOW: {} as any,
      FILE_PROCESSING_WORKFLOW: {} as any,
      NOTION_SYNC_WORKFLOW: {} as any
    }

    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi(retrieveNotionPageRoute, retrieveNotionPageHandler)
  })

  describe('GET /notion/pages/{pageId}', () => {
    it('should retrieve page from cache successfully', async () => {
      const mockCachedPage = {
        id: 'page-123',
        createdTime: '2024-01-01T00:00:00.000Z',
        lastEditedTime: '2024-01-02T00:00:00.000Z',
        createdById: 'user-123',
        lastEditedById: 'user-456',
        cover: JSON.stringify({ type: 'external', external: { url: 'https://example.com/cover.jpg' } }),
        icon: JSON.stringify({ type: 'emoji', emoji: '📄' }),
        parent: JSON.stringify({ type: 'workspace', workspace: true }),
        archived: false,
        inTrash: false,
        properties: JSON.stringify({ title: { title: [{ plain_text: 'Test Page' }] } }),
        url: 'https://notion.so/test-page',
        publicUrl: 'https://public.notion.so/test-page'
      }

      mockGetPage.mockResolvedValue(mockCachedPage)

      const request = new Request('http://localhost/notion/pages/page-123', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockGetPage).toHaveBeenCalledWith('page-123')
      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        object: 'page',
        id: 'page-123',
        created_time: '2024-01-01T00:00:00.000Z',
        last_edited_time: '2024-01-02T00:00:00.000Z',
        created_by: { object: 'user', id: 'user-123' },
        last_edited_by: { object: 'user', id: 'user-456' },
        cover: { type: 'external', external: { url: 'https://example.com/cover.jpg' } },
        icon: { type: 'emoji', emoji: '📄' },
        parent: { type: 'workspace', workspace: true },
        archived: false,
        in_trash: false,
        properties: { title: { title: [{ plain_text: 'Test Page' }] } },
        url: 'https://notion.so/test-page',
        public_url: 'https://public.notion.so/test-page'
      })
    })

    it('should fetch from Notion API when not in cache', async () => {
      const mockNotionPage = {
        object: 'page',
        id: 'page-456',
        created_time: '2024-01-03T00:00:00.000Z',
        last_edited_time: '2024-01-04T00:00:00.000Z',
        created_by: { object: 'user', id: 'user-789' },
        last_edited_by: { object: 'user', id: 'user-101' },
        cover: null,
        icon: null,
        parent: { type: 'page_id', page_id: 'parent-page' },
        archived: false,
        in_trash: false,
        properties: { title: { title: [{ plain_text: 'API Page' }] } },
        url: 'https://notion.so/api-page',
        public_url: null
      }

      mockGetPage.mockResolvedValueOnce(null).mockResolvedValueOnce(mockNotionPage)
      mockFetchPageFromNotion.mockResolvedValue(mockNotionPage)
      mockSavePage.mockResolvedValue(undefined)

      const request = new Request('http://localhost/notion/pages/page-456', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockGetPage).toHaveBeenCalledTimes(2)
      expect(mockFetchPageFromNotion).toHaveBeenCalledWith('page-456')
      expect(mockSavePage).toHaveBeenCalledWith(mockNotionPage)
      expect(result.data.id).toBe('page-456')
    })

    it('should return cached page when fromCache is true', async () => {
      const mockCachedPage = {
        id: 'page-789',
        createdTime: '2024-01-05T00:00:00.000Z',
        lastEditedTime: '2024-01-06T00:00:00.000Z',
        createdById: 'user-111',
        lastEditedById: 'user-222',
        cover: null,
        icon: null,
        parent: JSON.stringify({ type: 'database_id', database_id: 'db-123' }),
        archived: true,
        inTrash: false,
        properties: JSON.stringify({ title: { title: [{ plain_text: 'Cached Only' }] } }),
        url: 'https://notion.so/cached-only',
        publicUrl: null
      }

      mockGetPage.mockResolvedValue(mockCachedPage)

      const request = new Request('http://localhost/notion/pages/page-789?fromCache=true', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockGetPage).toHaveBeenCalledWith('page-789')
      expect(mockFetchPageFromNotion).not.toHaveBeenCalled()
      expect(result.data.archived).toBe(true)
    })

    it('should handle missing Notion API key', async () => {
      mockEnv.NOTION_API_KEY = ''

      const request = new Request('http://localhost/notion/pages/page-123', {
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

    it('should handle page not found in cache or API', async () => {
      mockGetPage.mockResolvedValue(null)
      mockFetchPageFromNotion.mockResolvedValue(null)

      const request = new Request('http://localhost/notion/pages/not-found', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(result).toEqual({
        success: false,
        error: 'Not Found',
        message: 'ページが見つかりません'
      })
    })

    it('should handle page not found when fromCache is true', async () => {
      mockGetPage.mockResolvedValue(null)

      const request = new Request('http://localhost/notion/pages/not-found?fromCache=true', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(mockFetchPageFromNotion).not.toHaveBeenCalled()
    })

    it('should handle cached page with null publicUrl', async () => {
      const mockCachedPage = {
        id: 'page-null-url',
        createdTime: '2024-01-07T00:00:00.000Z',
        lastEditedTime: '2024-01-08T00:00:00.000Z',
        createdById: 'user-333',
        lastEditedById: 'user-444',
        cover: null,
        icon: null,
        parent: JSON.stringify({ type: 'workspace', workspace: true }),
        archived: false,
        inTrash: false,
        properties: JSON.stringify({ title: { title: [{ plain_text: 'No Public URL' }] } }),
        url: 'https://notion.so/no-public-url',
        publicUrl: null
      }

      mockGetPage.mockResolvedValue(mockCachedPage)

      const request = new Request('http://localhost/notion/pages/page-null-url', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.public_url).toBeUndefined()
    })

    it('should handle errors from NotionService', async () => {
      mockGetPage.mockRejectedValue(new Error('Database connection error'))

      const request = new Request('http://localhost/notion/pages/page-error', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Database connection error'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockGetPage.mockRejectedValue('String error')

      const request = new Request('http://localhost/notion/pages/page-error', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('ページ取得中にエラーが発生しました')
    })

    it('should handle API page that has object property', async () => {
      const mockApiPage = {
        object: 'page',
        id: 'page-api',
        created_time: '2024-01-09T00:00:00.000Z',
        last_edited_time: '2024-01-10T00:00:00.000Z',
        created_by: { object: 'user', id: 'user-555' },
        last_edited_by: { object: 'user', id: 'user-666' },
        cover: null,
        icon: null,
        parent: { type: 'workspace', workspace: true },
        archived: false,
        in_trash: false,
        properties: { title: { title: [{ plain_text: 'Direct API Page' }] } },
        url: 'https://notion.so/direct-api',
        public_url: null
      }

      mockGetPage.mockResolvedValue(mockApiPage)
      mockFetchPageFromNotion.mockResolvedValue(mockApiPage)

      const request = new Request('http://localhost/notion/pages/page-api', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data).toEqual(mockApiPage)
    })

    it('should handle page not found after getPage returns object', async () => {
      const mockApiPage = {
        object: 'page',
        id: 'page-api-notfound'
      }

      mockGetPage.mockResolvedValue(mockApiPage)
      mockFetchPageFromNotion.mockResolvedValue(null)

      const request = new Request('http://localhost/notion/pages/page-api-notfound', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(result.message).toBe('ページが見つかりません')
    })

    it('should use fromCache default value when not specified', async () => {
      const mockCachedPage = {
        id: 'page-default-cache',
        createdTime: '2024-01-01T00:00:00.000Z',
        lastEditedTime: '2024-01-02T00:00:00.000Z',
        createdById: 'user-123',
        lastEditedById: 'user-456',
        cover: null,
        icon: null,
        parent: JSON.stringify({ type: 'workspace', workspace: true }),
        archived: false,
        inTrash: false,
        properties: JSON.stringify({ title: { title: [{ plain_text: 'Default Cache Test' }] } }),
        url: 'https://notion.so/default-cache-test',
        publicUrl: null
      }

      mockGetPage.mockResolvedValue(mockCachedPage)

      const request = new Request('http://localhost/notion/pages/page-default-cache', {
        method: 'GET'
        // No query parameters - fromCache should default to false
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.id).toBe('page-default-cache')
    })

    it('should handle fromCache=false explicitly', async () => {
      const mockCachedPage = {
        id: 'page-explicit-false',
        createdTime: '2024-01-01T00:00:00.000Z',
        lastEditedTime: '2024-01-02T00:00:00.000Z',
        createdById: 'user-123',
        lastEditedById: 'user-456',
        cover: null,
        icon: null,
        parent: JSON.stringify({ type: 'workspace', workspace: true }),
        archived: false,
        inTrash: false,
        properties: JSON.stringify({ title: { title: [{ plain_text: 'Explicit False Test' }] } }),
        url: 'https://notion.so/explicit-false-test',
        publicUrl: null
      }

      mockGetPage.mockResolvedValue(mockCachedPage)

      const request = new Request('http://localhost/notion/pages/page-explicit-false?fromCache=false', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.id).toBe('page-explicit-false')
    })

    it('should handle fromCache with other values', async () => {
      const mockCachedPage = {
        id: 'page-other-value',
        createdTime: '2024-01-01T00:00:00.000Z',
        lastEditedTime: '2024-01-02T00:00:00.000Z',
        createdById: 'user-123',
        lastEditedById: 'user-456',
        cover: null,
        icon: null,
        parent: JSON.stringify({ type: 'workspace', workspace: true }),
        archived: false,
        inTrash: false,
        properties: JSON.stringify({ title: { title: [{ plain_text: 'Other Value Test' }] } }),
        url: 'https://notion.so/other-value-test',
        publicUrl: null
      }

      mockGetPage.mockResolvedValue(mockCachedPage)

      const request = new Request('http://localhost/notion/pages/page-other-value?fromCache=invalid', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.id).toBe('page-other-value')
      // fromCache=invalid should be treated as false
    })

    it('should handle empty fromCache parameter', async () => {
      const mockCachedPage = {
        id: 'page-empty-cache',
        createdTime: '2024-01-01T00:00:00.000Z',
        lastEditedTime: '2024-01-02T00:00:00.000Z',
        createdById: 'user-123',
        lastEditedById: 'user-456',
        cover: null,
        icon: null,
        parent: JSON.stringify({ type: 'workspace', workspace: true }),
        archived: false,
        inTrash: false,
        properties: JSON.stringify({ title: { title: [{ plain_text: 'Empty Cache Test' }] } }),
        url: 'https://notion.so/empty-cache-test',
        publicUrl: null
      }

      mockGetPage.mockResolvedValue(mockCachedPage)

      const request = new Request('http://localhost/notion/pages/page-empty-cache?fromCache=', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.id).toBe('page-empty-cache')
      // fromCache="" should be treated as false (empty string !== 'true')
    })
  })
})