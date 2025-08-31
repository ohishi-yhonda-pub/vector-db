import { describe, it, expect, beforeEach, vi } from 'vitest'
import { VectorOperations } from '../../../src/services/vector-operations'

describe('VectorOperations', () => {
  let operations: VectorOperations
  let mockEnv: Env
  let mockVectorizeIndex: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockVectorizeIndex = {
      insert: vi.fn(),
      upsert: vi.fn(),
      deleteByIds: vi.fn(),
      getByIds: vi.fn()
    }

    mockEnv = {
      VECTORIZE_INDEX: mockVectorizeIndex
    } as any

    operations = new VectorOperations(mockEnv)
  })

  describe('insert', () => {
    it('should insert vectors', async () => {
      const vectors = [
        { id: 'vec-1', values: [0.1, 0.2, 0.3] },
        { id: 'vec-2', values: [0.4, 0.5, 0.6] }
      ] as VectorizeVector[]

      await operations.insert(vectors)

      expect(mockVectorizeIndex.insert).toHaveBeenCalledWith(vectors)
    })
  })

  describe('upsert', () => {
    it('should upsert vectors', async () => {
      const vectors = [
        { id: 'vec-1', values: [0.1, 0.2, 0.3], metadata: { type: 'test' } }
      ] as VectorizeVector[]

      await operations.upsert(vectors)

      expect(mockVectorizeIndex.upsert).toHaveBeenCalledWith(vectors)
    })
  })

  describe('deleteByIds', () => {
    it('should delete vectors by IDs', async () => {
      const ids = ['vec-1', 'vec-2', 'vec-3']
      mockVectorizeIndex.deleteByIds.mockResolvedValue({ count: 3 })

      const result = await operations.deleteByIds(ids)

      expect(result).toEqual({ count: 3 })
      expect(mockVectorizeIndex.deleteByIds).toHaveBeenCalledWith(ids)
    })
  })

  describe('getByIds', () => {
    it('should get vectors by IDs', async () => {
      const ids = ['vec-1', 'vec-2']
      const mockVectors = [
        { id: 'vec-1', values: [0.1, 0.2] },
        { id: 'vec-2', values: [0.3, 0.4] }
      ]
      mockVectorizeIndex.getByIds.mockResolvedValue(mockVectors)

      const result = await operations.getByIds(ids)

      expect(result).toEqual(mockVectors)
      expect(mockVectorizeIndex.getByIds).toHaveBeenCalledWith(ids)
    })
  })

  describe('generateVectorId', () => {
    it('should generate unique vector IDs', () => {
      const id1 = operations.generateVectorId()
      const id2 = operations.generateVectorId()

      expect(id1).toMatch(/^vec_\d+_[a-z0-9]+$/)
      expect(id2).toMatch(/^vec_\d+_[a-z0-9]+$/)
      expect(id1).not.toBe(id2)
    })

    it('should use custom prefix', () => {
      const id = operations.generateVectorId('custom')

      expect(id).toMatch(/^custom_\d+_[a-z0-9]+$/)
    })
  })
})