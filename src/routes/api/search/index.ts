import type { OpenAPIHono } from '@hono/zod-openapi'
import { searchVectorsRoute, searchVectorsHandler } from './vectors'
import { semanticSearchRoute, semanticSearchHandler } from './semantic'
import { similarSearchRoute, similarSearchHandler } from './similar'

// エクスポート用関数
export default (app: OpenAPIHono<{ Bindings: Env }>) => {
  app.openapi(searchVectorsRoute, searchVectorsHandler)
  app.openapi(semanticSearchRoute, semanticSearchHandler)
  app.openapi(similarSearchRoute, similarSearchHandler)
}