import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { syncNotionPageRoute, syncNotionPageHandler } from '../../../../src/routes/api/notion/sync-page'

// Mock Notion Manager Durable Object
const mockNotionManager = {
  createSyncJob: vi.fn()
}

// Mock Durable Object namespace
const mockNotionManagerNamespace = {
  idFromName: vi.fn().mockReturnValue('mock-id'),
  get: vi.fn().mockReturnValue(mockNotionManager)
}

describe('Sync Notion Page Route', () => {
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
      NOTION_MANAGER: mockNotionManagerNamespace as any,
      AI_EMBEDDINGS: {} as any,
      DB: {} as any,
      EMBEDDINGS_WORKFLOW: {} as any,
      BATCH_EMBEDDINGS_WORKFLOW: {} as any,
      VECTOR_OPERATIONS_WORKFLOW: {} as any,
      FILE_PROCESSING_WORKFLOW: {} as any,
      NOTION_SYNC_WORKFLOW: {} as any
    }

    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi(syncNotionPageRoute, syncNotionPageHandler)
  })

  describe('POST /notion/pages/{pageId}/sync', () => {
    it('should sync page successfully with all options', async () => {
      const mockJobResult = {
        jobId: 'job-123',
        status: 'processing'
      }
      
      mockNotionManager.createSyncJob.mockResolvedValue(mockJobResult)

      const request = new Request('http://localhost/notion/pages/page-123/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          includeBlocks: true,
          includeProperties: true,
          namespace: 'custom-namespace'
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(mockNotionManager.createSyncJob).toHaveBeenCalledWith('page-123', {
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
      
      mockNotionManager.createSyncJob.mockResolvedValue(mockJobResult)

      const request = new Request('http://localhost/notion/pages/page-456/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(mockNotionManager.createSyncJob).toHaveBeenCalledWith('page-456', {
        includeBlocks: true, // defaults to true from schema
        includeProperties: true, // defaults to true from schema
        namespace: undefined
      })
      expect(result.data.jobId).toBe('job-456')
      expect(result.data.status).toBe('queued')
    })

    it('should handle missing Notion API key', async () => {
      mockEnv.NOTION_API_KEY = ''

      const request = new Request('http://localhost/notion/pages/page-123/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
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

    it('should handle sync with includeBlocks only', async () => {
      const mockJobResult = {
        jobId: 'job-789',
        status: 'processing'
      }
      
      mockNotionManager.createSyncJob.mockResolvedValue(mockJobResult)

      const request = new Request('http://localhost/notion/pages/page-789/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          includeBlocks: true
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(mockNotionManager.createSyncJob).toHaveBeenCalledWith('page-789', {
        includeBlocks: true,
        includeProperties: true, // defaults to true from schema
        namespace: undefined
      })
    })

    it('should handle errors from createSyncJob', async () => {
      mockNotionManager.createSyncJob.mockRejectedValue(new Error('Sync job creation failed'))

      const request = new Request('http://localhost/notion/pages/page-error/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Sync job creation failed'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockNotionManager.createSyncJob.mockRejectedValue('String error')

      const request = new Request('http://localhost/notion/pages/page-error/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('同期処理の開始中にエラーが発生しました')
    })


    it('should handle invalid JSON body', async () => {
      const request = new Request('http://localhost/notion/pages/page-123/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: 'invalid json'
      })

      const response = await app.fetch(request, mockEnv)

      expect(response.status).toBe(400)
    })

    it('should handle different sync job statuses', async () => {
      const mockJobResult = {
        jobId: 'job-status',
        status: 'completed'
      }
      
      mockNotionManager.createSyncJob.mockResolvedValue(mockJobResult)

      const request = new Request('http://localhost/notion/pages/page-status/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          namespace: 'test-namespace'
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(result.data.status).toBe('completed')
    })
  })
})