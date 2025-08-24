import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { batchEmbeddingRoute, batchEmbeddingHandler } from '../../../../src/routes/api/embeddings/batch'

// Mock AI Embeddings Durable Object
const mockAIEmbeddings = {
  generateBatchEmbeddings: vi.fn()
}

// Mock Durable Object namespace
const mockAIEmbeddingsNamespace = {
  idFromName: vi.fn().mockReturnValue('mock-id'),
  get: vi.fn().mockReturnValue(mockAIEmbeddings)
}

describe('Batch Embeddings Route', () => {
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
      AI: {} as Ai,
      VECTORIZE_INDEX: {} as VectorizeIndex,
      VECTOR_CACHE: {
        idFromName: vi.fn().mockReturnValue('mock-vector-id'),
        get: vi.fn().mockReturnValue({})
      } as any,
      NOTION_MANAGER: {} as any,
      AI_EMBEDDINGS: mockAIEmbeddingsNamespace as any,
      DB: {} as D1Database,
      BATCH_EMBEDDINGS_WORKFLOW: {} as Workflow,
      VECTOR_OPERATIONS_WORKFLOW: {} as Workflow,
      FILE_PROCESSING_WORKFLOW: {} as Workflow,
      NOTION_SYNC_WORKFLOW: {} as Workflow
    }

    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi(batchEmbeddingRoute, batchEmbeddingHandler)
  })

  describe('POST /embeddings/batch', () => {
    it('should generate batch embeddings successfully', async () => {
      const mockResult = {
        jobId: 'job-batch-123',
        workflowId: 'workflow-batch-456',
        status: 'processing',
        textsCount: 3
      }

      mockAIEmbeddings.generateBatchEmbeddings.mockResolvedValue(mockResult)

      const request = new Request('http://localhost/embeddings/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: ['Text 1', 'Text 2', 'Text 3'],
          model: '@cf/baai/bge-base-en-v1.5',
          batchSize: 10,
          saveToVectorize: true
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockAIEmbeddings.generateBatchEmbeddings).toHaveBeenCalledWith(
        ['Text 1', 'Text 2', 'Text 3'],
        '@cf/baai/bge-base-en-v1.5',
        {
          batchSize: 10,
          saveToVectorize: true
        }
      )
      expect(result).toEqual({
        success: true,
        data: mockResult,
        message: '3件のテキストの処理を開始しました'
      })
    })

    it('should work with minimal parameters', async () => {
      const mockResult = {
        jobId: 'job-batch-minimal',
        workflowId: 'workflow-batch-minimal',
        status: 'processing',
        textsCount: 2
      }

      mockAIEmbeddings.generateBatchEmbeddings.mockResolvedValue(mockResult)

      const request = new Request('http://localhost/embeddings/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: ['Text 1', 'Text 2']
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockAIEmbeddings.generateBatchEmbeddings).toHaveBeenCalledWith(
        ['Text 1', 'Text 2'],
        undefined,
        {
          batchSize: undefined,
          saveToVectorize: undefined
        }
      )
      expect(result.success).toBe(true)
    })

    it('should return 400 for invalid request body', async () => {
      const request = new Request('http://localhost/embeddings/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // missing required texts field
          model: '@cf/baai/bge-base-en-v1.5'
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result).toHaveProperty('error')
    })

    it('should return 400 for empty texts array', async () => {
      const request = new Request('http://localhost/embeddings/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: []
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result).toHaveProperty('error')
    })

    it('should handle Durable Object errors', async () => {
      mockAIEmbeddings.generateBatchEmbeddings.mockRejectedValue(new Error('Batch processing error'))

      const request = new Request('http://localhost/embeddings/batch', {
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
        message: 'Batch processing error'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockAIEmbeddings.generateBatchEmbeddings.mockRejectedValue('String error')

      const request = new Request('http://localhost/embeddings/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: ['Text 1']
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('バッチ埋め込み生成中にエラーが発生しました')
    })
  })
})