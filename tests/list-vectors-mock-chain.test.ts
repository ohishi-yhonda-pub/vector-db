/**
 * Test to cover line 261 in listVectors
 */

import { describe, it, expect, vi } from 'vitest'
import { listVectors } from '../src/vectors'

// Mock the db module before any imports
vi.mock('../src/db', () => ({
  createDbClient: vi.fn(() => {
    // Return a mock db that simulates Drizzle's behavior
    const mockOrderBy = vi.fn().mockResolvedValue([
      {
        id: 'vec-1',
        dimensions: 1536,
        metadata: { test: true },
        createdAt: new Date('2024-01-01T10:00:00Z'),
        updatedAt: new Date('2024-01-01T11:00:00Z')
      }
    ])
    const mockOffset = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset })
    const mockFrom = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFromCount = vi.fn().mockResolvedValue([{ count: 1 }])
    
    return {
      select: vi.fn().mockImplementation((columns?: any) => {
        if (columns && columns.count) {
          return { from: mockFromCount }
        }
        return { from: mockFrom }
      })
    }
  }),
  vectors: {},
  count: () => ({ count: vi.fn() }),
  desc: (col: any) => col
}))

describe('ListVectors Mock Chain', () => {
  it('should cover line 261 - successful return', async () => {
    const mockContext = {
      req: {
        query: vi.fn().mockReturnValue({ limit: '10', offset: '5' })
      },
      json: vi.fn((data) => data),
      env: {
        DB: {}
      }
    }

    const result = await listVectors(mockContext)

    // This should cover line 261 - successful return
    expect(result).toEqual({
      success: true,
      data: {
        vectors: [
          {
            id: 'vec-1',
            dimensions: 1536,
            metadata: { test: true },
            createdAt: '2024-01-01T10:00:00.000Z',
            updatedAt: '2024-01-01T11:00:00.000Z'
          }
        ],
        total: 1,
        limit: 10,
        offset: 5
      }
    })
  })

  it('should cover line 273 - ZodError return', async () => {
    const mockContext = {
      req: {
        query: vi.fn().mockReturnValue({ limit: '5000' })
      },
      json: vi.fn((data, status) => ({ data, status })),
      env: {
        DB: {}
      }
    }

    const result = await listVectors(mockContext)

    // This should cover line 273 - ZodError return
    expect(result.data).toEqual({
      success: false,
      error: 'Invalid request: Limit must be between 1 and 1000'
    })
    expect(result.status).toBe(400)
  })
})