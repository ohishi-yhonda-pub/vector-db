// Export all mock helpers from a single entry point
export * from './mock-env'
export * from './mock-durable-objects'
export * from './mock-workflows'
export * from './test-fixtures'
export * from './test-scenarios'

import { vi } from 'vitest'

/**
 * Create a mock Context object for Hono handlers
 * @param options - Options for the mock context
 */
export function createMockContext(options: {
  req?: any
  env?: any
  json?: any
  text?: any
  status?: any
  header?: any
} = {}) {
  return {
    req: options.req || {
      json: vi.fn(),
      text: vi.fn(),
      valid: vi.fn(),
      query: vi.fn(() => ({})),
      param: vi.fn(() => ({}))
    },
    env: options.env || {},
    json: options.json || vi.fn((data, status) => ({ data, status })),
    text: options.text || vi.fn((text, status) => ({ text, status })),
    status: options.status || vi.fn(),
    header: options.header || vi.fn(),
    get: vi.fn(),
    set: vi.fn()
  } as any
}

/**
 * Create a mock Request object
 * @param url - The URL for the request
 * @param options - Request options
 */
export function createMockRequest(url: string, options: {
  method?: string
  headers?: Record<string, string>
  body?: any
} = {}) {
  const headers = new Headers(options.headers || {})
  let body: string | undefined = undefined
  
  if (options.body) {
    if (typeof options.body === 'object') {
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
      }
      body = JSON.stringify(options.body)
    } else {
      body = String(options.body)
    }
  }
  
  return new Request(url, {
    method: options.method || 'GET',
    headers,
    body
  })
}