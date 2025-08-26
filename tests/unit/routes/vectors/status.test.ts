import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { getJobStatusRoute, getJobStatusHandler, getAllJobsRoute, getAllJobsHandler } from '../../../../src/routes/api/vectors/status'

// Mock Vector Manager Durable Object
const mockVectorManager = {
  getJobStatus: vi.fn(),
  getAllJobs: vi.fn()
}

// Mock Durable Object namespace
const mockVectorCacheNamespace = {
  idFromName: vi.fn().mockReturnValue('mock-id'),
  get: vi.fn().mockReturnValue(mockVectorManager)
}

describe('Vector Job Status Routes', () => {
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
    app.openapi(getJobStatusRoute, getJobStatusHandler)
    app.openapi(getAllJobsRoute, getAllJobsHandler)
  })

  describe('GET /vectors/jobs/{jobId}', () => {
    it('should return job status successfully', async () => {
      const mockJob = {
        id: 'job-123',
        type: 'create',
        status: 'completed',
        createdAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:01:00Z',
        text: 'Test text',
        model: '@cf/baai/bge-base-en-v1.5',
        namespace: 'test',
        metadata: { test: 'value' },
        vectorId: 'vec-123'
      }

      mockVectorManager.getJobStatus.mockResolvedValueOnce(mockJob)

      const response = await app.request('/vectors/jobs/job-123', {
        method: 'GET',
      }, mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json).toEqual({
        success: true,
        data: mockJob
      })
      
      expect(mockVectorCacheNamespace.idFromName).toHaveBeenCalledWith('default')
      expect(mockVectorCacheNamespace.get).toHaveBeenCalledWith('mock-id')
      expect(mockVectorManager.getJobStatus).toHaveBeenCalledWith('job-123')
    })

    it('should return 404 when job not found', async () => {
      mockVectorManager.getJobStatus.mockResolvedValueOnce(undefined)

      const response = await app.request('/vectors/jobs/non-existent-job', {
        method: 'GET',
      }, mockEnv)

      expect(response.status).toBe(404)
      const json = await response.json()
      expect(json).toEqual({
        success: false,
        error: 'Not Found',
        message: 'ジョブ non-existent-job が見つかりません'
      })
    })

    it('should handle errors gracefully', async () => {
      mockVectorManager.getJobStatus.mockRejectedValueOnce(new Error('Database error'))

      const response = await app.request('/vectors/jobs/job-123', {
        method: 'GET',
      }, mockEnv)

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Database error'
      })
    })

    it('should handle invalid job data gracefully', async () => {
      const invalidJob = {
        id: 'job-123',
        // Missing required fields
        type: 'invalid-type',
        status: 'invalid-status'
      }

      mockVectorManager.getJobStatus.mockResolvedValueOnce(invalidJob)

      const response = await app.request('/vectors/jobs/job-123', {
        method: 'GET',
      }, mockEnv)

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json.success).toBe(false)
      expect(json.error).toBe('Internal Server Error')
    })
  })

  describe('GET /vectors/jobs', () => {
    it('should return all jobs successfully', async () => {
      const mockJobs = [
        {
          id: 'job-123',
          type: 'create',
          status: 'completed',
          createdAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
          text: 'Test text 1',
          model: '@cf/baai/bge-base-en-v1.5',
          namespace: 'test',
          metadata: { test: 'value1' },
          vectorId: 'vec-123'
        },
        {
          id: 'job-456',
          type: 'delete',
          status: 'processing',
          createdAt: '2024-01-01T00:02:00Z',
          vectorIds: ['vec-001', 'vec-002']
        }
      ]

      mockVectorManager.getAllJobs.mockResolvedValueOnce(mockJobs)

      const response = await app.request('/vectors/jobs', {
        method: 'GET',
      }, mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json).toEqual({
        success: true,
        data: {
          jobs: mockJobs,
          total: 2
        }
      })
      
      expect(mockVectorCacheNamespace.idFromName).toHaveBeenCalledWith('default')
      expect(mockVectorCacheNamespace.get).toHaveBeenCalledWith('mock-id')
      expect(mockVectorManager.getAllJobs).toHaveBeenCalled()
    })

    it('should return empty array when no jobs exist', async () => {
      mockVectorManager.getAllJobs.mockResolvedValueOnce([])

      const response = await app.request('/vectors/jobs', {
        method: 'GET',
      }, mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json).toEqual({
        success: true,
        data: {
          jobs: [],
          total: 0
        }
      })
    })

    it('should handle errors gracefully', async () => {
      mockVectorManager.getAllJobs.mockRejectedValueOnce(new Error('Database connection failed'))

      const response = await app.request('/vectors/jobs', {
        method: 'GET',
      }, mockEnv)

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Database connection failed'
      })
    })

    it('should handle non-Error exceptions in getJobStatus', async () => {
      mockVectorManager.getJobStatus.mockRejectedValueOnce('String error')

      const response = await app.request('/vectors/jobs/job-123', {
        method: 'GET',
      }, mockEnv)

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'ジョブステータス取得中にエラーが発生しました'
      })
    })

    it('should handle non-Error exceptions in getAllJobs', async () => {
      mockVectorManager.getAllJobs.mockRejectedValueOnce('String error')

      const response = await app.request('/vectors/jobs', {
        method: 'GET',
      }, mockEnv)

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'ジョブ一覧取得中にエラーが発生しました'
      })
    })

    it('should handle invalid jobs data gracefully', async () => {
      const invalidJobs = [
        {
          id: 'job-123',
          // Missing required fields
          type: 'invalid-type'
        }
      ]

      mockVectorManager.getAllJobs.mockResolvedValueOnce(invalidJobs)

      const response = await app.request('/vectors/jobs', {
        method: 'GET',
      }, mockEnv)

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json.success).toBe(false)
      expect(json.error).toBe('Internal Server Error')
    })
  })
})