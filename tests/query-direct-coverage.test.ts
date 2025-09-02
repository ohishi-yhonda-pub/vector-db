/**
 * Direct test of queryVectorsList to achieve 100% coverage
 */

import { describe, it, expect, vi } from 'vitest'
import { queryVectorsList } from '../src/vectors'

describe('QueryVectorsList Direct Coverage', () => {
  it('should cover lines 226-227 and 237-243 with successful mapping', async () => {
    // Create mock DB that simulates Drizzle's behavior
    const mockDate1 = new Date('2024-01-01T10:00:00Z')
    const mockDate2 = new Date('2024-01-02T11:00:00Z')
    const mockOrderBy = vi.fn().mockResolvedValue([
      { 
        id: 'vec-1', 
        dimensions: 1536, 
        metadata: { test: true }, 
        createdAt: mockDate1, 
        updatedAt: mockDate1 
      },
      { 
        id: 'vec-2', 
        dimensions: 768, 
        metadata: { test: false }, 
        createdAt: mockDate2, 
        updatedAt: mockDate2 
      }
    ])
    const mockOffset = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset })
    const mockFromVectors = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFromCount = vi.fn().mockResolvedValue([{ count: 2 }])
    
    const mockDb = {
      select: vi.fn().mockImplementation((columns?: any) => {
        if (columns && columns.count) {
          return { from: mockFromCount }
        }
        return { from: mockFromVectors }
      })
    }

    const result = await queryVectorsList(mockDb, 10, 0)
    
    // This covers lines 226-227 (count) and 237-243 (mapping)
    expect(result.total).toBe(2)
    expect(result.vectors).toHaveLength(2)
    expect(result.vectors[0]).toEqual({
      id: 'vec-1',
      dimensions: 1536,
      metadata: { test: true },
      createdAt: '2024-01-01T10:00:00.000Z',
      updatedAt: '2024-01-01T10:00:00.000Z'
    })
    expect(result.vectors[1]).toEqual({
      id: 'vec-2',
      dimensions: 768,
      metadata: { test: false },
      createdAt: '2024-01-02T11:00:00.000Z',
      updatedAt: '2024-01-02T11:00:00.000Z'
    })
  })

  it('should cover line 227 with null count (|| 0 branch)', async () => {
    const mockOrderBy = vi.fn().mockResolvedValue([])
    const mockOffset = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset })
    const mockFromVectors = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFromCount = vi.fn().mockResolvedValue([null]) // null result
    
    const mockDb = {
      select: vi.fn().mockImplementation((columns?: any) => {
        if (columns && columns.count) {
          return { from: mockFromCount }
        }
        return { from: mockFromVectors }
      })
    }

    const result = await queryVectorsList(mockDb, 10, 0)
    
    // This covers the || 0 branch in line 227
    expect(result.total).toBe(0)
    expect(result.vectors).toEqual([])
  })

  it('should cover line 227 with undefined count', async () => {
    const mockOrderBy = vi.fn().mockResolvedValue([])
    const mockOffset = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset })
    const mockFromVectors = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFromCount = vi.fn().mockResolvedValue([{}]) // object without count
    
    const mockDb = {
      select: vi.fn().mockImplementation((columns?: any) => {
        if (columns && columns.count) {
          return { from: mockFromCount }
        }
        return { from: mockFromVectors }
      })
    }

    const result = await queryVectorsList(mockDb, 10, 0)
    
    // This covers the undefined?.count || 0 case
    expect(result.total).toBe(0)
    expect(result.vectors).toEqual([])
  })

  it('should cover lines 230-234 with proper limit/offset', async () => {
    const mockDate = new Date('2024-03-01T12:00:00Z')
    const mockVectors = [
      { id: 'v1', dimensions: 768, metadata: { type: 'a' }, createdAt: mockDate, updatedAt: mockDate },
      { id: 'v2', dimensions: 768, metadata: { type: 'b' }, createdAt: mockDate, updatedAt: mockDate }
    ]
    
    const mockOrderBy = vi.fn().mockResolvedValue(mockVectors)
    const mockOffset = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset })
    const mockFromVectors = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFromCount = vi.fn().mockResolvedValue([{ count: 2 }])
    
    const mockDb = {
      select: vi.fn().mockImplementation((columns?: any) => {
        if (columns && columns.count) {
          return { from: mockFromCount }
        }
        return { from: mockFromVectors }
      })
    }

    const result = await queryVectorsList(mockDb, 25, 10)
    
    // Verify the query chain was called correctly
    expect(mockLimit).toHaveBeenCalledWith(25)
    expect(mockOffset).toHaveBeenCalledWith(10)
    expect(mockOrderBy).toHaveBeenCalled()
    expect(result.vectors).toHaveLength(2)
    expect(result.vectors[0].id).toBe('v1')
    expect(result.vectors[1].id).toBe('v2')
  })

  it('should handle empty vectors list', async () => {
    const mockOrderBy = vi.fn().mockResolvedValue([])
    const mockOffset = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset })
    const mockFromVectors = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFromCount = vi.fn().mockResolvedValue([{ count: 0 }])
    
    const mockDb = {
      select: vi.fn().mockImplementation((columns?: any) => {
        if (columns && columns.count) {
          return { from: mockFromCount }
        }
        return { from: mockFromVectors }
      })
    }

    const result = await queryVectorsList(mockDb, 100, 0)
    
    expect(result.total).toBe(0)
    expect(result.vectors).toEqual([])
  })
})