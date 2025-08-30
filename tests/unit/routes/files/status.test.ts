import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { fileStatusRoute, fileStatusHandler } from '../../../../src/routes/api/files/status'
import { FileProcessingResultSchema } from '../../../../src/schemas/file-upload.schema'

// Mock Vector Manager Durable Object
const mockVectorManager = {
  getFileProcessingJob: vi.fn(),
  getFileProcessingWorkflowStatus: vi.fn()
}

// Mock Durable Object namespace
const mockVectorCacheNamespace = {
  idFromName: vi.fn().mockReturnValue('mock-id'),
  get: vi.fn().mockReturnValue(mockVectorManager)
}

describe('File Status Route', () => {
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
      NOTION_API_KEY: '',
      AI: {} as Ai,
      VECTORIZE_INDEX: {} as VectorizeIndex,
      VECTOR_CACHE: mockVectorCacheNamespace as any,
      NOTION_MANAGER: {} as any,
      AI_EMBEDDINGS: {} as any,
      DB: {} as D1Database,
      EMBEDDINGS_WORKFLOW: {} as Workflow,
      BATCH_EMBEDDINGS_WORKFLOW: {} as Workflow,
      VECTOR_OPERATIONS_WORKFLOW: {} as Workflow,
      FILE_PROCESSING_WORKFLOW: {} as Workflow,
      NOTION_SYNC_WORKFLOW: {} as Workflow
    }

    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi(fileStatusRoute, fileStatusHandler)
  })

  describe('GET /files/status/{workflowId}', () => {
    it('should get status of running workflow', async () => {
      const mockJob = {
        jobId: 'job-123',
        workflowId: 'workflow-456',
        status: 'processing',
        createdAt: Date.now()
      }

      const mockStatus = {
        status: 'running'
      }

      mockVectorManager.getFileProcessingJob.mockResolvedValue(mockJob)
      mockVectorManager.getFileProcessingWorkflowStatus.mockResolvedValue(mockStatus)

      const request = new Request('http://localhost/files/status/workflow-456', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockVectorManager.getFileProcessingJob).toHaveBeenCalledWith('workflow-456')
      expect(mockVectorManager.getFileProcessingWorkflowStatus).toHaveBeenCalledWith('workflow-456')
      expect(result).toEqual({
        success: true,
        data: {
          workflowId: 'workflow-456',
          status: 'running',
          result: undefined,
          error: undefined
        }
      })
    })

    it('should get status of completed workflow with result', async () => {
      const mockJob = {
        jobId: 'job-completed',
        workflowId: 'workflow-completed',
        status: 'completed',
        createdAt: Date.now()
      }

      const mockResult = {
        type: 'pdf' as const,
        success: true,
        content: {
          text: 'Extracted content',
          extractedPages: 10
        },
        vectorIds: ['vec1', 'vec2', 'vec3', 'vec4', 'vec5']
      }

      const mockStatus = {
        status: 'complete',
        output: mockResult
      }

      mockVectorManager.getFileProcessingJob.mockResolvedValue(mockJob)
      mockVectorManager.getFileProcessingWorkflowStatus.mockResolvedValue(mockStatus)

      const request = new Request('http://localhost/files/status/workflow-completed', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result).toEqual({
        success: true,
        data: {
          workflowId: 'workflow-completed',
          status: 'completed',
          result: mockResult,
          error: undefined
        }
      })
    })

    it('should get status of failed workflow with error', async () => {
      const mockJob = {
        jobId: 'job-failed',
        workflowId: 'workflow-failed',
        status: 'failed',
        error: 'Processing failed',
        createdAt: Date.now()
      }

      const mockStatus = {
        status: 'errored',
        error: 'Workflow error'
      }

      mockVectorManager.getFileProcessingJob.mockResolvedValue(mockJob)
      mockVectorManager.getFileProcessingWorkflowStatus.mockResolvedValue(mockStatus)

      const request = new Request('http://localhost/files/status/workflow-failed', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result).toEqual({
        success: true,
        data: {
          workflowId: 'workflow-failed',
          status: 'failed',
          result: undefined,
          error: 'Processing failed'
        }
      })
    })

    it('should handle workflow with error from status', async () => {
      const mockJob = {
        jobId: 'job-error',
        workflowId: 'workflow-error',
        status: 'processing',
        createdAt: Date.now()
      }

      const mockStatus = {
        status: 'errored',
        error: 'Status error'
      }

      mockVectorManager.getFileProcessingJob.mockResolvedValue(mockJob)
      mockVectorManager.getFileProcessingWorkflowStatus.mockResolvedValue(mockStatus)

      const request = new Request('http://localhost/files/status/workflow-error', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.status).toBe('running') // job.status is 'processing' so it maps to 'running'
      expect(result.data.error).toBe('Status error')
    })

    it('should handle unknown status', async () => {
      const mockJob = {
        jobId: 'job-unknown',
        workflowId: 'workflow-unknown',
        status: 'unknown',
        createdAt: Date.now()
      }

      const mockStatus = {
        status: 'unknown'
      }

      mockVectorManager.getFileProcessingJob.mockResolvedValue(mockJob)
      mockVectorManager.getFileProcessingWorkflowStatus.mockResolvedValue(mockStatus)

      const request = new Request('http://localhost/files/status/workflow-unknown', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.status).toBe('unknown')
    })

    it('should handle job not found', async () => {
      mockVectorManager.getFileProcessingJob.mockResolvedValue(null)

      const request = new Request('http://localhost/files/status/workflow-notfound', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(result).toEqual({
        success: false,
        error: 'Not Found',
        message: 'ジョブが見つかりません'
      })
    })

    it('should handle workflow not found error', async () => {
      mockVectorManager.getFileProcessingJob.mockRejectedValue(new Error('Workflow not found'))

      const request = new Request('http://localhost/files/status/workflow-notfound2', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(result).toEqual({
        success: false,
        error: 'Not Found',
        message: 'ワークフローが見つかりません'
      })
    })

    it('should handle other errors', async () => {
      mockVectorManager.getFileProcessingJob.mockRejectedValue(new Error('Database error'))

      const request = new Request('http://localhost/files/status/workflow-error', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Database error'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockVectorManager.getFileProcessingJob.mockRejectedValue('String error')

      const request = new Request('http://localhost/files/status/workflow-string-error', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('状況確認中にエラーが発生しました')
    })

    it('should validate empty workflowId', async () => {
      const request = new Request('http://localhost/files/status/', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      
      expect(response.status).toBe(404) // Route not found
    })

    it('should handle status with both job and workflow having different statuses', async () => {
      const mockJob = {
        jobId: 'job-mix',
        workflowId: 'workflow-mix',
        status: 'completed',
        createdAt: Date.now()
      }

      const mockStatus = {
        status: 'running'
      }

      mockVectorManager.getFileProcessingJob.mockResolvedValue(mockJob)
      mockVectorManager.getFileProcessingWorkflowStatus.mockResolvedValue(mockStatus)

      const request = new Request('http://localhost/files/status/workflow-mix', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.status).toBe('running') // Workflow status takes precedence
    })

    it('should handle special characters in workflowId', async () => {
      const mockJob = {
        jobId: 'job-special',
        workflowId: 'workflow-special-123',
        status: 'processing',
        createdAt: Date.now()
      }

      const mockStatus = {
        status: 'running'
      }

      mockVectorManager.getFileProcessingJob.mockResolvedValue(mockJob)
      mockVectorManager.getFileProcessingWorkflowStatus.mockResolvedValue(mockStatus)

      const request = new Request('http://localhost/files/status/workflow%2Dspecial%2D123', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockVectorManager.getFileProcessingJob).toHaveBeenCalledWith('workflow-special-123')
    })
  })
})