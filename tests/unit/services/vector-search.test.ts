import { describe, it, expect, beforeEach, vi } from 'vitest'
import { VectorSearch } from '../../../src/services/vector-search'

describe('VectorSearch', () => {
  let search: VectorSearch
  let mockEnv: Env
  let mockVectorizeIndex: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockVectorizeIndex = {
      query: vi.fn(),
      getByIds: vi.fn()
    }

    mockEnv = {
      VECTORIZE_INDEX: mockVectorizeIndex
    } as any

    search = new VectorSearch(mockEnv)
  })

  describe('query', () => {
    it('should query vectors', async () => {
      const vector = [0.1, 0.2, 0.3]
      const options: VectorizeQueryOptions = {
        topK: 5,
        namespace: 'test',
        returnMetadata: true
      }
      const mockMatches: VectorizeMatches = {
        matches: [
          { id: 'vec-1', score: 0.95 },
          { id: 'vec-2', score: 0.85 }
        ],
        count: 2
      }

      mockVectorizeIndex.query.mockResolvedValue(mockMatches)

      const result = await search.query(vector, options)

      expect(result).toEqual(mockMatches)
      expect(mockVectorizeIndex.query).toHaveBeenCalledWith(vector, options)
    })

    it('should query without options', async () => {
      const vector = [0.1, 0.2, 0.3]
      const mockMatches: VectorizeMatches = {
        matches: [{ id: 'vec-1', score: 0.95 }],
        count: 1
      }

      mockVectorizeIndex.query.mockResolvedValue(mockMatches)

      const result = await search.query(vector)

      expect(result).toEqual(mockMatches)
      expect(mockVectorizeIndex.query).toHaveBeenCalledWith(vector, undefined)
    })
  })

  describe('findSimilar', () => {
    it('should find similar vectors', async () => {
      const vectorId = 'vec-123'
      const mockVector = {
        id: vectorId,
        values: [0.1, 0.2, 0.3],
        namespace: 'default'
      }
      const mockMatches: VectorizeMatches = {
        matches: [
          { id: 'vec-123', score: 1.0 },
          { id: 'vec-456', score: 0.9 },
          { id: 'vec-789', score: 0.8 }
        ],
        count: 3
      }

      mockVectorizeIndex.getByIds.mockResolvedValue([mockVector])
      mockVectorizeIndex.query.mockResolvedValue(mockMatches)

      const result = await search.findSimilar(vectorId, { topK: 5 })

      expect(result.matches).toHaveLength(3)
      expect(mockVectorizeIndex.getByIds).toHaveBeenCalledWith([vectorId])
      expect(mockVectorizeIndex.query).toHaveBeenCalledWith(
        mockVector.values,
        expect.objectContaining({
          topK: 5,
          namespace: 'default',
          returnMetadata: true
        })
      )
    })

    it('should exclude self when requested', async () => {
      const vectorId = 'vec-123'
      const mockVector = {
        id: vectorId,
        values: [0.1, 0.2, 0.3],
        namespace: 'default'
      }
      const mockMatches: VectorizeMatches = {
        matches: [
          { id: 'vec-123', score: 1.0 },
          { id: 'vec-456', score: 0.9 },
          { id: 'vec-789', score: 0.8 }
        ],
        count: 3
      }

      mockVectorizeIndex.getByIds.mockResolvedValue([mockVector])
      mockVectorizeIndex.query.mockResolvedValue({
        ...mockMatches,
        matches: [...mockMatches.matches]
      })

      const result = await search.findSimilar(vectorId, {
        topK: 2,
        excludeSelf: true
      })

      expect(result.matches).toHaveLength(2)
      expect(result.matches[0].id).toBe('vec-456')
      expect(result.matches[1].id).toBe('vec-789')
      expect(mockVectorizeIndex.query).toHaveBeenCalledWith(
        mockVector.values,
        expect.objectContaining({
          topK: 3, // Requested 2 + 1 for self exclusion
          namespace: 'default'
        })
      )
    })

    it('should throw error if vector not found', async () => {
      mockVectorizeIndex.getByIds.mockResolvedValue([])

      await expect(
        search.findSimilar('nonexistent')
      ).rejects.toThrow('Vector nonexistent not found')
    })

    it('should use vector namespace by default', async () => {
      const mockVector = {
        id: 'vec-123',
        values: [0.1, 0.2, 0.3],
        namespace: 'custom-namespace'
      }

      mockVectorizeIndex.getByIds.mockResolvedValue([mockVector])
      mockVectorizeIndex.query.mockResolvedValue({
        matches: [{ id: 'vec-123', score: 1.0 }],
        count: 1
      })

      await search.findSimilar('vec-123')

      expect(mockVectorizeIndex.query).toHaveBeenCalledWith(
        mockVector.values,
        expect.objectContaining({
          namespace: 'custom-namespace'
        })
      )
    })

    it('should override namespace if provided', async () => {
      const mockVector = {
        id: 'vec-123',
        values: [0.1, 0.2, 0.3],
        namespace: 'original'
      }

      mockVectorizeIndex.getByIds.mockResolvedValue([mockVector])
      mockVectorizeIndex.query.mockResolvedValue({
        matches: [],
        count: 0
      })

      await search.findSimilar('vec-123', {
        namespace: 'override'
      })

      expect(mockVectorizeIndex.query).toHaveBeenCalledWith(
        mockVector.values,
        expect.objectContaining({
          namespace: 'override'
        })
      )
    })
  })
})