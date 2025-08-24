import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import notionRoutes from '../../../../src/routes/api/notion/index'

// Mock all route handlers
vi.mock('../../../../src/routes/api/notion/retrieve-page', () => ({
  retrieveNotionPageRoute: { path: '/notion/pages/:pageId' },
  retrieveNotionPageHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/notion/sync-page', () => ({
  syncNotionPageRoute: { path: '/notion/sync/:pageId' },
  syncNotionPageHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/notion/retrieve-blocks', () => ({
  retrieveNotionBlocksRoute: { path: '/notion/blocks/:blockId' },
  retrieveNotionBlocksHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/notion/list-pages', () => ({
  listNotionPagesRoute: { path: '/notion/pages' },
  listNotionPagesHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/notion/bulk-sync', () => ({
  bulkSyncNotionPagesRoute: { path: '/notion/bulk-sync' },
  bulkSyncNotionPagesHandler: vi.fn()
}))

describe('Notion Routes Index', () => {
  let app: OpenAPIHono<{ Bindings: Env }>

  beforeEach(() => {
    vi.clearAllMocks()
    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi = vi.fn()
  })

  it('should register all notion routes', () => {
    notionRoutes(app)

    expect(app.openapi).toHaveBeenCalledTimes(5)
    
    // Check each route was registered
    expect(app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/notion/pages' }),
      expect.any(Function)
    )
    
    expect(app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/notion/pages/:pageId' }),
      expect.any(Function)
    )
    
    expect(app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/notion/sync/:pageId' }),
      expect.any(Function)
    )
    
    expect(app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/notion/bulk-sync' }),
      expect.any(Function)
    )
    
    expect(app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/notion/blocks/:blockId' }),
      expect.any(Function)
    )
  })
})