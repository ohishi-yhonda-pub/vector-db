import type { OpenAPIHono } from '@hono/zod-openapi'
import { createVectorRoute, createVectorHandler } from './create'
import { getVectorRoute, getVectorHandler } from './get'
import { listVectorsRoute, listVectorsHandler } from './list'
import { deleteVectorRoute, deleteVectorHandler } from './delete'
import { getJobStatusRoute, getJobStatusHandler, getAllJobsRoute, getAllJobsHandler } from './status'

// エクスポート用関数
export default (app: OpenAPIHono<{ Bindings: Env }>) => {
  // 具体的なパスを先に登録（/vectors/jobs を /vectors/{id} より前に）
  app.openapi(getAllJobsRoute, getAllJobsHandler)
  app.openapi(getJobStatusRoute, getJobStatusHandler)
  app.openapi(createVectorRoute, createVectorHandler)
  app.openapi(listVectorsRoute, listVectorsHandler)
  app.openapi(getVectorRoute, getVectorHandler)
  app.openapi(deleteVectorRoute, deleteVectorHandler)
}