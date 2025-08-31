/**
 * 検索バリデーターのテスト
 */

import { describe, it, expect } from 'vitest'
import {
  BaseSearchParamsSchema,
  TextSearchParamsSchema,
  SimilarSearchParamsSchema,
  SemanticSearchQuerySchema,
  validateSearchResults,
  normalizeSearchParams
} from '../../../../src/routes/api/search/search-validator'

describe('Search Validators', () => {
  describe('BaseSearchParamsSchema', () => {
    it('should validate valid base search params', () => {
      const result = BaseSearchParamsSchema.safeParse({
        topK: 10,
        namespace: 'test'
      })
      expect(result.success).toBe(true)
    })

    it('should use default topK when not provided', () => {
      // 空オブジェクトを試す
      const result = BaseSearchParamsSchema.safeParse({})
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.topK).toBe(10)
      }
    })

    it('should reject invalid topK values', () => {
      const result = BaseSearchParamsSchema.safeParse({
        topK: 150
      })
      expect(result.success).toBe(false)
    })
  })

  describe('TextSearchParamsSchema', () => {
    it('should validate valid text search params', () => {
      const result = TextSearchParamsSchema.safeParse({
        query: 'test query',
        topK: 5,
        includeMetadata: true,
        filter: { category: 'test' }
      })
      expect(result.success).toBe(true)
    })

    it('should reject empty query', () => {
      const result = TextSearchParamsSchema.safeParse({
        query: ''
      })
      expect(result.success).toBe(false)
    })

    it('should use defaults for optional fields', () => {
      const result = TextSearchParamsSchema.safeParse({
        query: 'test'
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.includeMetadata).toBe(true)
        expect(result.data.includeValues).toBe(false)
      }
    })
  })

  describe('SimilarSearchParamsSchema', () => {
    it('should validate valid similar search params', () => {
      const result = SimilarSearchParamsSchema.safeParse({
        vectorId: 'vec_123',
        topK: 20,
        excludeSelf: false
      })
      expect(result.success).toBe(true)
    })

    it('should use default excludeSelf when not provided', () => {
      const result = SimilarSearchParamsSchema.safeParse({
        vectorId: 'vec_123'
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.excludeSelf).toBe(true)
      }
    })

    it('should reject empty vectorId', () => {
      const result = SimilarSearchParamsSchema.safeParse({
        vectorId: ''
      })
      expect(result.success).toBe(false)
    })
  })

  describe('SemanticSearchQuerySchema', () => {
    it('should validate valid semantic search query', () => {
      const result = SemanticSearchQuerySchema.safeParse({
        query: 'semantic search',
        topK: '15',
        namespace: 'semantic'
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.topK).toBe(15)
      }
    })

    it('should transform string topK to number', () => {
      const result = SemanticSearchQuerySchema.safeParse({
        query: 'test',
        topK: '25'
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.topK).toBe(25)
      }
    })

    it('should use default topK when not provided', () => {
      const result = SemanticSearchQuerySchema.safeParse({
        query: 'test'
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.topK).toBe(10)
      }
    })
  })

  describe('validateSearchResults', () => {
    it('should validate valid search results', () => {
      const results = {
        matches: [
          { id: 'vec_1', score: 0.95 },
          { id: 'vec_2', score: 0.85 }
        ]
      }
      expect(validateSearchResults(results)).toBe(true)
    })

    it('should reject invalid results structure', () => {
      expect(validateSearchResults(null)).toBe(false)
      expect(validateSearchResults(undefined)).toBe(false)
      expect(validateSearchResults('invalid')).toBe(false)
    })

    it('should reject results without matches array', () => {
      const results = { data: [] }
      expect(validateSearchResults(results)).toBe(false)
    })

    it('should reject matches with invalid scores', () => {
      const results = {
        matches: [
          { id: 'vec_1', score: 1.5 }, // Invalid score > 1
          { id: 'vec_2', score: -0.1 }  // Invalid score < 0
        ]
      }
      expect(validateSearchResults(results)).toBe(false)
    })

    it('should reject matches without required fields', () => {
      const results = {
        matches: [
          { id: 'vec_1' }, // Missing score
          { score: 0.85 }  // Missing id
        ]
      }
      expect(validateSearchResults(results)).toBe(false)
    })
  })

  describe('normalizeSearchParams', () => {
    it('should normalize topK to valid range', () => {
      const params = { topK: 200 }
      const normalized = normalizeSearchParams(params)
      expect(normalized.topK).toBe(100)
    })

    it('should remove empty namespace', () => {
      const params = { namespace: '' }
      const normalized = normalizeSearchParams(params)
      expect(normalized.namespace).toBeUndefined()
    })

    it('should remove empty filter object', () => {
      const params = { filter: {} }
      const normalized = normalizeSearchParams(params)
      expect(normalized.filter).toBeUndefined()
    })

    it('should preserve valid filter', () => {
      const params = { filter: { category: 'test' } }
      const normalized = normalizeSearchParams(params)
      expect(normalized.filter).toEqual({ category: 'test' })
    })

    it('should handle minimum topK', () => {
      const params = { topK: -5 }
      const normalized = normalizeSearchParams(params)
      expect(normalized.topK).toBe(1)
    })
  })
})