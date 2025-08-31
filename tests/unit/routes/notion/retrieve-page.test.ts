import { describe, it, expect, vi, beforeEach } from 'vitest'
import { retrieveNotionPageRoute, retrieveNotionPageHandler } from '../../../../src/routes/api/notion/retrieve-page'
import { setupNotionRouteTest, createMockRequest } from '../../test-helpers'

// Mock NotionOrchestrator methods
const mockGetPage = vi.fn()

vi.mock('../../../../src/services/notion-orchestrator', () => ({
  NotionOrchestrator: vi.fn().mockImplementation(() => ({
    getPage: mockGetPage
  }))
}))

describe('Retrieve Notion Page Route', () => {
  let testSetup: ReturnType<typeof setupNotionRouteTest>

  beforeEach(() => {
    vi.clearAllMocks()
    testSetup = setupNotionRouteTest()
    testSetup.app.openapi(retrieveNotionPageRoute, retrieveNotionPageHandler)
  })

  describe('GET /notion/pages/{pageId}', () => {
    it('should retrieve page from cache successfully', async () => {
      const mockCachedPage = {
        id: 'page-123',
        notionPageId: 'page-123',
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

      const request = createMockRequest('http://localhost/notion/pages/page-123', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockGetPage).toHaveBeenCalledWith('page-123', true) // forceRefresh = !fromCache (default false)
      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        id: 'page-123',
        title: 'Test Page',
        url: 'https://notion.so/test-page',
        last_edited_time: '2024-01-02T00:00:00.000Z',
        created_time: '2024-01-01T00:00:00.000Z',
        archived: false,
        parent: { type: 'workspace', workspace: true }
      })
    })

    it('should return cached page when fromCache is true', async () => {
      const mockCachedPage = {
        id: 'page-789',
        notionPageId: 'page-789',
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

      const request = createMockRequest('http://localhost/notion/pages/page-789?fromCache=true', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockGetPage).toHaveBeenCalledWith('page-789', false) // forceRefresh = !fromCache (true)
      expect(result.data.archived).toBe(true)
      expect(result.data.title).toBe('Cached Only')
    })

    it('should handle missing Notion API key', async () => {
      testSetup.mockEnv.NOTION_API_KEY = ''

      const request = createMockRequest('http://localhost/notion/pages/page-123', {
        method: 'GET'
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

    it('should handle page not found', async () => {
      mockGetPage.mockResolvedValue(null)

      const request = createMockRequest('http://localhost/notion/pages/not-found', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(result).toEqual({
        success: false,
        code: 'NOT_FOUND',
        error: 'ページが見つかりません not found'
      })
    })

    it('should handle page not found when fromCache is true', async () => {
      mockGetPage.mockResolvedValue(null)

      const request = createMockRequest('http://localhost/notion/pages/not-found?fromCache=true', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(mockGetPage).toHaveBeenCalledWith('not-found', false)
    })

    it('should handle errors from NotionOrchestrator', async () => {
      mockGetPage.mockRejectedValue(new Error('Database connection error'))

      const request = createMockRequest('http://localhost/notion/pages/page-error', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Database connection error',
        path: '/notion/pages/page-error',
        timestamp: expect.any(String)
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockGetPage.mockRejectedValue('String error')

      const request = createMockRequest('http://localhost/notion/pages/page-error', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('An unexpected error occurred')
    })

    it('should handle page with null properties', async () => {
      const mockPage = {
        id: 'page-null-props',
        notionPageId: 'page-null-props',
        createdTime: '2024-01-01T00:00:00.000Z',
        lastEditedTime: '2024-01-02T00:00:00.000Z',
        createdById: 'user-123',
        lastEditedById: 'user-456',
        cover: null,
        icon: null,
        parent: JSON.stringify({ type: 'workspace', workspace: true }),
        archived: false,
        inTrash: false,
        properties: JSON.stringify({}),
        url: 'https://notion.so/null-props',
        publicUrl: null
      }

      mockGetPage.mockResolvedValue(mockPage)

      const request = createMockRequest('http://localhost/notion/pages/page-null-props', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.title).toBe('Untitled')
    })

    it('should use fromCache default value when not specified', async () => {
      const mockCachedPage = {
        id: 'page-default-cache',
        notionPageId: 'page-default-cache',
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

      const request = createMockRequest('http://localhost/notion/pages/page-default-cache', {
        method: 'GET'
        // No query parameters - fromCache should default to false
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.id).toBe('page-default-cache')
      expect(mockGetPage).toHaveBeenCalledWith('page-default-cache', true) // forceRefresh = !fromCache
    })

    it('should handle fromCache=false explicitly', async () => {
      const mockCachedPage = {
        id: 'page-explicit-false',
        notionPageId: 'page-explicit-false',
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

      const request = createMockRequest('http://localhost/notion/pages/page-explicit-false?fromCache=false', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.id).toBe('page-explicit-false')
      expect(mockGetPage).toHaveBeenCalledWith('page-explicit-false', true) // forceRefresh = !fromCache
    })
  })
})