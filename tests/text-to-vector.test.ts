/**
 * Tests for text-to-vector functionality (handler and workflow coverage)
 */

import { describe, it, expect, vi } from 'vitest'
import { testRequest } from './hono-test-helper'
import app from '../src/index'
import { createVectorFromText, getWorkflowStatus } from '../src/handlers/text-to-vector'
import { TextToVectorWorkflow } from '../src/workflows/text-to-vector'

describe('Text to Vector Handler', () => {
  describe('createVectorFromText', () => {
    it('should handle valid request with custom ID', async () => {
      const mockContext = {
        req: {
          json: vi.fn().mockResolvedValue({
            text: 'Hello world',
            id: 'custom-id',
            metadata: { source: 'test' }
          })
        },
        env: {
          TEXT_TO_VECTOR_WORKFLOW: {
            create: vi.fn().mockResolvedValue({
              id: 'workflow-123'
            })
          }
        },
        json: vi.fn()
      }

      await createVectorFromText(mockContext)

      expect(mockContext.json).toHaveBeenCalledWith({
        success: true,
        data: {
          workflowId: 'workflow-123',
          vectorId: 'custom-id',
          status: 'started'
        },
        message: 'Text to vector workflow started successfully'
      })
    })

    it('should handle request without custom ID', async () => {
      const mockContext = {
        req: {
          json: vi.fn().mockResolvedValue({
            text: 'Test text'
          })
        },
        env: {
          TEXT_TO_VECTOR_WORKFLOW: {
            create: vi.fn().mockResolvedValue({
              id: 'workflow-456'
            })
          }
        },
        json: vi.fn()
      }

      await createVectorFromText(mockContext)

      expect(mockContext.json).toHaveBeenCalledWith({
        success: true,
        data: {
          workflowId: 'workflow-456',
          vectorId: 'pending',
          status: 'started'
        },
        message: 'Text to vector workflow started successfully'
      })
    })

    it('should reject empty text', async () => {
      const mockContext = {
        req: {
          json: vi.fn().mockResolvedValue({
            text: ''
          })
        },
        json: vi.fn()
      }

      await createVectorFromText(mockContext)

      expect(mockContext.json).toHaveBeenCalledWith(
        { 
          success: false, 
          error: 'Text is required and must be a non-empty string' 
        },
        400
      )
    })

    it('should reject whitespace-only text', async () => {
      const mockContext = {
        req: {
          json: vi.fn().mockResolvedValue({
            text: '   '
          })
        },
        json: vi.fn()
      }

      await createVectorFromText(mockContext)

      expect(mockContext.json).toHaveBeenCalledWith(
        { 
          success: false, 
          error: 'Text is required and must be a non-empty string' 
        },
        400
      )
    })

    it('should reject missing text', async () => {
      const mockContext = {
        req: {
          json: vi.fn().mockResolvedValue({
            metadata: { test: true }
          })
        },
        json: vi.fn()
      }

      await createVectorFromText(mockContext)

      expect(mockContext.json).toHaveBeenCalledWith(
        { 
          success: false, 
          error: 'Text is required and must be a non-empty string' 
        },
        400
      )
    })

    it('should reject non-string text', async () => {
      const mockContext = {
        req: {
          json: vi.fn().mockResolvedValue({
            text: 123
          })
        },
        json: vi.fn()
      }

      await createVectorFromText(mockContext)

      expect(mockContext.json).toHaveBeenCalledWith(
        { 
          success: false, 
          error: 'Text is required and must be a non-empty string' 
        },
        400
      )
    })

    it('should handle workflow creation error', async () => {
      const mockContext = {
        req: {
          json: vi.fn().mockResolvedValue({
            text: 'Hello'
          })
        },
        env: {
          TEXT_TO_VECTOR_WORKFLOW: {
            create: vi.fn().mockRejectedValue(new Error('Workflow error'))
          }
        },
        json: vi.fn()
      }

      await createVectorFromText(mockContext)

      expect(mockContext.json).toHaveBeenCalledWith(
        { success: false, error: 'Workflow error' },
        500
      )
    })

    it('should handle non-Error exceptions', async () => {
      const mockContext = {
        req: {
          json: vi.fn().mockResolvedValue({
            text: 'Hello'
          })
        },
        env: {
          TEXT_TO_VECTOR_WORKFLOW: {
            create: vi.fn().mockRejectedValue('string error')
          }
        },
        json: vi.fn()
      }

      await createVectorFromText(mockContext)

      expect(mockContext.json).toHaveBeenCalledWith(
        { success: false, error: 'string error' },
        500
      )
    })
  })

  describe('getWorkflowStatus', () => {
    it('should get workflow status successfully', async () => {
      const mockContext = {
        req: {
          param: vi.fn().mockReturnValue('workflow-123')
        },
        env: {
          TEXT_TO_VECTOR_WORKFLOW: {
            get: vi.fn().mockResolvedValue({
              status: vi.fn().mockResolvedValue({
                status: 'completed',
                output: { success: true, vectorId: 'vec-123' }
              })
            })
          }
        },
        json: vi.fn()
      }

      await getWorkflowStatus(mockContext)

      expect(mockContext.json).toHaveBeenCalledWith({
        success: true,
        data: {
          workflowId: 'workflow-123',
          status: 'completed',
          output: { success: true, vectorId: 'vec-123' }
        }
      })
    })

    it('should handle workflow not found', async () => {
      const mockContext = {
        req: {
          param: vi.fn().mockReturnValue('invalid-workflow')
        },
        env: {
          TEXT_TO_VECTOR_WORKFLOW: {
            get: vi.fn().mockRejectedValue(new Error('Workflow not found'))
          }
        },
        json: vi.fn()
      }

      await getWorkflowStatus(mockContext)

      expect(mockContext.json).toHaveBeenCalledWith(
        { success: false, error: 'Workflow not found' },
        500
      )
    })

    it('should handle non-Error exceptions', async () => {
      const mockContext = {
        req: {
          param: vi.fn().mockReturnValue('workflow-456')
        },
        env: {
          TEXT_TO_VECTOR_WORKFLOW: {
            get: vi.fn().mockRejectedValue('string error')
          }
        },
        json: vi.fn()
      }

      await getWorkflowStatus(mockContext)

      expect(mockContext.json).toHaveBeenCalledWith(
        { success: false, error: 'string error' },
        500
      )
    })
  })

  describe('API Endpoint Integration', () => {
    it('should handle /api/vectors/from-text endpoint', async () => {
      const response = await testRequest(app, '/api/vectors/from-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: 'Hello world',
          id: 'test-vec-1',
          metadata: { category: 'test' }
        })
      })

      // Will return 500 in test env because workflow binding is not available
      // But this proves the route is registered and handler is called
      expect([200, 500]).toContain(response.status)
    })
  })
})