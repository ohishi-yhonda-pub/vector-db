import type { OpenAPIHono } from '@hono/zod-openapi'
import { retrieveNotionPageRoute, retrieveNotionPageHandler } from './retrieve-page'
import { syncNotionPageRoute, syncNotionPageHandler } from './sync-page'
import { retrieveNotionBlocksRoute, retrieveNotionBlocksHandler } from './retrieve-blocks'
import { listNotionPagesRoute, listNotionPagesHandler } from './list-pages'
import { bulkSyncNotionPagesRoute, bulkSyncNotionPagesHandler } from './bulk-sync'

export default function notionRoutes(app: OpenAPIHono<{ Bindings: Env }>) {
  // ページ一覧取得
  app.openapi(listNotionPagesRoute, listNotionPagesHandler)
  
  // ページ取得
  app.openapi(retrieveNotionPageRoute, retrieveNotionPageHandler)
  
  // ページ同期
  app.openapi(syncNotionPageRoute, syncNotionPageHandler)
  
  // バルク同期
  app.openapi(bulkSyncNotionPagesRoute, bulkSyncNotionPagesHandler)
  
  // ブロック取得
  app.openapi(retrieveNotionBlocksRoute, retrieveNotionBlocksHandler)
}