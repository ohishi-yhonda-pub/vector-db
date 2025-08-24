import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'

// Import all route index modules
import embeddingsRoutes from '../../../src/routes/api/embeddings/index'
import searchRoutes from '../../../src/routes/api/search/index'
import vectorsRoutes from '../../../src/routes/api/vectors/index'
import filesRoutes from '../../../src/routes/api/files/index'
import notionRoutes from '../../../src/routes/api/notion/index'

// Mock all individual route modules
vi.mock('../../../src/routes/api/embeddings/generate', () => ({
  generateEmbeddingRoute: { method: 'post', path: '/embeddings/generate' },
  generateEmbeddingHandler: vi.fn()
}))

vi.mock('../../../src/routes/api/embeddings/batch', () => ({
  batchEmbeddingRoute: { method: 'post', path: '/embeddings/batch' },
  batchEmbeddingHandler: vi.fn()
}))

vi.mock('../../../src/routes/api/embeddings/schedule', () => ({
  scheduleBatchEmbeddingRoute: { method: 'post', path: '/embeddings/schedule' },
  scheduleBatchEmbeddingHandler: vi.fn()
}))

vi.mock('../../../src/routes/api/embeddings/models', () => ({
  listModelsRoute: { method: 'get', path: '/embeddings/models' },
  listModelsHandler: vi.fn()
}))

vi.mock('../../../src/routes/api/search/vectors', () => ({
  searchVectorsRoute: { method: 'post', path: '/search/vectors' },
  searchVectorsHandler: vi.fn()
}))

vi.mock('../../../src/routes/api/search/semantic', () => ({
  semanticSearchRoute: { method: 'post', path: '/search/semantic' },
  semanticSearchHandler: vi.fn()
}))

vi.mock('../../../src/routes/api/search/similar', () => ({
  similarSearchRoute: { method: 'post', path: '/search/similar' },
  similarSearchHandler: vi.fn()
}))

vi.mock('../../../src/routes/api/vectors/create', () => ({
  createVectorRoute: { method: 'post', path: '/vectors' },
  createVectorHandler: vi.fn()
}))

vi.mock('../../../src/routes/api/vectors/get', () => ({
  getVectorRoute: { method: 'get', path: '/vectors/{id}' },
  getVectorHandler: vi.fn()
}))

vi.mock('../../../src/routes/api/vectors/list', () => ({
  listVectorsRoute: { method: 'get', path: '/vectors' },
  listVectorsHandler: vi.fn()
}))

vi.mock('../../../src/routes/api/vectors/delete', () => ({
  deleteVectorRoute: { method: 'delete', path: '/vectors/{id}' },
  deleteVectorHandler: vi.fn()
}))

vi.mock('../../../src/routes/api/files/upload', () => ({
  uploadFileRoute: { method: 'post', path: '/files/upload' },
  uploadFileHandler: vi.fn()
}))

vi.mock('../../../src/routes/api/files/status', () => ({
  fileStatusRoute: { method: 'get', path: '/files/{fileId}/status' },
  fileStatusHandler: vi.fn()
}))

vi.mock('../../../src/routes/api/notion/retrieve-page', () => ({
  retrieveNotionPageRoute: { method: 'get', path: '/notion/pages/{pageId}' },
  retrieveNotionPageHandler: vi.fn()
}))

vi.mock('../../../src/routes/api/notion/sync-page', () => ({
  syncNotionPageRoute: { method: 'post', path: '/notion/pages/{pageId}/sync' },
  syncNotionPageHandler: vi.fn()
}))

vi.mock('../../../src/routes/api/notion/retrieve-blocks', () => ({
  retrieveNotionBlocksRoute: { method: 'get', path: '/notion/pages/{pageId}/blocks' },
  retrieveNotionBlocksHandler: vi.fn()
}))

vi.mock('../../../src/routes/api/notion/list-pages', () => ({
  listNotionPagesRoute: { method: 'get', path: '/notion/pages' },
  listNotionPagesHandler: vi.fn()
}))

vi.mock('../../../src/routes/api/notion/bulk-sync', () => ({
  bulkSyncNotionPagesRoute: { method: 'post', path: '/notion/pages/bulk-sync' },
  bulkSyncNotionPagesHandler: vi.fn()
}))

describe('Route Index Files', () => {
  let app: OpenAPIHono<{ Bindings: Env }>
  let mockOpenapi: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    app = new OpenAPIHono<{ Bindings: Env }>()
    mockOpenapi = vi.spyOn(app, 'openapi').mockImplementation(() => app) as any
  })

  describe('Embeddings Routes Index', () => {
    it('should register all embeddings routes', () => {
      embeddingsRoutes(app)

      expect(mockOpenapi).toHaveBeenCalledTimes(4)
      expect(mockOpenapi).toHaveBeenNthCalledWith(1, 
        expect.objectContaining({ method: 'post', path: '/embeddings/generate' }), 
        expect.any(Function)
      )
      expect(mockOpenapi).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ method: 'post', path: '/embeddings/batch' }),
        expect.any(Function)
      )
      expect(mockOpenapi).toHaveBeenNthCalledWith(3,
        expect.objectContaining({ method: 'post', path: '/embeddings/schedule' }),
        expect.any(Function)
      )
      expect(mockOpenapi).toHaveBeenNthCalledWith(4,
        expect.objectContaining({ method: 'get', path: '/embeddings/models' }),
        expect.any(Function)
      )
    })
  })

  describe('Search Routes Index', () => {
    it('should register all search routes', () => {
      searchRoutes(app)

      expect(mockOpenapi).toHaveBeenCalledTimes(3)
      expect(mockOpenapi).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ method: 'post', path: '/search/vectors' }),
        expect.any(Function)
      )
      expect(mockOpenapi).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ method: 'post', path: '/search/semantic' }),
        expect.any(Function)
      )
      expect(mockOpenapi).toHaveBeenNthCalledWith(3,
        expect.objectContaining({ method: 'post', path: '/search/similar' }),
        expect.any(Function)
      )
    })
  })

  describe('Vectors Routes Index', () => {
    it('should register all vectors routes', () => {
      vectorsRoutes(app)

      expect(mockOpenapi).toHaveBeenCalledTimes(4)
      expect(mockOpenapi).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ method: 'post', path: '/vectors' }),
        expect.any(Function)
      )
      expect(mockOpenapi).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ method: 'get', path: '/vectors/{id}' }),
        expect.any(Function)
      )
      expect(mockOpenapi).toHaveBeenNthCalledWith(3,
        expect.objectContaining({ method: 'get', path: '/vectors' }),
        expect.any(Function)
      )
      expect(mockOpenapi).toHaveBeenNthCalledWith(4,
        expect.objectContaining({ method: 'delete', path: '/vectors/{id}' }),
        expect.any(Function)
      )
    })
  })

  describe('Files Routes Index', () => {
    it('should register all files routes', () => {
      filesRoutes(app)

      expect(mockOpenapi).toHaveBeenCalledTimes(2)
      expect(mockOpenapi).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ method: 'post', path: '/files/upload' }),
        expect.any(Function)
      )
      expect(mockOpenapi).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ method: 'get', path: '/files/{fileId}/status' }),
        expect.any(Function)
      )
    })
  })

  describe('Notion Routes Index', () => {
    it('should register all notion routes', () => {
      notionRoutes(app)

      expect(mockOpenapi).toHaveBeenCalledTimes(5)
      expect(mockOpenapi).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ method: 'get', path: '/notion/pages' }),
        expect.any(Function)
      )
      expect(mockOpenapi).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ method: 'get', path: '/notion/pages/{pageId}' }),
        expect.any(Function)
      )
      expect(mockOpenapi).toHaveBeenNthCalledWith(3,
        expect.objectContaining({ method: 'post', path: '/notion/pages/{pageId}/sync' }),
        expect.any(Function)
      )
      expect(mockOpenapi).toHaveBeenNthCalledWith(4,
        expect.objectContaining({ method: 'post', path: '/notion/pages/bulk-sync' }),
        expect.any(Function)
      )
      expect(mockOpenapi).toHaveBeenNthCalledWith(5,
        expect.objectContaining({ method: 'get', path: '/notion/pages/{pageId}/blocks' }),
        expect.any(Function)
      )
    })
  })

  describe('Route Registration Integration', () => {
    it('should handle multiple route registrations without conflicts', () => {
      embeddingsRoutes(app)
      searchRoutes(app) 
      vectorsRoutes(app)
      filesRoutes(app)
      notionRoutes(app)

      expect(mockOpenapi).toHaveBeenCalledTimes(18) // 4+3+4+2+5 = 18 total routes
    })

    it('should return the app instance for chaining', () => {
      const result = embeddingsRoutes(app)
      expect(result).toBeUndefined() // These functions don't return anything
    })
  })
})