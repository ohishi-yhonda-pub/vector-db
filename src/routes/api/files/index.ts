import type { OpenAPIHono } from '@hono/zod-openapi'
import { uploadFileRoute, uploadFileHandler } from './upload'
import { fileStatusRoute, fileStatusHandler } from './status'

// エクスポート用関数
export default (app: OpenAPIHono<{ Bindings: Env }>) => {
  app.openapi(uploadFileRoute, uploadFileHandler)
  app.openapi(fileStatusRoute, fileStatusHandler)
}