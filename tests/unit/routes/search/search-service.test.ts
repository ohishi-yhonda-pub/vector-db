/**
 * 検索サービスのテスト
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SearchService } from '../../../../src/routes/api/search/search-service'
import { AppError, ErrorCodes } from '../../../../src/utils/error-handler'

describe('SearchService', () => {
  let searchService: SearchService
  let mockEnv: Env
  let mockVectorizeService: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock環境設定
    mockEnv = {
      DEFAULT_EMBEDDING_MODEL: 'text-embedding-ada-002',
      AI: {
        run: vi.fn().mockResolvedValue({
          data: [[0.1, 0.2, 0.3]]
        })
      }
    } as any

    // VectorizeServiceのモック
    vi.mock('../../../../src/services', () => ({
      VectorizeService: vi.fn().mockImplementation(() => ({
        query: vi.fn().mockResolvedValue({
          matches: [
            { id: 'vec_1', score: 0.95, metadata: { title: 'Test 1' } },
            { id: 'vec_2', score: 0.85, metadata: { title: 'Test 2' } }
          ]
        }),
        findSimilar: vi.fn().mockResolvedValue({
          matches: [
            { id: 'vec_3', score: 0.90, metadata: { title: 'Similar 1' } },
            { id: 'vec_4', score: 0.80, metadata: { title: 'Similar 2' } }
          ]
        })
      }))
    }))

    searchService = new SearchService(mockEnv)
  })

  describe('embedText', () => {
    it('should embed text successfully', async () => {
      const embedding = await searchService.embedText('test query')
      
      expect(embedding).toEqual([0.1, 0.2, 0.3])
      expect(mockEnv.AI.run).toHaveBeenCalledWith(
        'text-embedding-ada-002',
        { text: 'test query' }
      )
    })

    it('should throw error when AI returns no data', async () => {
      mockEnv.AI.run = vi.fn().mockResolvedValue({ data: [] })
      
      await expect(searchService.embedText('test'))
        .rejects.toThrow(AppError)
    })

    it('should throw error when AI fails', async () => {
      mockEnv.AI.run = vi.fn().mockRejectedValue(new Error('AI error'))
      
      await expect(searchService.embedText('test'))
        .rejects.toThrow(AppError)
    })
  })

  describe('searchByText', () => {
    it('should search by text successfully', async () => {
      const results = await searchService.searchByText('test query', {
        topK: 5,
        namespace: 'test',
        includeMetadata: true
      })
      
      expect(results).toHaveLength(2)
      expect(results[0]).toEqual({
        id: 'vec_1',
        score: 0.95,
        metadata: { title: 'Test 1' }
      })
      expect(mockEnv.AI.run).toHaveBeenCalled()
    })

    it('should exclude metadata when not requested', async () => {
      const results = await searchService.searchByText('test query', {
        includeMetadata: false
      })
      
      expect(results[0]).toEqual({
        id: 'vec_1',
        score: 0.95
      })
      expect(results[0].metadata).toBeUndefined()
    })

    it('should handle search with filter', async () => {
      const filter = { category: 'test' }
      await searchService.searchByText('test query', {
        filter,
        topK: 10
      })
      
      expect(mockEnv.AI.run).toHaveBeenCalled()
    })
  })

  describe('searchSimilar', () => {
    it('should find similar vectors successfully', async () => {
      const results = await searchService.searchSimilar('vec_123', {
        topK: 10,
        namespace: 'test',
        excludeSelf: true
      })
      
      expect(results).toHaveLength(2)
      expect(results[0]).toEqual({
        id: 'vec_3',
        score: 0.90,
        metadata: { title: 'Similar 1' }
      })
    })

    it('should throw 404 error when vector not found', async () => {
      // Update mock to simulate not found error
      const service = new SearchService(mockEnv)
      // Mock VectorizeService to throw not found error
      const originalQuery = service['vectorizeService'].findSimilar
      service['vectorizeService'].findSimilar = vi.fn()
        .mockRejectedValue(new Error('Vector not found'))
      
      await expect(service.searchSimilar('invalid_id'))
        .rejects.toThrow(AppError)
    })

    it('should handle excludeSelf option', async () => {
      await searchService.searchSimilar('vec_123', {
        excludeSelf: false
      })
      
      // Verify the option was passed correctly
      expect(searchService['vectorizeService'].findSimilar)
        .toHaveBeenCalledWith('vec_123', expect.objectContaining({
          excludeSelf: false
        }))
    })
  })

  describe('searchByVector', () => {
    it('should search by vector embedding successfully', async () => {
      const embedding = [0.1, 0.2, 0.3]
      const results = await searchService.searchByVector(embedding, {
        topK: 15,
        namespace: 'vectors'
      })
      
      expect(results.matches).toHaveLength(2)
      expect(results.matches[0].id).toBe('vec_1')
    })

    it('should handle search errors', async () => {
      const service = new SearchService(mockEnv)
      service['vectorizeService'].query = vi.fn()
        .mockRejectedValue(new Error('Search failed'))
      
      await expect(service.searchByVector([0.1, 0.2, 0.3]))
        .rejects.toThrow(AppError)
    })
  })

  describe('getSearchStats', () => {
    it('should return search statistics', async () => {
      const stats = await searchService.getSearchStats()
      
      expect(stats).toEqual({
        totalVectors: 0,
        namespaces: [],
        lastSearchTime: undefined
      })
    })
  })
})