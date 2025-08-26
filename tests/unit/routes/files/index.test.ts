import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import filesRoutes from '../../../../src/routes/api/files/index'

// Mock all route handlers
vi.mock('../../../../src/routes/api/files/upload', () => ({
  uploadFileRoute: { method: 'post', path: '/files/upload' },
  uploadFileHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/files/status', () => ({
  fileStatusRoute: { method: 'get', path: '/files/{fileId}/status' },
  fileStatusHandler: vi.fn()
}))

describe('Files Routes Index', () => {
  let app: OpenAPIHono<{ Bindings: Env }>

  beforeEach(() => {
    vi.clearAllMocks()
    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi = vi.fn()
  })

  it('should register all files routes', () => {
    filesRoutes(app)

    expect(app.openapi).toHaveBeenCalledTimes(2)
    
    // Check each route was registered
    expect(app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/files/upload' }),
      expect.any(Function)
    )
    
    expect(app.openapi).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/files/{fileId}/status' }),
      expect.any(Function)
    )
  })
})