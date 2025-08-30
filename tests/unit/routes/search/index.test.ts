import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import searchRoutes from '../../../../src/routes/api/search/index'

// Mock all route handlers
vi.mock('../../../../src/routes/api/search/vectors', () => ({
  searchVectorsRoute: { path: '/search' },
  searchVectorsHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/search/semantic', () => ({
  semanticSearchRoute: { path: '/search/semantic' },
  semanticSearchHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/search/similar', () => ({
  similarSearchRoute: { path: '/search/similar' },
  similarSearchHandler: vi.fn()
}))

describe('Search Routes Index', () => {
  let app: OpenAPIHono<{ Bindings: Env }>

  beforeEach(() => {
    vi.clearAllMocks()
    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi = vi.fn()
  })

  it('should register all search routes', () => {
    searchRoutes(app)

    expect(app.openapi).toHaveBeenCalledTimes(3)
    
    // Check each route was registered
    expect(app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/search' }),
      expect.any(Function)
    )
    
    expect(app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/search/semantic' }),
      expect.any(Function)
    )
    
    expect(app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/search/similar' }),
      expect.any(Function)
    )
  })
})