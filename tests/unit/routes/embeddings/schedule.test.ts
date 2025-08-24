import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { scheduleBatchEmbeddingRoute, scheduleBatchEmbeddingHandler } from '../../../../src/routes/api/embeddings/schedule'

// Mock AI Embeddings Durable Object
const mockAIEmbeddings = {
  scheduleBatchEmbeddings: vi.fn()
}

// Mock Durable Object namespace
const mockAIEmbeddingsNamespace = {
  idFromName: vi.fn().mockReturnValue('mock-id'),
  get: vi.fn().mockReturnValue(mockAIEmbeddings)
}

describe('Schedule Batch Embeddings Route', () => {
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
      NOTION_API_KEY: 'test-key',
      AI: {} as any,
      VECTORIZE_INDEX: {} as any,
      VECTOR_CACHE: {
        idFromName: vi.fn().mockReturnValue('mock-vector-id'),
        get: vi.fn().mockReturnValue({})
      } as any,
      NOTION_MANAGER: {} as any,
      AI_EMBEDDINGS: mockAIEmbeddingsNamespace as any,
      DB: {} as any,
      BATCH_EMBEDDINGS_WORKFLOW: {} as any,
      VECTOR_OPERATIONS_WORKFLOW: {} as any,
      FILE_PROCESSING_WORKFLOW: {} as any,
      NOTION_SYNC_WORKFLOW: {} as any
    }

    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi(scheduleBatchEmbeddingRoute, scheduleBatchEmbeddingHandler)
  })

  describe('POST /embeddings/schedule', () => {
    it('should schedule batch embeddings successfully', async () => {
      const mockResult = {
        jobId: 'job-schedule-123',
        workflowId: 'workflow-schedule-456',
        status: 'scheduled',
        textsCount: 5
      }

      mockAIEmbeddings.scheduleBatchEmbeddings.mockResolvedValue(mockResult)

      const request = new Request('http://localhost/embeddings/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: ['Text 1', 'Text 2', 'Text 3', 'Text 4', 'Text 5'],
          model: '@cf/baai/bge-base-en-v1.5',
          batchSize: 2,
          saveToVectorize: true,
          delayMs: 5000
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockAIEmbeddings.scheduleBatchEmbeddings).toHaveBeenCalledWith(
        ['Text 1', 'Text 2', 'Text 3', 'Text 4', 'Text 5'],
        '@cf/baai/bge-base-en-v1.5',
        {
          batchSize: 2,
          saveToVectorize: true,
          delayMs: 5000
        }
      )
      expect(result).toEqual({
        success: true,
        data: mockResult,
        message: '5件のテキストの処理がスケジュールされました'
      })
    })

    it('should work with minimal parameters', async () => {
      const mockResult = {
        jobId: 'job-minimal',
        status: 'scheduled',
        textsCount: 1
      }

      mockAIEmbeddings.scheduleBatchEmbeddings.mockResolvedValue(mockResult)

      const request = new Request('http://localhost/embeddings/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: ['Single text']
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockAIEmbeddings.scheduleBatchEmbeddings).toHaveBeenCalledWith(
        ['Single text'],
        undefined,
        {
          batchSize: undefined,
          saveToVectorize: undefined,
          delayMs: undefined
        }
      )
      expect(result.success).toBe(true)
      expect(result.message).toBe('1件のテキストの処理がスケジュールされました')
    })

    it('should return 400 for invalid request body', async () => {
      const request = new Request('http://localhost/embeddings/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // missing required texts field
          delayMs: 1000
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result).toHaveProperty('error')
    })

    it('should return 400 for invalid batch size', async () => {
      const request = new Request('http://localhost/embeddings/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: ['Text'],
          batchSize: 0 // invalid - must be at least 1
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result).toHaveProperty('error')
    })

    it('should handle Durable Object errors', async () => {
      mockAIEmbeddings.scheduleBatchEmbeddings.mockRejectedValue(new Error('Scheduling failed'))

      const request = new Request('http://localhost/embeddings/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: ['Text 1', 'Text 2']
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Scheduling failed'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockAIEmbeddings.scheduleBatchEmbeddings.mockRejectedValue({ code: 'SCHEDULE_ERROR' })

      const request = new Request('http://localhost/embeddings/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: ['Text']
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('バッチ処理のスケジュール中にエラーが発生しました')
    })
  })
})