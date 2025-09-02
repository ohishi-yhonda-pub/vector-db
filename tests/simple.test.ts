/**
 * Simple test to verify app works
 */

import { describe, it, expect } from 'vitest'
import app from '../src/index'

describe('Simple Tests', () => {
  const env = {
    ENVIRONMENT: 'development',
    DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
    API_KEY: 'test-key',
    AI: {
      run: async () => ({ data: [[0.1, 0.2, 0.3]] })
    } as any,
    VECTORIZE_INDEX: {
      insert: async () => ({ count: 1 }),
      getByIds: async () => [{ id: 'test', values: [0.1], metadata: {} }],
      deleteByIds: async () => ({ count: 1 }),
      query: async () => ({ matches: [], count: 0 })
    } as any,
    DB: {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [] }),
          run: async () => ({ success: true })
        }),
        all: async () => ({ results: [] }),
        run: async () => ({ success: true })
      })
    } as any
  }
  
  it('GET / works', async () => {
    const res = await app.request('/', {}, env)
    expect(res.status).toBe(200)
  })
  
  it('POST /api/embeddings works', async () => {
    const res = await app.request('/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello' })
    }, env)
    expect(res.status).toBe(200)
  })
  
  it('POST /api/vectors works', async () => {
    const res = await app.request('/api/vectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [0.1, 0.2] })
    }, env)
    expect(res.status).toBe(200)
  })
  
  it('POST /api/vectors with custom ID works', async () => {
    const res = await app.request('/api/vectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'custom-123',
        values: [0.1, 0.2],
        metadata: { test: true }
      })
    }, env)
    expect(res.status).toBe(200)
  })
  
  it('GET /api/vectors/:id works', async () => {
    const res = await app.request('/api/vectors/test-id', {}, env)
    expect(res.status).toBe(200)
  })
  
  it('DELETE /api/vectors/:id works', async () => {
    const res = await app.request('/api/vectors/test-id', {
      method: 'DELETE'
    }, env)
    expect(res.status).toBe(200)
  })
  
  it('POST /api/search with vector works', async () => {
    const res = await app.request('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector: [0.1, 0.2] })
    }, env)
    expect(res.status).toBe(200)
  })
  
  it('POST /api/search with text works', async () => {
    const res = await app.request('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello' })
    }, env)
    expect(res.status).toBe(200)
  })
})