/**
 * Tests for vector utilities
 */

import { describe, it, expect, vi } from 'vitest'
import {
  generateVectorId,
  generateEmbeddingFromText,
  storeInVectorize,
  storeVectorMetadata,
  createVectorFromTextComplete
} from '../src/lib/vector-utils'

describe('Vector Utilities', () => {
  describe('generateVectorId', () => {
    it('should generate unique vector IDs', () => {
      const id1 = generateVectorId()
      const id2 = generateVectorId()
      
      expect(id1).toMatch(/^vec_\d+_[a-z0-9]+$/)
      expect(id2).toMatch(/^vec_\d+_[a-z0-9]+$/)
      expect(id1).not.toBe(id2)
    })
  })

  describe('generateEmbeddingFromText', () => {
    it('should generate embedding from text', async () => {
      const mockAI = {
        run: vi.fn().mockResolvedValue({
          data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
        })
      }
      
      const embedding = await generateEmbeddingFromText(mockAI, 'test text')
      
      expect(mockAI.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', { text: ['test text'] })
      expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5])
    })

    it('should throw error when embedding generation fails', async () => {
      const mockAI = {
        run: vi.fn().mockResolvedValue({ data: null })
      }
      
      await expect(generateEmbeddingFromText(mockAI, 'test')).rejects.toThrow('Failed to generate embedding')
    })

    it('should use custom model if provided', async () => {
      const mockAI = {
        run: vi.fn().mockResolvedValue({
          data: [[0.1, 0.2]]
        })
      }
      
      await generateEmbeddingFromText(mockAI, 'test', 'custom-model')
      
      expect(mockAI.run).toHaveBeenCalledWith('custom-model', { text: ['test'] })
    })
  })

  describe('storeInVectorize', () => {
    it('should store vector in Vectorize index', async () => {
      const mockVectorizeIndex = {
        insert: vi.fn().mockResolvedValue(undefined)
      }
      
      await storeInVectorize(mockVectorizeIndex, 'vec-1', [0.1, 0.2], { tag: 'test' })
      
      expect(mockVectorizeIndex.insert).toHaveBeenCalledWith([{
        id: 'vec-1',
        values: [0.1, 0.2],
        metadata: { tag: 'test' }
      }])
    })

    it('should handle empty metadata', async () => {
      const mockVectorizeIndex = {
        insert: vi.fn().mockResolvedValue(undefined)
      }
      
      await storeInVectorize(mockVectorizeIndex, 'vec-2', [0.3, 0.4])
      
      expect(mockVectorizeIndex.insert).toHaveBeenCalledWith([{
        id: 'vec-2',
        values: [0.3, 0.4],
        metadata: {}
      }])
    })
  })

  describe('createVectorFromTextComplete', () => {
    it('should execute complete flow with custom ID', async () => {
      const mockEnv = {
        AI: {
          run: vi.fn().mockResolvedValue({
            data: [[0.5, 0.6, 0.7]]
          })
        },
        VECTORIZE_INDEX: {
          insert: vi.fn().mockResolvedValue(undefined)
        },
        DB: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnValue({
              run: vi.fn().mockResolvedValue({ success: true })
            })
          })
        }
      } as any
      
      const result = await createVectorFromTextComplete(
        mockEnv,
        'Hello world',
        'custom-id',
        { source: 'test' }
      )
      
      expect(result.id).toBe('custom-id')
      expect(result.embedding).toEqual([0.5, 0.6, 0.7])
      expect(mockEnv.AI.run).toHaveBeenCalled()
      expect(mockEnv.VECTORIZE_INDEX.insert).toHaveBeenCalled()
    })

    it('should generate ID when not provided', async () => {
      const mockEnv = {
        AI: {
          run: vi.fn().mockResolvedValue({
            data: [[0.8, 0.9]]
          })
        },
        VECTORIZE_INDEX: {
          insert: vi.fn().mockResolvedValue(undefined)
        },
        DB: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnValue({
              run: vi.fn().mockResolvedValue({ success: true })
            })
          })
        }
      } as any
      
      const result = await createVectorFromTextComplete(mockEnv, 'Test text')
      
      expect(result.id).toMatch(/^vec_\d+_[a-z0-9]+$/)
      expect(result.embedding).toEqual([0.8, 0.9])
    })
  })
})