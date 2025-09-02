/**
 * Tests for text-to-vector handler functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createVectorFromText, listWorkflows, getWorkflowStatus } from '../src/handlers/text-to-vector'

// Mock the db module
vi.mock('../src/db', () => ({
  createDbClient: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(true)
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            offset: vi.fn().mockResolvedValue([
              {
                id: 'wf_123',
                vectorId: 'vec_123',
                status: 'completed',
                input: { text: 'test' },
                output: { success: true },
                error: null,
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date('2024-01-01')
              }
            ])
          }))
        }))
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(true)
      }))
    }))
  })),
  workflows: {},
  vectors: {}
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual('drizzle-orm')
  return {
    ...actual,
    eq: vi.fn((field, value) => ({ field, value })),
    desc: vi.fn((field) => ({ field, desc: true })),
    count: vi.fn(() => ({ count: vi.fn() }))
  }
})

describe('Text to Vector Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createVectorFromText', () => {
    it('should create vector from text successfully', async () => {
      const mockContext = {
        req: {
          json: vi.fn().mockResolvedValue({
            text: 'Hello world',
            metadata: { category: 'test' }
          })
        },
        json: vi.fn((data) => data),
        env: {
          DB: {},
          TEXT_TO_VECTOR_WORKFLOW: {
            create: vi.fn().mockResolvedValue({
              id: 'wf_123456'
            })
          }
        }
      }

      const result = await createVectorFromText(mockContext)

      expect(result.success).toBe(true)
      expect(result.data.workflowId).toBe('wf_123456')
      expect(result.data.status).toBe('started')
    })

    it('should handle empty text error', async () => {
      const mockContext = {
        req: {
          json: vi.fn().mockResolvedValue({
            text: ''
          })
        },
        json: vi.fn((data, status) => ({ data, status })),
        env: {
          DB: {},
          TEXT_TO_VECTOR_WORKFLOW: {}
        }
      }

      const result = await createVectorFromText(mockContext)

      expect(result.data.success).toBe(false)
      expect(result.data.error).toBe('Text is required and must be a non-empty string')
      expect(result.status).toBe(400)
    })

    it('should handle whitespace-only text', async () => {
      const mockContext = {
        req: {
          json: vi.fn().mockResolvedValue({
            text: '   '
          })
        },
        json: vi.fn((data, status) => ({ data, status })),
        env: {
          DB: {},
          TEXT_TO_VECTOR_WORKFLOW: {}
        }
      }

      const result = await createVectorFromText(mockContext)

      expect(result.data.success).toBe(false)
      expect(result.data.error).toBe('Text is required and must be a non-empty string')
      expect(result.status).toBe(400)
    })

    it('should handle non-string text', async () => {
      const mockContext = {
        req: {
          json: vi.fn().mockResolvedValue({
            text: 123
          })
        },
        json: vi.fn((data, status) => ({ data, status })),
        env: {
          DB: {},
          TEXT_TO_VECTOR_WORKFLOW: {}
        }
      }

      const result = await createVectorFromText(mockContext)

      expect(result.data.success).toBe(false)
      expect(result.data.error).toBe('Text is required and must be a non-empty string')
      expect(result.status).toBe(400)
    })

    it('should handle workflow creation error', async () => {
      const mockContext = {
        req: {
          json: vi.fn().mockResolvedValue({
            text: 'Hello world'
          })
        },
        json: vi.fn((data, status) => ({ data, status })),
        env: {
          DB: {},
          TEXT_TO_VECTOR_WORKFLOW: {
            create: vi.fn().mockRejectedValue(new Error('Workflow creation failed'))
          }
        }
      }

      const result = await createVectorFromText(mockContext)

      expect(result.data.success).toBe(false)
      expect(result.data.error).toBe('Workflow creation failed')
      expect(result.status).toBe(500)
    })

    it('should handle non-Error exceptions', async () => {
      const mockContext = {
        req: {
          json: vi.fn().mockResolvedValue({
            text: 'Hello world'
          })
        },
        json: vi.fn((data, status) => ({ data, status })),
        env: {
          DB: {},
          TEXT_TO_VECTOR_WORKFLOW: {
            create: vi.fn().mockRejectedValue('string error')
          }
        }
      }

      const result = await createVectorFromText(mockContext)

      expect(result.data.success).toBe(false)
      expect(result.data.error).toBe('string error')
      expect(result.status).toBe(500)
    })

    it('should handle custom vector ID', async () => {
      const mockContext = {
        req: {
          json: vi.fn().mockResolvedValue({
            text: 'Hello world',
            id: 'custom-vec-123'
          })
        },
        json: vi.fn((data) => data),
        env: {
          DB: {},
          TEXT_TO_VECTOR_WORKFLOW: {
            create: vi.fn().mockResolvedValue({
              id: 'wf_123456'
            })
          }
        }
      }

      const result = await createVectorFromText(mockContext)

      expect(result.success).toBe(true)
      expect(result.data.vectorId).toBe('custom-vec-123')
    })
  })

  describe('listWorkflows', () => {
    it('should return not implemented message', async () => {
      const mockContext = {
        req: {
          query: vi.fn().mockReturnValue({})
        },
        json: vi.fn((data) => data),
        env: {
          DB: {}
        }
      }

      // Import and update the mock
      const { createDbClient } = await import('../src/db')
      
      // Create a mock query object with chainable methods
      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([])
      }
      
      const mockSelect = vi.fn()
      
      // First call for main query
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue(mockQuery)
      })
      
      // Second call for count
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockResolvedValue([{ count: 0 }])
      })
      
      ;(createDbClient as any).mockReturnValue({
        select: mockSelect,
        insert: vi.fn(() => ({
          values: vi.fn().mockResolvedValue(true)
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn().mockResolvedValue(true)
          }))
        }))
      })

      const result = await listWorkflows(mockContext)

      expect(result.success).toBe(true)
      expect(result.data.workflows).toEqual([])
    })

    it('should handle listWorkflows error', async () => {
      const mockContext = {
        req: {
          query: vi.fn().mockReturnValue({})
        },
        json: vi.fn((data, status) => ({ data, status })),
        env: {
          DB: {}
        }
      }

      const { createDbClient } = await import('../src/db')
      ;(createDbClient as any).mockImplementation(() => {
        throw new Error('Database error')
      })

      const result = await listWorkflows(mockContext)

      expect(result.data.success).toBe(false)
      expect(result.data.error).toBe('Database error')
      expect(result.status).toBe(500)
    })

    it('should handle non-Error exceptions in listWorkflows', async () => {
      const mockContext = {
        req: {
          query: vi.fn().mockReturnValue({})
        },
        json: vi.fn((data, status) => ({ data, status })),
        env: {
          DB: {}
        }
      }

      const { createDbClient } = await import('../src/db')
      ;(createDbClient as any).mockImplementation(() => {
        throw 'string error'
      })

      const result = await listWorkflows(mockContext)

      expect(result.data.success).toBe(false)
      expect(result.data.error).toBe('string error')
      expect(result.status).toBe(500)
    })

    it('should filter workflows by status', async () => {
      const mockContext = {
        req: {
          query: vi.fn().mockReturnValue({ status: 'completed' })
        },
        json: vi.fn((data) => data),
        env: {
          DB: {}
        }
      }

      // Import and update the mock
      const { createDbClient } = await import('../src/db')
      
      // Create a mock query object with chainable methods
      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([
          {
            id: 'wf_completed',
            vectorId: 'vec_completed',
            status: 'completed',
            input: { text: 'test' },
            output: { success: true },
            error: null,
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01')
          }
        ])
      }
      
      const mockSelect = vi.fn()
      
      // First call for main query
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue(mockQuery)
      })
      
      // Second call for count
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockResolvedValue([{ count: 1 }])
      })
      
      ;(createDbClient as any).mockReturnValue({
        select: mockSelect,
        insert: vi.fn(() => ({
          values: vi.fn().mockResolvedValue(true)
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn().mockResolvedValue(true)
          }))
        }))
      })

      const result = await listWorkflows(mockContext)

      expect(result.success).toBe(true)
      expect(result.data.workflows).toHaveLength(1)
      expect(result.data.workflows[0].status).toBe('completed')
      expect(mockQuery.where).toHaveBeenCalled()
    })
  })
})