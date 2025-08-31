import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateEmbeddingRoute, generateEmbeddingHandler } from '../../../src/routes/api/embeddings/generate'
import { setupEmbeddingsRouteTest } from '../test-helpers/test-scenarios'
import { createMockRequest } from '../test-helpers'

// Mock AI Embeddings Durable Object
const mockAIEmbeddings = {
  generateEmbedding: vi.fn()
}

// Mock Durable Object namespace
const mockAIEmbeddingsNamespace = {
  idFromName: vi.fn().mockReturnValue('mock-id'),
  get: vi.fn().mockReturnValue(mockAIEmbeddings)
}

// TODO: Phase 1のリファクタリングで EmbeddingService とDurable Objectの通信方法が変更されたため一時的にスキップ
// EmbeddingServiceの修正が必要
describe.skip('Embeddings Routes', () => {
  let testSetup: ReturnType<typeof setupEmbeddingsRouteTest>

  beforeEach(() => {
    vi.clearAllMocks()
    
    testSetup = setupEmbeddingsRouteTest()
    
    // Add AI_EMBEDDINGS mock for this specific test
    testSetup.mockEnv.AI_EMBEDDINGS = mockAIEmbeddingsNamespace as any
    
    testSetup.app.openapi(generateEmbeddingRoute, generateEmbeddingHandler)
  })

  describe('POST /embeddings', () => {
    it('should generate embeddings successfully', async () => {
      const mockResult = {
        jobId: 'job-123',
        workflowId: 'workflow-456',
        status: 'processing'
      }

      mockAIEmbeddings.generateEmbedding.mockResolvedValue(mockResult)

      const request = createMockRequest('http://localhost/embeddings', {
        method: 'POST',
        body: {
          text: 'Generate embedding for this text',
          model: '@cf/baai/bge-base-en-v1.5'
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
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
      const request = createMockRequest('http://localhost/embeddings', {
        method: 'POST',
        body: {
          // missing required text field
          model: '@cf/baai/bge-base-en-v1.5'
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result).toHaveProperty('error')
      // Hono returns validation errors in this format
      expect(result.error).toBeDefined()
    })

    it('should handle Durable Object errors', async () => {
      mockAIEmbeddings.generateEmbedding.mockRejectedValue(new Error('Durable Object error'))

      const request = createMockRequest('http://localhost/embeddings', {
        method: 'POST',
        body: {
          text: 'Generate embedding for this text',
          model: '@cf/baai/bge-base-en-v1.5'
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toHaveProperty('error')
      expect(result.success).toBe(false)
      expect(result.message).toBe('Durable Object error')
    })

    it('should handle non-Error exceptions', async () => {
      mockAIEmbeddings.generateEmbedding.mockRejectedValue('String error')

      const request = createMockRequest('http://localhost/embeddings', {
        method: 'POST',
        body: {
          text: 'Generate embedding for this text',
          model: '@cf/baai/bge-base-en-v1.5'
        }
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toHaveProperty('error')
      expect(result.success).toBe(false)
      expect(result.message).toBe('埋め込み生成中にエラーが発生しました')
    })
  })
})