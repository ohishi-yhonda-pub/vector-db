import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import embeddingsRoutes from '../../../../src/routes/api/embeddings/index'

// Mock all route handlers
vi.mock('../../../../src/routes/api/embeddings/generate', () => ({
  generateEmbeddingRoute: { path: '/embeddings' },
  generateEmbeddingHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/embeddings/batch', () => ({
  batchEmbeddingRoute: { path: '/embeddings/batch' },
  batchEmbeddingHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/embeddings/schedule', () => ({
  scheduleBatchEmbeddingRoute: { path: '/embeddings/schedule' },
  scheduleBatchEmbeddingHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/embeddings/models', () => ({
  listModelsRoute: { path: '/embeddings/models' },
  listModelsHandler: vi.fn()
}))

describe('Embeddings Routes Index', () => {
  let app: OpenAPIHono<{ Bindings: Env }>

  beforeEach(() => {
    vi.clearAllMocks()
    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi = vi.fn()
  })

  it('should register all embeddings routes', () => {
    embeddingsRoutes(app)

    expect(app.openapi).toHaveBeenCalledTimes(4)
    
    // Check each route was registered
    expect(app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/embeddings' }),
      expect.any(Function)
    )
    
    expect(app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/embeddings/batch' }),
      expect.any(Function)
    )
    
    expect(app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/embeddings/schedule' }),
      expect.any(Function)
    )
    
    expect(app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/embeddings/models' }),
      expect.any(Function)
    )
  })
})