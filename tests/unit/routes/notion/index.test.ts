import { describe, it, expect, vi, beforeEach } from 'vitest'
import notionRoutes from '../../../../src/routes/api/notion/index'
import { setupNotionRouteTest } from '../../test-helpers'

// Mock all route handlers
vi.mock('../../../../src/routes/api/notion/retrieve-page', () => ({
  retrieveNotionPageRoute: { path: '/notion/pages/{pageId}' },
  retrieveNotionPageHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/notion/sync-page', () => ({
  syncNotionPageRoute: { path: '/notion/pages/{pageId}/sync' },
  syncNotionPageHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/notion/retrieve-blocks', () => ({
  retrieveNotionBlocksRoute: { path: '/notion/pages/{pageId}/blocks' },
  retrieveNotionBlocksHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/notion/list-pages', () => ({
  listNotionPagesRoute: { path: '/notion/pages' },
  listNotionPagesHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/notion/bulk-sync', () => ({
  bulkSyncNotionPagesRoute: { path: '/notion/pages/bulk-sync' },
  bulkSyncNotionPagesHandler: vi.fn()
}))

describe('Notion Routes Index', () => {
  let testSetup: ReturnType<typeof setupNotionRouteTest>

  beforeEach(() => {
    testSetup = setupNotionRouteTest()
    testSetup.app.openapi = vi.fn()
  })

  it('should register all notion routes', () => {
    notionRoutes(testSetup.app)

    expect(testSetup.app.openapi).toHaveBeenCalledTimes(5)
    
    // Check each route was registered
    expect(testSetup.app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/notion/pages' }),
      expect.any(Function)
    )
    
    expect(testSetup.app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/notion/pages/{pageId}' }),
      expect.any(Function)
    )
    
    expect(testSetup.app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/notion/pages/{pageId}/sync' }),
      expect.any(Function)
    )
    
    expect(testSetup.app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/notion/pages/bulk-sync' }),
      expect.any(Function)
    )
    
    expect(testSetup.app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/notion/pages/{pageId}/blocks' }),
      expect.any(Function)
    )
  })
})