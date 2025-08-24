import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { bulkSyncNotionPagesRoute, bulkSyncNotionPagesHandler } from '../../../../src/routes/api/notion/bulk-sync'

// Mock NotionManager methods
const mockListPages = vi.fn()
const mockCreateBulkSyncJob = vi.fn()

// Mock NotionManager Durable Object
const mockNotionManager = {
  listPages: mockListPages,
  createBulkSyncJob: mockCreateBulkSyncJob
}

// Mock Durable Object namespace
const mockNotionManagerNamespace = {
  idFromName: vi.fn(() => 'mock-id'),
  get: vi.fn(() => mockNotionManager)
}

describe('Bulk Sync Notion Pages Route', () => {
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
    app.openapi(bulkSyncNotionPagesRoute, bulkSyncNotionPagesHandler)
  })

  describe('POST /notion/pages/bulk-sync', () => {
    it('should start bulk sync with specific page IDs', async () => {
      const mockSyncJobs = [
        { pageId: 'page-1', jobId: 'job-1', status: 'queued' },
        { pageId: 'page-2', jobId: 'job-2', status: 'queued' }
      ]

      mockCreateBulkSyncJob.mockResolvedValue({
        syncJobs: mockSyncJobs
      })

      const requestBody = {
        pageIds: ['page-1', 'page-2'],
        includeBlocks: true,
        includeProperties: true,
        maxPages: 50
      }

      const request = new Request('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(mockNotionManagerNamespace.idFromName).toHaveBeenCalledWith('global')
      expect(mockNotionManagerNamespace.get).toHaveBeenCalledWith('mock-id')
      expect(mockCreateBulkSyncJob).toHaveBeenCalledWith(['page-1', 'page-2'], {
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

      mockListPages.mockResolvedValue(mockPages)
      mockCreateBulkSyncJob.mockResolvedValue({
        syncJobs: mockSyncJobs
      })

      const requestBody = {
        includeBlocks: false,
        includeProperties: false,
        maxPages: 25,
        filterArchived: true,
        namespace: 'test-namespace'
      }

      const request = new Request('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(mockListPages).toHaveBeenCalledWith({
        fromCache: false,
        archived: true,
        limit: 25
      })
      expect(mockCreateBulkSyncJob).toHaveBeenCalledWith(['discovered-page-1', 'discovered-page-2'], {
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

      mockListPages.mockResolvedValue(mockPages)
      mockCreateBulkSyncJob.mockResolvedValue({
        syncJobs: mockSyncJobs
      })

      const requestBody = {
        includeBlocks: true,
        includeProperties: true
      }

      const request = new Request('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(mockCreateBulkSyncJob).toHaveBeenCalledWith(['notion-page-1', 'generic-page-1'], {
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

      mockCreateBulkSyncJob.mockResolvedValue({
        syncJobs: mockSyncJobs
      })

      const requestBody = {
        pageIds: ['page-1', 'page-2', 'page-3', 'page-4'],
        maxPages: 2
      }

      const request = new Request('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(mockCreateBulkSyncJob).toHaveBeenCalledWith(['page-1', 'page-2'], expect.any(Object))
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

      mockListPages.mockResolvedValue(mockPages)
      mockCreateBulkSyncJob.mockResolvedValue({
        syncJobs: mockSyncJobs
      })

      const requestBody = {}

      const request = new Request('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(mockListPages).toHaveBeenCalledWith({
        fromCache: false,
        archived: false,
        limit: 50
      })
      expect(mockCreateBulkSyncJob).toHaveBeenCalledWith(['default-page-1'], {
        includeBlocks: true,
        includeProperties: true,
        namespace: undefined,
        maxPages: 50
      })
    })

    it('should handle empty pageIds array', async () => {
      const mockPages: any[] = []
      const mockSyncJobs: any[] = []

      mockListPages.mockResolvedValue(mockPages)
      mockCreateBulkSyncJob.mockResolvedValue({
        syncJobs: mockSyncJobs
      })

      const requestBody = {
        pageIds: []
      }

      const request = new Request('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(mockListPages).toHaveBeenCalled()
      expect(result.data.totalPages).toBe(0)
      expect(result.data.message).toBe('0個のページの同期処理を開始しました')
    })

    it('should handle missing Notion API key', async () => {
      mockEnv.NOTION_API_KEY = ''

      const requestBody = {
        pageIds: ['test-page']
      }

      const request = new Request('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(401)
      expect(result).toEqual({
        success: false,
        error: 'Unauthorized',
        message: 'Notion APIトークンが設定されていません'
      })
      expect(mockListPages).not.toHaveBeenCalled()
      expect(mockCreateBulkSyncJob).not.toHaveBeenCalled()
    })

    it('should handle NotionManager errors', async () => {
      mockListPages.mockRejectedValue(new Error('NotionManager connection failed'))

      const requestBody = {
        includeBlocks: true
      }

      const request = new Request('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'NotionManager connection failed'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockCreateBulkSyncJob.mockRejectedValue('String error')

      const requestBody = {
        pageIds: ['test-page']
      }

      const request = new Request('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('バルク同期処理の開始中にエラーが発生しました')
    })

    it('should handle invalid request body', async () => {
      const requestBody = {
        maxPages: 150 // exceeds max of 100
      }

      const request = new Request('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(mockCreateBulkSyncJob).not.toHaveBeenCalled()
    })

    it('should handle zero maxPages', async () => {
      const requestBody = {
        maxPages: 0 // below min of 1
      }

      const request = new Request('http://localhost/notion/pages/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(mockCreateBulkSyncJob).not.toHaveBeenCalled()
    })
  })
})