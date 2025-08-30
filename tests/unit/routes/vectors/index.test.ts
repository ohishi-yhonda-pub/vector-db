import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import vectorsRoutes from '../../../../src/routes/api/vectors/index'

// Mock all route handlers
vi.mock('../../../../src/routes/api/vectors/create', () => ({
  createVectorRoute: { path: '/vectors' },
  createVectorHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/vectors/get', () => ({
  getVectorRoute: { path: '/vectors/{id}' },
  getVectorHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/vectors/list', () => ({
  listVectorsRoute: { path: '/vectors' },
  listVectorsHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/vectors/delete', () => ({
  deleteVectorRoute: { path: '/vectors/{id}' },
  deleteVectorHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/vectors/status', () => ({
  getJobStatusRoute: { path: '/vectors/jobs/{jobId}' },
  getJobStatusHandler: vi.fn(),
  getAllJobsRoute: { path: '/vectors/jobs' },
  getAllJobsHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/vectors/bulk-delete', () => ({
  bulkDeleteVectorsRoute: { path: '/vectors/bulk-delete' },
  bulkDeleteVectorsHandler: vi.fn()
}))

vi.mock('../../../../src/routes/api/vectors/delete-all', () => ({
  deleteAllVectorsRoute: { path: '/vectors/all' },
  deleteAllVectorsHandler: vi.fn()
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

    expect(app.openapi).toHaveBeenCalledTimes(8)
    
    // Check that all expected routes were registered (order may vary)
    const calls = (app.openapi as any).mock.calls.map((call: any) => call[0].path)
    
    expect(calls).toContain('/vectors')
    expect(calls).toContain('/vectors/{id}')
    expect(calls).toContain('/vectors/jobs')
    expect(calls).toContain('/vectors/jobs/{jobId}')
    expect(calls).toContain('/vectors/all')
    expect(calls).toContain('/vectors/bulk-delete')
    
    // Also check that /vectors appears twice (create and list both use /vectors)
    expect(calls.filter((p: string) => p === '/vectors').length).toBe(2)
    // Also check that /vectors/{id} appears twice (get and delete both use /vectors/{id})
    expect(calls.filter((p: string) => p === '/vectors/{id}').length).toBe(2)
  })
})