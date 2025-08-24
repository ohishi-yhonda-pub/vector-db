import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VectorizeService } from '../../src/services/vectorize.service'

describe('VectorizeService', () => {
  let mockEnv: any
  let service: VectorizeService

  beforeEach(() => {
    mockEnv = {
      VECTORIZE_INDEX: {
        insert: vi.fn(),
        upsert: vi.fn(),
        query: vi.fn(),
        get: vi.fn(),
        getByIds: vi.fn(),
        deleteByIds: vi.fn()
      }
    }
    service = new VectorizeService(mockEnv)
  })

  it('should create VectorizeService instance', () => {
    expect(service).toBeDefined()
    expect(service).toBeInstanceOf(VectorizeService)
  })

  it('should have required methods', () => {
    expect(typeof service.insert).toBe('function')
    expect(typeof service.upsert).toBe('function')
    expect(typeof service.query).toBe('function')
    expect(typeof service.getByIds).toBe('function')
    expect(typeof service.deleteByIds).toBe('function')
    expect(typeof service.findSimilar).toBe('function')
    expect(typeof service.generateVectorId).toBe('function')
  })

  it('should insert vectors', async () => {
    const vectors = [{ id: 'vec1', values: [0.1, 0.2], metadata: {} }]
    await service.insert(vectors)
    expect(mockEnv.VECTORIZE_INDEX.insert).toHaveBeenCalledWith(vectors)
  })

  it('should upsert vectors', async () => {
    const vectors = [{ id: 'vec1', values: [0.1, 0.2], metadata: {} }]
    await service.upsert(vectors)
    expect(mockEnv.VECTORIZE_INDEX.upsert).toHaveBeenCalledWith(vectors)
  })

  it('should query vectors', async () => {
    const vector = [0.1, 0.2, 0.3]
    const options = { topK: 5, namespace: 'test' }
    const expectedResult = { matches: [], count: 0 }
    
    mockEnv.VECTORIZE_INDEX.query.mockResolvedValue(expectedResult)
    
    const result = await service.query(vector, options)
    
    expect(mockEnv.VECTORIZE_INDEX.query).toHaveBeenCalledWith(vector, options)
    expect(result).toBe(expectedResult)
  })

  it('should get vectors by IDs', async () => {
    const ids = ['vec1', 'vec2']
    const expectedVectors = [
      { id: 'vec1', values: [0.1, 0.2], metadata: {} },
      { id: 'vec2', values: [0.3, 0.4], metadata: {} }
    ]
    
    mockEnv.VECTORIZE_INDEX.getByIds.mockResolvedValue(expectedVectors)
    
    const result = await service.getByIds(ids)
    
    expect(mockEnv.VECTORIZE_INDEX.getByIds).toHaveBeenCalledWith(ids)
    expect(result).toBe(expectedVectors)
  })

  it('should delete vectors by IDs', async () => {
    const ids = ['vec1', 'vec2']
    const expectedResult = { count: 2 }
    
    mockEnv.VECTORIZE_INDEX.deleteByIds.mockResolvedValue(expectedResult)
    
    const result = await service.deleteByIds(ids)
    
    expect(mockEnv.VECTORIZE_INDEX.deleteByIds).toHaveBeenCalledWith(ids)
    expect(result).toBe(expectedResult)
  })

  it('should find similar vectors', async () => {
    const vectorId = 'vec1'
    const vector = { id: vectorId, values: [0.1, 0.2], namespace: 'default', metadata: {} }
    const queryResult = {
      matches: [
        { id: 'vec1', score: 1.0, values: [0.1, 0.2], metadata: {} },
        { id: 'vec2', score: 0.9, values: [0.1, 0.3], metadata: {} }
      ],
      count: 2
    }
    
    mockEnv.VECTORIZE_INDEX.getByIds.mockResolvedValue([vector])
    mockEnv.VECTORIZE_INDEX.query.mockResolvedValue(queryResult)
    
    const result = await service.findSimilar(vectorId)
    
    expect(mockEnv.VECTORIZE_INDEX.getByIds).toHaveBeenCalledWith([vectorId])
    expect(mockEnv.VECTORIZE_INDEX.query).toHaveBeenCalledWith(
      vector.values,
      { topK: 10, namespace: 'default', returnMetadata: true, filter: undefined }
    )
    expect(result).toBe(queryResult)
  })

  it('should exclude self when finding similar vectors', async () => {
    const vectorId = 'vec1'
    const vector = { id: vectorId, values: [0.1, 0.2], namespace: 'default', metadata: {} }
    const queryResult = {
      matches: [
        { id: 'vec1', score: 1.0, values: [0.1, 0.2], metadata: {} },
        { id: 'vec2', score: 0.9, values: [0.1, 0.3], metadata: {} },
        { id: 'vec3', score: 0.8, values: [0.1, 0.4], metadata: {} }
      ],
      count: 3
    }
    
    mockEnv.VECTORIZE_INDEX.getByIds.mockResolvedValue([vector])
    mockEnv.VECTORIZE_INDEX.query.mockResolvedValue(queryResult)
    
    const result = await service.findSimilar(vectorId, { excludeSelf: true, topK: 2 })
    
    expect(result.matches).toHaveLength(2)
    expect(result.matches[0].id).toBe('vec2')
    expect(result.matches[1].id).toBe('vec3')
  })

  it('should throw error when vector not found in findSimilar', async () => {
    mockEnv.VECTORIZE_INDEX.getByIds.mockResolvedValue([])
    
    await expect(service.findSimilar('non-existent')).rejects.toThrow('Vector non-existent not found')
  })

  it('should find similar vectors with returnMetadata false', async () => {
    const vectorId = 'vec1'
    const vector = { id: vectorId, values: [0.1, 0.2], namespace: 'test-ns', metadata: {} }
    const queryResult = {
      matches: [
        { id: 'vec2', score: 0.9, values: [0.1, 0.3], metadata: {} }
      ],
      count: 1
    }
    
    mockEnv.VECTORIZE_INDEX.getByIds.mockResolvedValue([vector])
    mockEnv.VECTORIZE_INDEX.query.mockResolvedValue(queryResult)
    
    const result = await service.findSimilar(vectorId, { 
      returnMetadata: false,
      topK: 5,
      namespace: 'override-ns',
      filter: { category: 'test' }
    })
    
    expect(mockEnv.VECTORIZE_INDEX.query).toHaveBeenCalledWith(
      vector.values,
      { 
        topK: 5, 
        namespace: 'override-ns',
        returnMetadata: false, 
        filter: { category: 'test' }
      }
    )
    expect(result).toBe(queryResult)
  })

  it('should find similar vectors with excludeSelf and default topK', async () => {
    const vectorId = 'vec1'
    const vector = { id: vectorId, values: [0.1, 0.2], namespace: 'default', metadata: {} }
    const queryResult = {
      matches: [
        { id: 'vec1', score: 1.0, values: [0.1, 0.2], metadata: {} },
        { id: 'vec2', score: 0.9, values: [0.1, 0.3], metadata: {} }
      ],
      count: 2
    }
    
    mockEnv.VECTORIZE_INDEX.getByIds.mockResolvedValue([vector])
    mockEnv.VECTORIZE_INDEX.query.mockResolvedValue(queryResult)
    
    const result = await service.findSimilar(vectorId, { excludeSelf: true })
    
    expect(mockEnv.VECTORIZE_INDEX.query).toHaveBeenCalledWith(
      vector.values,
      { topK: 11, namespace: 'default', returnMetadata: true, filter: undefined }
    )
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].id).toBe('vec2')
  })

  it('should find similar vectors without excludeSelf and custom topK', async () => {
    const vectorId = 'vec1'
    const vector = { id: vectorId, values: [0.1, 0.2], namespace: 'default', metadata: {} }
    const queryResult = {
      matches: [
        { id: 'vec1', score: 1.0, values: [0.1, 0.2], metadata: {} },
        { id: 'vec2', score: 0.9, values: [0.1, 0.3], metadata: {} }
      ],
      count: 2
    }
    
    mockEnv.VECTORIZE_INDEX.getByIds.mockResolvedValue([vector])
    mockEnv.VECTORIZE_INDEX.query.mockResolvedValue(queryResult)
    
    const result = await service.findSimilar(vectorId, { topK: 15 })
    
    expect(mockEnv.VECTORIZE_INDEX.query).toHaveBeenCalledWith(
      vector.values,
      { topK: 15, namespace: 'default', returnMetadata: true, filter: undefined }
    )
    expect(result).toBe(queryResult)
  })

  it('should handle vector with undefined namespace', async () => {
    const vectorId = 'vec1'
    const vector = { id: vectorId, values: [0.1, 0.2], metadata: {} } // no namespace
    const queryResult = {
      matches: [
        { id: 'vec2', score: 0.9, values: [0.1, 0.3], metadata: {} }
      ],
      count: 1
    }
    
    mockEnv.VECTORIZE_INDEX.getByIds.mockResolvedValue([vector])
    mockEnv.VECTORIZE_INDEX.query.mockResolvedValue(queryResult)
    
    const result = await service.findSimilar(vectorId)
    
    expect(mockEnv.VECTORIZE_INDEX.query).toHaveBeenCalledWith(
      vector.values,
      { topK: 10, namespace: undefined, returnMetadata: true, filter: undefined }
    )
    expect(result).toBe(queryResult)
  })

  it('should generate unique vector IDs', () => {
    const id1 = service.generateVectorId()
    const id2 = service.generateVectorId()
    const id3 = service.generateVectorId('custom')
    
    expect(id1).toMatch(/^vec_\d+_[a-z0-9]+$/)
    expect(id2).toMatch(/^vec_\d+_[a-z0-9]+$/)
    expect(id3).toMatch(/^custom_\d+_[a-z0-9]+$/)
    expect(id1).not.toBe(id2)
  })
})