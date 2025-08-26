import type { OpenAPIHono } from '@hono/zod-openapi'
import { createVectorRoute, createVectorHandler } from './create'
import { getVectorRoute, getVectorHandler } from './get'
import { listVectorsRoute, listVectorsHandler } from './list'
import { deleteVectorRoute, deleteVectorHandler } from './delete'
import { getJobStatusRoute, getJobStatusHandler, getAllJobsRoute, getAllJobsHandler } from './status'

// エクスポート用関数
export default (app: OpenAPIHono<{ Bindings: Env }>) => {
  app.openapi(createVectorRoute, createVectorHandler)
  app.openapi(getVectorRoute, getVectorHandler)
  app.openapi(listVectorsRoute, listVectorsHandler)
  app.openapi(deleteVectorRoute, deleteVectorHandler)
  app.openapi(getJobStatusRoute, getJobStatusHandler)
  app.openapi(getAllJobsRoute, getAllJobsHandler)
}