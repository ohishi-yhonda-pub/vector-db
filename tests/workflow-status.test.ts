/**
 * Tests for workflow status endpoint
 */

import { describe, it, expect, vi } from 'vitest'
import { getWorkflowStatus } from '../src/handlers/text-to-vector'

// Mock the db module
vi.mock('../src/db', () => ({
  createDbClient: vi.fn(() => ({
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(true)
      }))
    }))
  })),
  workflows: {}
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ field, value }))
}))

describe('Workflow Status', () => {
  it('should get workflow status successfully', async () => {
    const mockContext = {
      req: {
        param: vi.fn().mockReturnValue('wf_123456')
      },
      json: vi.fn((data) => data),
      env: {
        DB: {},
        TEXT_TO_VECTOR_WORKFLOW: {
          get: vi.fn().mockResolvedValue({
            status: vi.fn().mockResolvedValue({
              status: 'completed',
              output: { vectorId: 'vec_123', success: true }
            })
          })
        }
      }
    }

    const result = await getWorkflowStatus(mockContext)

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      workflowId: 'wf_123456',
      status: 'completed',
      output: { vectorId: 'vec_123', success: true }
    })
  })

  it('should handle workflow not found', async () => {
    const mockContext = {
      req: {
        param: vi.fn().mockReturnValue('invalid_id')
      },
      json: vi.fn((data, status) => ({ data, status })),
      env: {
        DB: {},
        TEXT_TO_VECTOR_WORKFLOW: {
          get: vi.fn().mockRejectedValue(new Error('Workflow not found'))
        }
      }
    }

    const result = await getWorkflowStatus(mockContext)

    expect(result.data.success).toBe(false)
    expect(result.data.error).toBe('Workflow not found')
    expect(result.status).toBe(500)
  })

  it('should handle workflow in progress', async () => {
    const mockContext = {
      req: {
        param: vi.fn().mockReturnValue('wf_in_progress')
      },
      json: vi.fn((data) => data),
      env: {
        DB: {},
        TEXT_TO_VECTOR_WORKFLOW: {
          get: vi.fn().mockResolvedValue({
            status: vi.fn().mockResolvedValue({
              status: 'running',
              output: null
            })
          })
        }
      }
    }

    const result = await getWorkflowStatus(mockContext)

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      workflowId: 'wf_in_progress',
      status: 'running',
      output: null
    })
  })
})