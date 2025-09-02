/**
 * Edge cases and branch coverage tests
 * Ensures 100% branch coverage for error handling and edge conditions
 */

import { describe, it, expect, vi } from 'vitest'
import app from '../src/index'
import { createMockEnv, createProdEnv, postJson, get, del } from './hono-test-helper'

describe('Edge Cases and Branch Coverage', () => {
  const env = createMockEnv()
  
  describe('Error Object vs String Errors', () => {
    it('handles Error objects in getVector', async () => {
      const errorEnv = {
        ...env,
        VECTORIZE_INDEX: {
          getByIds: vi.fn().mockRejectedValue(new Error('Get failed'))
        }
      } as any
      
      const res = await get(app, '/api/vectors/test', errorEnv)
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('Get failed')
    })
    
    it('handles string errors in getVector', async () => {
      const errorEnv = {
        ...env,
        VECTORIZE_INDEX: {
          getByIds: vi.fn().mockRejectedValue('string error')
        }
      } as any
      
      const res = await get(app, '/api/vectors/test', errorEnv)
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('string error')
    })
    
    it('handles Error objects in deleteVector', async () => {
      const errorEnv = {
        ...env,
        VECTORIZE_INDEX: {
          deleteByIds: vi.fn().mockRejectedValue(new Error('Delete failed'))
        }
      } as any
      
      const res = await del(app, '/api/vectors/test', errorEnv)
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('Delete failed')
    })
    
    it('handles string errors in deleteVector', async () => {
      const errorEnv = {
        ...env,
        VECTORIZE_INDEX: {
          deleteByIds: vi.fn().mockRejectedValue('string error')
        }
      } as any
      
      const res = await del(app, '/api/vectors/test', errorEnv)
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('string error')
    })
    
    it('handles Error objects in batchCreateVectors', async () => {
      const errorEnv = {
        ...env,
        VECTORIZE_INDEX: {
          insert: vi.fn().mockRejectedValue(new Error('Batch insert failed'))
        }
      } as any
      
      const res = await postJson(app, '/api/vectors/batch', [{ values: [0.1] }], errorEnv)
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('Batch insert failed')
    })
    
    it('handles string errors in batchCreateVectors', async () => {
      const errorEnv = {
        ...env,
        VECTORIZE_INDEX: {
          insert: vi.fn().mockRejectedValue('string error')
        }
      } as any
      
      const res = await postJson(app, '/api/vectors/batch', [{ values: [0.1] }], errorEnv)
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('string error')
    })
    
    it('handles Error objects in createVector', async () => {
      const errorEnv = {
        ...env,
        VECTORIZE_INDEX: {
          ...env.VECTORIZE_INDEX,
          insert: vi.fn().mockRejectedValue(new Error('Insert failed'))
        }
      } as any
      
      const res = await postJson(app, '/api/vectors', { values: [0.1] }, errorEnv)
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('Insert failed')
    })
    
    it('handles string errors in createVector', async () => {
      const errorEnv = {
        ...env,
        VECTORIZE_INDEX: {
          ...env.VECTORIZE_INDEX,
          insert: vi.fn().mockRejectedValue('string error')
        }
      } as any
      
      const res = await postJson(app, '/api/vectors', { values: [0.1] }, errorEnv)
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('string error')
    })
    
    it('handles Error objects in searchVectors', async () => {
      const errorEnv = {
        ...env,
        VECTORIZE_INDEX: {
          query: vi.fn().mockRejectedValue(new Error('Query failed'))
        }
      } as any
      
      const res = await postJson(app, '/api/search', { vector: [0.1] }, errorEnv)
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('Query failed')
    })
    
    it('handles string errors in searchVectors', async () => {
      const errorEnv = {
        ...env,
        VECTORIZE_INDEX: {
          query: vi.fn().mockRejectedValue('string error')
        }
      } as any
      
      const res = await postJson(app, '/api/search', { vector: [0.1] }, errorEnv)
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('string error')
    })
    
    it('handles Error objects in batch embeddings', async () => {
      const errorEnv = {
        ...env,
        AI: { run: vi.fn().mockRejectedValue(new Error('AI failed')) }
      } as any
      
      const res = await postJson(app, '/api/embeddings/batch', { texts: ['test'] }, errorEnv)
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('AI failed')
    })
    
    it('handles string errors in batch embeddings', async () => {
      const errorEnv = {
        ...env,
        AI: { run: vi.fn().mockRejectedValue('string error') }
      } as any
      
      const res = await postJson(app, '/api/embeddings/batch', { texts: ['test'] }, errorEnv)
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('string error')
    })
    
    it('handles Error objects in single embedding', async () => {
      const errorEnv = {
        ...env,
        AI: { run: vi.fn().mockRejectedValue(new Error('AI failed')) }
      } as any
      
      const res = await postJson(app, '/api/embeddings', { text: 'test' }, errorEnv)
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('AI failed')
    })
    
    it('handles string errors in single embedding', async () => {
      const errorEnv = {
        ...env,
        AI: { run: vi.fn().mockRejectedValue('string error') }
      } as any
      
      const res = await postJson(app, '/api/embeddings', { text: 'test' }, errorEnv)
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('string error')
    })
    
    it('handles AI returning no data in single embedding', async () => {
      const noDataEnv = {
        ...env,
        AI: { run: vi.fn().mockResolvedValue({ data: null }) }
      } as any
      
      const res = await postJson(app, '/api/embeddings', { text: 'test' }, noDataEnv)
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('Failed to generate embedding')
    })
  })
  
  describe('Search topK variations', () => {
    it('uses default topK when not provided', async () => {
      const res = await postJson(app, '/api/search', { vector: [0.1, 0.2] }, env)
      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.success).toBe(true)
    })
    
    it('respects custom topK value', async () => {
      const res = await postJson(app, '/api/search', { vector: [0.1], topK: 5 }, env)
      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.success).toBe(true)
    })
  })
  
  describe('Batch operation edge cases', () => {
    it('handles empty batch embeddings data', async () => {
      const emptyDataEnv = {
        ...env,
        AI: { run: vi.fn().mockResolvedValue({ data: [] }) }
      } as any
      
      const res = await postJson(app, '/api/embeddings/batch', { texts: ['test'] }, emptyDataEnv)
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('Failed to generate embeddings')
    })
    
    it('handles partial batch embedding success', async () => {
      let callCount = 0
      const partialEnv = {
        ...env,
        AI: {
          run: vi.fn().mockImplementation(() => {
            callCount++
            return callCount === 1 
              ? Promise.resolve({ data: [[0.1, 0.2]] })
              : Promise.resolve({ data: null })
          })
        }
      } as any
      
      const res = await postJson(app, '/api/embeddings/batch', { texts: ['test1', 'test2'] }, partialEnv)
      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.data.count).toBe(1)
    })
  })
})