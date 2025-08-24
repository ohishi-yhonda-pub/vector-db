import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { deleteVectorRoute, deleteVectorHandler } from '../../../../src/routes/api/vectors/delete'

// Mock Vector Manager Durable Object
const mockVectorManager = {
  deleteVectorsAsync: vi.fn()
}

// Mock Durable Object namespace
const mockVectorCacheNamespace = {
  idFromName: vi.fn().mockReturnValue('mock-id'),
  get: vi.fn().mockReturnValue(mockVectorManager)
}

describe('Delete Vector Route', () => {
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
      VECTOR_CACHE: mockVectorCacheNamespace as any,
      NOTION_MANAGER: {} as any,
      AI_EMBEDDINGS: {} as any,
      DB: {} as any,
      BATCH_EMBEDDINGS_WORKFLOW: {} as any,
      VECTOR_OPERATIONS_WORKFLOW: {} as any,
      FILE_PROCESSING_WORKFLOW: {} as any,
      NOTION_SYNC_WORKFLOW: {} as any
    }

    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi(deleteVectorRoute, deleteVectorHandler)
  })

  describe('DELETE /vectors/{id}', () => {
    it('should delete vector successfully', async () => {
      const mockResult = {
        jobId: 'job-delete-123',
        workflowId: 'workflow-delete-456',
        status: 'processing'
      }

      mockVectorManager.deleteVectorsAsync.mockResolvedValue(mockResult)

      const request = new Request('http://localhost/vectors/vector-123', {
        method: 'DELETE'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(mockVectorManager.deleteVectorsAsync).toHaveBeenCalledWith(['vector-123'])
      expect(result).toEqual({
        success: true,
        data: {
          jobId: 'job-delete-123',
          workflowId: 'workflow-delete-456',
          status: 'processing',
          message: 'ベクトルの削除を開始しました'
        }
      })
    })

    it('should handle special characters in vector ID', async () => {
      const mockResult = {
        jobId: 'job-special',
        workflowId: 'workflow-special',
        status: 'processing'
      }

      mockVectorManager.deleteVectorsAsync.mockResolvedValue(mockResult)

      const request = new Request('http://localhost/vectors/vector%2D123%2Dtest', {
        method: 'DELETE'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(mockVectorManager.deleteVectorsAsync).toHaveBeenCalledWith(['vector-123-test'])
      expect(result.success).toBe(true)
    })

    it('should validate empty ID parameter', async () => {
      const request = new Request('http://localhost/vectors/', {
        method: 'DELETE'
      })

      const response = await app.fetch(request, mockEnv)
      
      expect(response.status).toBe(404) // Route not found
    })

    it('should handle Durable Object errors', async () => {
      mockVectorManager.deleteVectorsAsync.mockRejectedValue(new Error('Delete operation failed'))

      const request = new Request('http://localhost/vectors/vector-error', {
        method: 'DELETE'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Delete operation failed'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockVectorManager.deleteVectorsAsync.mockRejectedValue({ code: 'DELETE_ERROR' })

      const request = new Request('http://localhost/vectors/vector-unknown', {
        method: 'DELETE'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('ベクトルの削除中にエラーが発生しました')
    })

    it('should handle network errors', async () => {
      mockVectorManager.deleteVectorsAsync.mockRejectedValue(new Error('Network timeout'))

      const request = new Request('http://localhost/vectors/vector-timeout', {
        method: 'DELETE'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Network timeout'
      })
    })

    it('should handle concurrent delete requests', async () => {
      const mockResult1 = {
        jobId: 'job-concurrent-1',
        workflowId: 'workflow-concurrent-1',
        status: 'processing'
      }

      const mockResult2 = {
        jobId: 'job-concurrent-2',
        workflowId: 'workflow-concurrent-2',
        status: 'processing'
      }

      mockVectorManager.deleteVectorsAsync
        .mockResolvedValueOnce(mockResult1)
        .mockResolvedValueOnce(mockResult2)

      const request1 = new Request('http://localhost/vectors/vector-1', {
        method: 'DELETE'
      })

      const request2 = new Request('http://localhost/vectors/vector-2', {
        method: 'DELETE'
      })

      const [response1, response2] = await Promise.all([
        app.fetch(request1, mockEnv),
        app.fetch(request2, mockEnv)
      ])

      expect(response1.status).toBe(202)
      expect(response2.status).toBe(202)
      expect(mockVectorManager.deleteVectorsAsync).toHaveBeenCalledTimes(2)
    })
  })
})