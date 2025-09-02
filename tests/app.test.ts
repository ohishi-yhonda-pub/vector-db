/**
 * Simplified app tests using app.request()
 */

import { describe, it, expect, vi } from 'vitest'
import app from '../src/index'
import { createMockEnv, createProdEnv, postJson, get, del, expectJson } from './hono-test-helper'

describe('Vector DB API', () => {
  const env = createMockEnv()
  
  describe('Basic endpoints', () => {
    it('GET / returns health check', async () => {
      const res = await app.request('/', {}, env)
      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.status).toBe('ok')
      expect(data.service).toBe('Vector DB')
    })
    
    it('404 for unknown routes', async () => {
      const res = await app.request('/unknown', {}, env)
      expect(res.status).toBe(404)
    })
  })
  
  describe('Embeddings', () => {
    it('generates single embedding', async () => {
      const res = await postJson(app, '/api/embeddings', { text: 'hello' }, env)
      expect(res.status).toBe(200)
      const json = await expectJson(res)
      json.toHaveProperty('success', true)
      json.toHaveProperty('data.embedding')
    })
    
    it('generates batch embeddings', async () => {
      const res = await postJson(app, '/api/embeddings/batch', { texts: ['hello', 'world'] }, env)
      expect(res.status).toBe(200)
      const json = await expectJson(res)
      json.toHaveProperty('data.count', 2)
    })
    
    it('handles embedding errors', async () => {
      const badEnv = {
        ...env,
        AI: { run: vi.fn().mockRejectedValue(new Error('AI failed')) }
      } as any
      
      const res = await postJson(app, '/api/embeddings', { text: 'test' }, badEnv)
      expect(res.status).toBe(500)
    })
    
    it('handles invalid embedding request', async () => {
      const res = await postJson(app, '/api/embeddings', { text: 123 }, env) // wrong type
      expect(res.status).toBe(400) // Zod errors return 400
    })
    
    it('handles invalid batch request', async () => {
      const res = await postJson(app, '/api/embeddings/batch', { texts: 'not-array' }, env)
      expect(res.status).toBe(400) // Zod errors return 400
    })
    
    it('handles AI returning no data', async () => {
      const badEnv = {
        ...env,
        AI: { run: vi.fn().mockResolvedValue({ data: null }) }
      } as any
      
      const res = await postJson(app, '/api/embeddings', { text: 'test' }, badEnv)
      expect(res.status).toBe(500)
    })
    
    it('handles batch embedding with no data', async () => {
      const badEnv = {
        ...env,
        AI: { run: vi.fn().mockResolvedValue({ data: [] }) }
      } as any
      
      const res = await postJson(app, '/api/embeddings/batch', { texts: ['test'] }, badEnv)
      expect(res.status).toBe(500)
    })
    
    it('handles non-Error in batch embedding', async () => {
      const badEnv = {
        ...env,
        AI: { run: vi.fn().mockRejectedValue('string error') }
      } as any
      
      const res = await postJson(app, '/api/embeddings/batch', { texts: ['test'] }, badEnv)
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('string error')
    })
  })
  
  describe('Vectors', () => {
    it('creates vector', async () => {
      const res = await postJson(app, '/api/vectors', { values: [0.1, 0.2] }, env)
      expect(res.status).toBe(200)
      const json = await expectJson(res)
      json.toHaveProperty('data.id')
    })
    
    it('creates vector with custom ID', async () => {
      const res = await postJson(app, '/api/vectors', {
        id: 'custom-id',
        values: [0.1, 0.2],
        metadata: { foo: 'bar' }
      }, env)
      expect(res.status).toBe(200)
    })
    
    it('gets vector by ID', async () => {
      const res = await get(app, '/api/vectors/test-id', env)
      expect(res.status).toBe(200)
    })
    
    it('handles vector not found', async () => {
      const notFoundEnv = {
        ...env,
        VECTORIZE_INDEX: {
          ...env.VECTORIZE_INDEX,
          getByIds: vi.fn().mockResolvedValue([])
        }
      } as any
      
      const res = await get(app, '/api/vectors/missing', notFoundEnv)
      expect(res.status).toBe(404)
    })
    
    it('deletes vector', async () => {
      const res = await del(app, '/api/vectors/test-id', env)
      expect(res.status).toBe(200)
    })
    
    it('handles delete not found', async () => {
      const notFoundEnv = {
        ...env,
        VECTORIZE_INDEX: {
          ...env.VECTORIZE_INDEX,
          deleteByIds: vi.fn().mockResolvedValue({ count: 0 })
        }
      } as any
      
      const res = await del(app, '/api/vectors/missing', notFoundEnv)
      expect(res.status).toBe(404)
    })
    
    it('batch creates vectors', async () => {
      const res = await postJson(app, '/api/vectors/batch', [
        { values: [0.1] },
        { id: 'v2', values: [0.2] },
        { values: [0.3], metadata: { test: true } }
      ], env)
      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.data.count).toBe(3)
      expect(data.data.ids).toHaveLength(3)
    })
    
    it('rejects empty batch', async () => {
      const res = await postJson(app, '/api/vectors/batch', [], env)
      expect(res.status).toBe(400)
    })
    
    it('rejects non-array batch', async () => {
      const res = await postJson(app, '/api/vectors/batch', { not: 'array' }, env)
      expect(res.status).toBe(400)
    })
    
    it('handles invalid vector creation', async () => {
      const res = await postJson(app, '/api/vectors', { values: 'not-array' }, env)
      expect(res.status).toBe(400) // Zod errors return 400
    })
    
    it('handles vector creation error', async () => {
      const errorEnv = {
        ...env,
        VECTORIZE_INDEX: {
          ...env.VECTORIZE_INDEX,
          insert: vi.fn().mockRejectedValue(new Error('Insert failed'))
        }
      } as any
      
      const res = await postJson(app, '/api/vectors', { values: [0.1] }, errorEnv)
      expect(res.status).toBe(500)
    })
    
    it('handles non-Error exceptions', async () => {
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
    
    it('handles get vector error', async () => {
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
    
    it('handles delete vector error', async () => {
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
    
    it('handles batch create error', async () => {
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
  })
  
  describe('Search', () => {
    it('searches with vector', async () => {
      const res = await postJson(app, '/api/search', { vector: [0.1, 0.2], topK: 5 }, env)
      expect(res.status).toBe(200)
      const json = await expectJson(res)
      json.toHaveProperty('data.matches')
    })
    
    it('searches with text', async () => {
      const res = await postJson(app, '/api/search', { text: 'hello', topK: 10 }, env)
      expect(res.status).toBe(200)
    })
    
    it('searches with filter', async () => {
      const res = await postJson(app, '/api/search', {
        vector: [0.1],
        filter: { category: 'test' }
      }, env)
      expect(res.status).toBe(200)
    })
    
    it('requires vector or text', async () => {
      const res = await postJson(app, '/api/search', { topK: 5 }, env)
      expect(res.status).toBe(400)
    })
    
    it('handles text embedding failure', async () => {
      const failEnv = {
        ...env,
        AI: { run: vi.fn().mockResolvedValue({ data: null }) }
      } as any
      
      const res = await postJson(app, '/api/search', { text: 'test' }, failEnv)
      expect(res.status).toBe(500)
    })
    
    it('handles invalid search request', async () => {
      const res = await postJson(app, '/api/search', { topK: 'not-number' }, env)
      expect(res.status).toBe(400) // Zod errors return 400
    })
    
    it('handles search error', async () => {
      const errorEnv = {
        ...env,
        VECTORIZE_INDEX: {
          query: vi.fn().mockRejectedValue(new Error('Query failed'))
        }
      } as any
      
      const res = await postJson(app, '/api/search', { vector: [0.1] }, errorEnv)
      expect(res.status).toBe(500)
    })
    
    it('handles non-Error in search', async () => {
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
  })

  
  describe('Delete Multiple Vectors', () => {
    it('deletes multiple vectors successfully', async () => {
      const mockEnv = {
        ...env,
        VECTORIZE_INDEX: {
          deleteByIds: vi.fn().mockResolvedValue({ count: 3 })
        }
      } as any
      
      const res = await app.request('/api/vectors/all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectorIds: ['vec_1', 'vec_2', 'vec_3']
        })
      }, mockEnv)
      
      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.success).toBe(true)
      expect(data.data.deletedCount).toBe(3)
      expect(data.data.batchCount).toBe(1)
    })
    
    it('handles empty vector IDs array', async () => {
      const res = await app.request('/api/vectors/all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectorIds: []
        })
      }, env)
      
      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.success).toBe(false)
      expect(data.error).toContain('Invalid request:')
    })
    
    it('handles invalid request body', async () => {
      const res = await app.request('/api/vectors/all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectorIds: 'not-an-array'
        })
      }, env)
      
      expect(res.status).toBe(400)
      const data = await res.json() as any
      expect(data.success).toBe(false)
      expect(data.error).toContain('Invalid request:')
    })
    
    it('handles delete error', async () => {
      const errorEnv = {
        ...env,
        VECTORIZE_INDEX: {
          deleteByIds: vi.fn().mockRejectedValue(new Error('Delete failed'))
        }
      } as any
      
      const res = await app.request('/api/vectors/all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectorIds: ['vec_1', 'vec_2']
        })
      }, errorEnv)
      
      expect(res.status).toBe(500)
    })
    
    it('handles non-Error in delete', async () => {
      const errorEnv = {
        ...env,
        VECTORIZE_INDEX: {
          deleteByIds: vi.fn().mockRejectedValue('string error')
        }
      } as any
      
      const res = await app.request('/api/vectors/all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectorIds: ['vec_1']
        })
      }, errorEnv)
      
      expect(res.status).toBe(500)
      const data = await res.json() as any
      expect(data.error).toBe('string error')
    })
    
    it('handles deleteByIds returning null count', async () => {
      const nullCountEnv = {
        ...env,
        VECTORIZE_INDEX: {
          deleteByIds: vi.fn().mockResolvedValue({ count: null })
        }
      } as any
      
      const res = await app.request('/api/vectors/all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectorIds: ['vec_1', 'vec_2']
        })
      }, nullCountEnv)
      
      expect(res.status).toBe(200)
      const data = await res.json() as any
      expect(data.data.deletedCount).toBe(2) // fallback to vectorIds.length
    })
  })

  describe('Authentication', () => {
    it('skips auth in development', async () => {
      const res = await postJson(app, '/api/embeddings', { text: 'test' }, env)
      expect(res.status).toBe(200)
    })
    
    it('requires auth in production', async () => {
      const prodEnv = createProdEnv('secret')
      const res = await postJson(app, '/api/embeddings', { text: 'test' }, prodEnv)
      expect(res.status).toBe(401)
    })
    
    it('accepts valid API key', async () => {
      const prodEnv = createProdEnv('secret')
      const res = await app.request('/api/embeddings', {
        method: 'POST',
        headers: { 
          'X-API-Key': 'secret',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: 'test' })
      }, prodEnv)
      expect(res.status).toBe(200)
    })
    
    it('accepts Bearer token', async () => {
      const prodEnv = createProdEnv('secret')
      const res = await app.request('/api/embeddings', {
        method: 'POST',
        headers: { 
          'Authorization': 'Bearer secret',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: 'test' })
      }, prodEnv)
      expect(res.status).toBe(200)
    })
  })
})