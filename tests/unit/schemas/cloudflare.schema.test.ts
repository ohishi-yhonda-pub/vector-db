import { describe, it, expect } from 'vitest'
import {
  VectorizeVectorSchema,
  VectorizeMatchSchema,
  VectorizeMatchesSchema,
  VectorizeQueryOptionsSchema,
  AIEmbeddingRequestSchema,
  AIEmbeddingResponseSchema,
  AIBatchEmbeddingRequestSchema,
  AIBatchEmbeddingResponseSchema,
  AIModelSchema,
  type VectorizeVector,
  type VectorizeMatch,
  type VectorizeMatches,
  type VectorizeQueryOptions,
  type AIEmbeddingRequest,
  type AIEmbeddingResponse,
  type AIBatchEmbeddingRequest,
  type AIBatchEmbeddingResponse,
  type AIModel
} from '../../../src/schemas/cloudflare.schema'

describe('Cloudflare Schemas', () => {
  describe('VectorizeVectorSchema', () => {
    it('should validate a complete vector object', () => {
      const validVector = {
        id: 'vector-1',
        values: [0.1, 0.2, 0.3],
        namespace: 'test-namespace',
        metadata: { key1: 'value1', key2: 42 }
      }

      const result = VectorizeVectorSchema.parse(validVector)
      expect(result).toEqual(validVector)
    })

    it('should validate a minimal vector object', () => {
      const minimalVector = {
        id: 'vector-1',
        values: [0.1, 0.2, 0.3]
      }

      const result = VectorizeVectorSchema.parse(minimalVector)
      expect(result).toEqual(minimalVector)
    })

    it('should reject invalid vector object', () => {
      const invalidVector = {
        id: 'vector-1'
        // missing required values
      }

      expect(() => VectorizeVectorSchema.parse(invalidVector)).toThrow()
    })
  })

  describe('VectorizeMatchSchema', () => {
    it('should validate a match object with metadata', () => {
      const validMatch = {
        id: 'match-1',
        score: 0.95,
        metadata: { category: 'document' }
      }

      const result = VectorizeMatchSchema.parse(validMatch)
      expect(result).toEqual(validMatch)
    })

    it('should validate a match object without metadata', () => {
      const minimalMatch = {
        id: 'match-1',
        score: 0.95
      }

      const result = VectorizeMatchSchema.parse(minimalMatch)
      expect(result).toEqual(minimalMatch)
    })
  })

  describe('VectorizeMatchesSchema', () => {
    it('should validate matches array', () => {
      const validMatches = {
        matches: [
          { id: 'match-1', score: 0.95 },
          { id: 'match-2', score: 0.87, metadata: { type: 'text' } }
        ]
      }

      const result = VectorizeMatchesSchema.parse(validMatches)
      expect(result).toEqual(validMatches)
    })
  })

  describe('VectorizeQueryOptionsSchema', () => {
    it('should validate complete query options', () => {
      const validOptions = {
        topK: 10,
        namespace: 'test-namespace',
        filter: { category: 'document' },
        returnMetadata: true
      }

      const result = VectorizeQueryOptionsSchema.parse(validOptions)
      expect(result).toEqual(validOptions)
    })

    it('should validate empty query options', () => {
      const emptyOptions = {}

      const result = VectorizeQueryOptionsSchema.parse(emptyOptions)
      expect(result).toEqual(emptyOptions)
    })
  })

  describe('AIEmbeddingRequestSchema', () => {
    it('should validate request with model', () => {
      const validRequest = {
        text: 'Hello world',
        model: 'text-embedding-ada-002'
      }

      const result = AIEmbeddingRequestSchema.parse(validRequest)
      expect(result).toEqual(validRequest)
    })

    it('should validate request without model', () => {
      const minimalRequest = {
        text: 'Hello world'
      }

      const result = AIEmbeddingRequestSchema.parse(minimalRequest)
      expect(result).toEqual(minimalRequest)
    })
  })

  describe('AIEmbeddingResponseSchema', () => {
    it('should validate embedding response', () => {
      const validResponse = {
        embedding: [0.1, 0.2, 0.3],
        model: 'text-embedding-ada-002',
        dimensions: 3
      }

      const result = AIEmbeddingResponseSchema.parse(validResponse)
      expect(result).toEqual(validResponse)
    })
  })

  describe('AIBatchEmbeddingRequestSchema', () => {
    it('should validate batch request', () => {
      const validRequest = {
        texts: ['Hello', 'World'],
        model: 'text-embedding-ada-002'
      }

      const result = AIBatchEmbeddingRequestSchema.parse(validRequest)
      expect(result).toEqual(validRequest)
    })
  })

  describe('AIBatchEmbeddingResponseSchema', () => {
    it('should validate batch response with mixed results', () => {
      const validResponse = {
        embeddings: [
          { text: 'Hello', embedding: [0.1, 0.2], error: null },
          { text: 'World', embedding: null, error: 'Processing failed' }
        ],
        failed: [
          { text: 'Failed text', embedding: null, error: 'Failed processing' }
        ],
        model: 'text-embedding-ada-002',
        totalCount: 3,
        successCount: 1,
        failedCount: 2
      }

      const result = AIBatchEmbeddingResponseSchema.parse(validResponse)
      expect(result).toEqual(validResponse)
    })
  })

  describe('AIModelSchema', () => {
    it('should validate model information', () => {
      const validModel = {
        name: 'text-embedding-ada-002',
        description: 'OpenAI text embedding model',
        dimensions: 1536,
        maxTokens: 8192,
        recommended: true
      }

      const result = AIModelSchema.parse(validModel)
      expect(result).toEqual(validModel)
    })
  })

  describe('Type exports', () => {
    it('should export all types correctly', () => {
      // Test that types are properly exported and can be used
      const vector: VectorizeVector = {
        id: 'test',
        values: [1, 2, 3]
      }

      const match: VectorizeMatch = {
        id: 'test',
        score: 0.95
      }

      const matches: VectorizeMatches = {
        matches: [match]
      }

      const options: VectorizeQueryOptions = {
        topK: 10
      }

      const embeddingReq: AIEmbeddingRequest = {
        text: 'test'
      }

      const embeddingRes: AIEmbeddingResponse = {
        embedding: [1, 2, 3],
        model: 'test',
        dimensions: 3
      }

      const batchReq: AIBatchEmbeddingRequest = {
        texts: ['test']
      }

      const batchRes: AIBatchEmbeddingResponse = {
        embeddings: [],
        failed: [],
        model: 'test',
        totalCount: 0,
        successCount: 0,
        failedCount: 0
      }

      const model: AIModel = {
        name: 'test',
        description: 'test',
        dimensions: 3,
        maxTokens: 1000,
        recommended: false
      }

      expect(vector.id).toBe('test')
      expect(match.score).toBe(0.95)
      expect(matches.matches).toHaveLength(1)
      expect(options.topK).toBe(10)
      expect(embeddingReq.text).toBe('test')
      expect(embeddingRes.dimensions).toBe(3)
      expect(batchReq.texts).toHaveLength(1)
      expect(batchRes.totalCount).toBe(0)
      expect(model.recommended).toBe(false)
    })
  })
})