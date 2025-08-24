import type { OpenAPIHono } from '@hono/zod-openapi'
import { generateEmbeddingRoute, generateEmbeddingHandler } from './generate'
import { batchEmbeddingRoute, batchEmbeddingHandler } from './batch'
import { scheduleBatchEmbeddingRoute, scheduleBatchEmbeddingHandler } from './schedule'
import { listModelsRoute, listModelsHandler } from './models'

// エクスポート用関数
export default (app: OpenAPIHono<{ Bindings: Env }>) => {
  app.openapi(generateEmbeddingRoute, generateEmbeddingHandler)
  app.openapi(batchEmbeddingRoute, batchEmbeddingHandler)
  app.openapi(scheduleBatchEmbeddingRoute, scheduleBatchEmbeddingHandler)
  app.openapi(listModelsRoute, listModelsHandler)
}