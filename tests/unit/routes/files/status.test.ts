import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fileStatusRoute, fileStatusHandler } from '../../../../src/routes/api/files/status'
import { FileProcessingResultSchema } from '../../../../src/schemas/file-upload.schema'
import { setupFileProcessingRouteTest, createMockRequest } from '../../test-helpers'

describe('File Status Route', () => {
  let testSetup: ReturnType<typeof setupFileProcessingRouteTest>

  beforeEach(() => {
    testSetup = setupFileProcessingRouteTest()
    testSetup.app.openapi(fileStatusRoute, fileStatusHandler)
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

      testSetup.mockVectorManager.getFileProcessingJob.mockResolvedValue(mockJob)
      testSetup.mockVectorManager.getFileProcessingWorkflowStatus.mockResolvedValue(mockStatus)

      const request = createMockRequest('http://localhost/files/status/workflow-456', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(testSetup.mockVectorManager.getFileProcessingJob).toHaveBeenCalledWith('workflow-456')
      expect(testSetup.mockVectorManager.getFileProcessingWorkflowStatus).toHaveBeenCalledWith('workflow-456')
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

      testSetup.mockVectorManager.getFileProcessingJob.mockResolvedValue(mockJob)
      testSetup.mockVectorManager.getFileProcessingWorkflowStatus.mockResolvedValue(mockStatus)

      const request = createMockRequest('http://localhost/files/status/workflow-completed', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
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

      testSetup.mockVectorManager.getFileProcessingJob.mockResolvedValue(mockJob)
      testSetup.mockVectorManager.getFileProcessingWorkflowStatus.mockResolvedValue(mockStatus)

      const request = createMockRequest('http://localhost/files/status/workflow-failed', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
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

      testSetup.mockVectorManager.getFileProcessingJob.mockResolvedValue(mockJob)
      testSetup.mockVectorManager.getFileProcessingWorkflowStatus.mockResolvedValue(mockStatus)

      const request = createMockRequest('http://localhost/files/status/workflow-error', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
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

      testSetup.mockVectorManager.getFileProcessingJob.mockResolvedValue(mockJob)
      testSetup.mockVectorManager.getFileProcessingWorkflowStatus.mockResolvedValue(mockStatus)

      const request = createMockRequest('http://localhost/files/status/workflow-unknown', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.status).toBe('unknown')
    })

    it('should handle job not found', async () => {
      testSetup.mockVectorManager.getFileProcessingJob.mockResolvedValue(null)

      const request = createMockRequest('http://localhost/files/status/workflow-notfound', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(result).toEqual({
        success: false,
        error: 'Not Found',
        message: 'ジョブが見つかりません'
      })
    })

    it('should handle workflow not found error', async () => {
      testSetup.mockVectorManager.getFileProcessingJob.mockRejectedValue(new Error('Workflow not found'))

      const request = createMockRequest('http://localhost/files/status/workflow-notfound2', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(result).toEqual({
        success: false,
        error: 'Not Found',
        message: 'ワークフローが見つかりません'
      })
    })

    it('should handle other errors', async () => {
      testSetup.mockVectorManager.getFileProcessingJob.mockRejectedValue(new Error('Database error'))

      const request = createMockRequest('http://localhost/files/status/workflow-error', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Database error'
      })
    })

    it('should handle non-Error exceptions', async () => {
      testSetup.mockVectorManager.getFileProcessingJob.mockRejectedValue('String error')

      const request = createMockRequest('http://localhost/files/status/workflow-string-error', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('状況確認中にエラーが発生しました')
    })

    it('should validate empty workflowId', async () => {
      const request = createMockRequest('http://localhost/files/status/', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      
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

      testSetup.mockVectorManager.getFileProcessingJob.mockResolvedValue(mockJob)
      testSetup.mockVectorManager.getFileProcessingWorkflowStatus.mockResolvedValue(mockStatus)

      const request = createMockRequest('http://localhost/files/status/workflow-mix', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
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

      testSetup.mockVectorManager.getFileProcessingJob.mockResolvedValue(mockJob)
      testSetup.mockVectorManager.getFileProcessingWorkflowStatus.mockResolvedValue(mockStatus)

      const request = createMockRequest('http://localhost/files/status/workflow%2Dspecial%2D123', {
        method: 'GET'
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(testSetup.mockVectorManager.getFileProcessingJob).toHaveBeenCalledWith('workflow-special-123')
    })
  })
})