import type { OpenAPIHono } from '@hono/zod-openapi'
import { createVectorRoute, createVectorHandler } from './create'
import { getVectorRoute, getVectorHandler } from './get'
import { listVectorsRoute, listVectorsHandler } from './list'
import { deleteVectorRoute, deleteVectorHandler } from './delete'

// エクスポート用関数
export default (app: OpenAPIHono<{ Bindings: Env }>) => {
  app.openapi(createVectorRoute, createVectorHandler)
  app.openapi(getVectorRoute, getVectorHandler)
  app.openapi(listVectorsRoute, listVectorsHandler)
  app.openapi(deleteVectorRoute, deleteVectorHandler)
}