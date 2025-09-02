import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createVectorFromTextComplete } from '../src/lib/vector-utils'

// Mock the db module
vi.mock('../src/db', () => ({
  createDbClient: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined)
      }))
    }))
  })),
  vectors: 'vectors',
  workflows: 'workflows'
}))

describe('Vector Utils Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle Vectorize failure and store error in D1', async () => {
    const mockEnv = {
      AI: {
        run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] })
      },
      VECTORIZE_INDEX: {
        insert: vi.fn().mockRejectedValue(new Error('Metadata size exceeded'))
      },
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({})
          })
        })
      }
    }

    const result = await createVectorFromTextComplete(
      mockEnv as any,
      'test text',
      'custom-id',
      { category: 'test' }
    )

    // Should return with error but still have id and embedding
    expect(result.id).toBe('custom-id')
    expect(result.embedding).toEqual([0.1, 0.2, 0.3])
    expect(result.error).toBe('Metadata size exceeded')
    
    // Should have tried to insert into Vectorize
    expect(mockEnv.VECTORIZE_INDEX.insert).toHaveBeenCalledWith([{
      id: 'custom-id',
      values: [0.1, 0.2, 0.3],
      metadata: { category: 'test', text: 'test text' }
    }])
  })

  it('should generate ID when not provided', async () => {
    const mockEnv = {
      AI: {
        run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] })
      },
      VECTORIZE_INDEX: {
        insert: vi.fn().mockRejectedValue(new Error('Failed'))
      },
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({})
          })
        })
      }
    }

    const result = await createVectorFromTextComplete(
      mockEnv as any,
      'test',
      undefined,
      {}
    )

    // Should generate an ID
    expect(result.id).toMatch(/^vec_\d+_[a-z0-9]+$/)
    expect(result.error).toBe('Failed')
  })

  it('should handle successful vector creation', async () => {
    const mockEnv = {
      AI: {
        run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] })
      },
      VECTORIZE_INDEX: {
        insert: vi.fn().mockResolvedValue(undefined)
      },
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({})
          })
        })
      }
    }

    const result = await createVectorFromTextComplete(
      mockEnv as any,
      'success text',
      'success-id',
      { type: 'success' }
    )

    // Should succeed without error
    expect(result.id).toBe('success-id')
    expect(result.embedding).toEqual([0.1, 0.2])
    expect(result.error).toBeUndefined()
    
    // Should have inserted into Vectorize
    expect(mockEnv.VECTORIZE_INDEX.insert).toHaveBeenCalledWith([{
      id: 'success-id',
      values: [0.1, 0.2],
      metadata: { type: 'success', text: 'success text' }
    }])
  })

  it('should handle error without message property', async () => {
    const mockEnv = {
      AI: {
        run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] })
      },
      VECTORIZE_INDEX: {
        insert: vi.fn().mockRejectedValue({}) // Error object without message property
      },
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({})
          })
        })
      }
    }

    const result = await createVectorFromTextComplete(
      mockEnv as any,
      'test',
      'test-id',
      {}
    )

    // Should handle error without message
    expect(result.id).toBe('test-id')
    expect(result.embedding).toEqual([0.1, 0.2])
    expect(result.error).toBe('Failed to store in Vectorize')
  })
})