import { describe, it, expect, vi, beforeEach } from 'vitest'
import searchRoutes from '../../../../src/routes/api/search/index'
import { setupSearchRouteTest } from '../../test-helpers/test-scenarios'

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
  let testSetup: ReturnType<typeof setupSearchRouteTest>

  beforeEach(() => {
    vi.clearAllMocks()
    testSetup = setupSearchRouteTest()
    testSetup.app.openapi = vi.fn()
  })

  it('should register all search routes', () => {
    searchRoutes(testSetup.app)

    expect(testSetup.app.openapi).toHaveBeenCalledTimes(3)
    
    // Check each route was registered
    expect(testSetup.app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/search' }),
      expect.any(Function)
    )
    
    expect(testSetup.app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/search/semantic' }),
      expect.any(Function)
    )
    
    expect(testSetup.app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/search/similar' }),
      expect.any(Function)
    )
  })
})