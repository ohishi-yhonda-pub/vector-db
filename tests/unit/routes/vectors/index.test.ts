import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import vectorsRoutes from '../../../../src/routes/api/vectors/index'

// Mock all route handlers
vi.mock('../../../../src/routes/api/vectors/create', () => ({
  createVectorRoute: { path: '/vectors' },
  createVectorHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/vectors/get', () => ({
  getVectorRoute: { path: '/vectors/:id' },
  getVectorHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/vectors/list', () => ({
  listVectorsRoute: { path: '/vectors' },
  listVectorsHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/vectors/delete', () => ({
  deleteVectorRoute: { path: '/vectors/:id' },
  deleteVectorHandler: vi.fn()
}))

describe('Vectors Routes Index', () => {
  let app: OpenAPIHono<{ Bindings: Env }>

  beforeEach(() => {
    vi.clearAllMocks()
    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi = vi.fn()
  })

  it('should register all vectors routes', () => {
    vectorsRoutes(app)

    expect(app.openapi).toHaveBeenCalledTimes(4)
    
    // Check each route was registered
    expect(app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/vectors' }),
      expect.any(Function)
    )
    
    expect(app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/vectors/:id' }),
      expect.any(Function)
    )
  })
})