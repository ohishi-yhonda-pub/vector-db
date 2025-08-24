import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { OpenAPIHono } from '@hono/zod-openapi'
import { generateEmbeddingRoute, generateEmbeddingHandler } from '../../../src/routes/api/embeddings/generate'

// Mock AI Embeddings Durable Object
const mockAIEmbeddings = {
  generateEmbedding: vi.fn()
}

// Mock Durable Object namespace
const mockAIEmbeddingsNamespace = {
  idFromName: vi.fn().mockReturnValue('mock-id'),
  get: vi.fn().mockReturnValue(mockAIEmbeddings)
}

describe('Embeddings Routes', () => {
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
    app.openapi(generateEmbeddingRoute, generateEmbeddingHandler)
  })

  describe('POST /embeddings', () => {
    it('should generate embeddings successfully', async () => {
      const mockResult = {
        jobId: 'job-123',
        workflowId: 'workflow-456',
        status: 'processing'
      }

      mockAIEmbeddings.generateEmbedding.mockResolvedValue(mockResult)

      const request = new Request('http://localhost/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Generate embedding for this text',
          model: '@cf/baai/bge-base-en-v1.5'
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockAIEmbeddings.generateEmbedding).toHaveBeenCalledWith(
        'Generate embedding for this text',
        '@cf/baai/bge-base-en-v1.5'
      )
      expect(result).toEqual({
        success: true,
        data: mockResult,
        message: 'テキストの処理を開始しました'
      })
    })

    it('should return 400 for invalid request body', async () => {
      const request = new Request('http://localhost/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // missing required text field
          model: '@cf/baai/bge-base-en-v1.5'
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result).toHaveProperty('error')
      // Hono returns validation errors in this format
      expect(result.error).toBeDefined()
    })

    it('should handle Durable Object errors', async () => {
      mockAIEmbeddings.generateEmbedding.mockRejectedValue(new Error('Durable Object error'))

      const request = new Request('http://localhost/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Generate embedding for this text',
          model: '@cf/baai/bge-base-en-v1.5'
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toHaveProperty('error')
      expect(result.success).toBe(false)
      expect(result.message).toBe('Durable Object error')
    })

    it('should handle non-Error exceptions', async () => {
      mockAIEmbeddings.generateEmbedding.mockRejectedValue('String error')

      const request = new Request('http://localhost/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Generate embedding for this text',
          model: '@cf/baai/bge-base-en-v1.5'
        })
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toHaveProperty('error')
      expect(result.success).toBe(false)
      expect(result.message).toBe('埋め込み生成中にエラーが発生しました')
    })
  })
})