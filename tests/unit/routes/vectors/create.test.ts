import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { createVectorRoute, createVectorHandler } from '../../../../src/routes/api/vectors/create'
import { 
  createMockEnv, 
  createMockVectorManager, 
  createMockDurableObjectNamespace,
  createMockRequest 
} from '../../test-helpers'

describe('Create Vector Route', () => {
  let app: OpenAPIHono<{ Bindings: Env }>
  let mockEnv: Env
  let mockVectorManager: ReturnType<typeof createMockVectorManager>
  let mockVectorCacheNamespace: ReturnType<typeof createMockDurableObjectNamespace>

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockVectorManager = createMockVectorManager()
    mockVectorCacheNamespace = createMockDurableObjectNamespace(mockVectorManager)
    
    mockEnv = createMockEnv({
      VECTOR_CACHE: mockVectorCacheNamespace as any
    })

    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi(createVectorRoute, createVectorHandler)
  })

  describe('POST /vectors', () => {
    it('should create vector successfully', async () => {
      const mockResult = {
        jobId: 'job-vector-123',
        workflowId: 'workflow-vector-456',
        status: 'processing'
      }

      mockVectorManager.createVectorAsync.mockResolvedValue(mockResult)

      const request = createMockRequest('http://localhost/vectors', {
        method: 'POST',
        body: {
          text: 'Create a vector from this text',
          model: '@cf/baai/bge-base-en-v1.5',
          namespace: 'test-namespace',
          metadata: { category: 'test' }
        }
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(mockVectorManager.createVectorAsync).toHaveBeenCalledWith(
        'Create a vector from this text',
        '@cf/baai/bge-base-en-v1.5',
        'test-namespace',
        { category: 'test' }
      )
      expect(result).toEqual({
        success: true,
        data: {
          jobId: 'job-vector-123',
          workflowId: 'workflow-vector-456',
          status: 'processing',
          message: 'ベクトルの作成を開始しました'
        }
      })
    })

    it('should work with minimal parameters', async () => {
      const mockResult = {
        jobId: 'job-minimal',
        workflowId: 'workflow-minimal',
        status: 'processing'
      }

      mockVectorManager.createVectorAsync.mockResolvedValue(mockResult)

      const request = createMockRequest('http://localhost/vectors', {
        method: 'POST',
        body: {
          text: 'Minimal vector text'
        }
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(mockVectorManager.createVectorAsync).toHaveBeenCalledWith(
        'Minimal vector text',
        undefined,
        undefined,
        undefined
      )
      expect(result.success).toBe(true)
    })

    it('should return 400 for invalid request body', async () => {
      const request = createMockRequest('http://localhost/vectors', {
        method: 'POST',
        body: {
          // missing required text field
          model: '@cf/baai/bge-base-en-v1.5'
        }
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result).toHaveProperty('error')
    })

    it('should return 400 for empty text', async () => {
      const request = createMockRequest('http://localhost/vectors', {
        method: 'POST',
        body: {
          text: ''
        }
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result).toHaveProperty('error')
    })

    it('should handle Durable Object errors', async () => {
      mockVectorManager.createVectorAsync.mockRejectedValue(new Error('Vector creation failed'))

      const request = createMockRequest('http://localhost/vectors', {
        method: 'POST',
        body: {
          text: 'Test vector text'
        }
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Vector creation failed'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockVectorManager.createVectorAsync.mockRejectedValue('Unknown error')

      const request = createMockRequest('http://localhost/vectors', {
        method: 'POST',
        body: {
          text: 'Test vector'
        }
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('ベクトル作成中にエラーが発生しました')
    })
  })
})