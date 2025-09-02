/**
 * Hono Test Helper - Simplified version using app.request()
 */

import type { Hono } from 'hono'
import { expect } from 'vitest'

/**
 * Create mock environment for testing
 */
export function createMockEnv(): Env {
  return {
    ENVIRONMENT: 'development',
    DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
    API_KEY: '',
    VECTORIZE_INDEX: {
      insert: async (vectors: any[]) => ({ count: vectors.length }),
      getByIds: async (ids: string[]) => ids.map(id => ({
        id,
        values: [0.1, 0.2, 0.3],
        metadata: { test: true }
      })),
      deleteByIds: async (ids: string[]) => ({ count: ids.length }),
      query: async (vector: number[], options?: any) => ({
        matches: [
          { id: 'test-id', score: 0.99, metadata: {} }
        ],
        count: 1
      }),
      list: async (options?: any) => ({
        vectors: ['vec_1', 'vec_2', 'vec_3'],
        isTruncated: false
      })
    } as any,
    AI: {
      run: async () => ({
        data: [[0.1, 0.2, 0.3]]
      })
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
}

/**
 * Helper to make requests using app.request()
 */
export async function testRequest(
  app: Hono<{ Bindings: Env }>,
  path: string,
  options?: {
    method?: string
    body?: any
    headers?: Record<string, string>
  },
  env?: Env
) {
  const method = options?.method || 'GET'
  const headers = options?.headers || {}
  
  if (options?.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  
  const body = options?.body 
    ? typeof options.body === 'string' 
      ? options.body 
      : JSON.stringify(options.body)
    : undefined
  
  return app.request(
    path,
    {
      method,
      headers,
      body
    },
    env || createMockEnv()
  )
}

/**
 * Helper for POST requests with JSON
 */
export async function postJson(
  app: Hono<{ Bindings: Env }>,
  path: string,
  data: any,
  env?: Env
) {
  return testRequest(app, path, {
    method: 'POST',
    body: data
  }, env)
}

/**
 * Helper for GET requests
 */
export async function get(
  app: Hono<{ Bindings: Env }>,
  path: string,
  env?: Env
) {
  return testRequest(app, path, {}, env)
}

/**
 * Helper for DELETE requests
 */
export async function del(
  app: Hono<{ Bindings: Env }>,
  path: string,
  env?: Env
) {
  return testRequest(app, path, { method: 'DELETE' }, env)
}

/**
 * Create production environment for testing
 */
export function createProdEnv(apiKey: string = 'secret'): any {
  const env = createMockEnv()
  return {
    ...env,
    ENVIRONMENT: 'production',
    API_KEY: apiKey
  }
}

/**
 * Assert JSON response
 */
export async function expectJson(response: Response) {
  const data = await response.json()
  return {
    toBe(expected: any) {
      expect(data).toEqual(expected)
    },
    toHaveProperty(prop: string, value?: any) {
      if (value !== undefined) {
        expect(data).toHaveProperty(prop, value)
      } else {
        expect(data).toHaveProperty(prop)
      }
    },
    toMatchObject(expected: any) {
      expect(data).toMatchObject(expected)
    },
    data // Return raw data for custom assertions
  }
}