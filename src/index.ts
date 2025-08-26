import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { swaggerUI } from '@hono/swagger-ui'
import vectorRoutes from './routes/api/vectors/index'
import searchRoutes from './routes/api/search/index'
import embeddingsRoutes from './routes/api/embeddings/index'
import fileRoutes from './routes/api/files/index'
import notionRoutes from './routes/api/notion/index'

const app = new OpenAPIHono<{ Bindings: Env }>()
// ミドルウェア
app.use("*", logger())
app.use("*", cors())

// ヘルスチェックエンドポイント
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT || "production"
  })
})

// ルートエンドポイント
app.get("/", (c) => {
  return c.json({
    message: "Vector Database API",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      vectors: "/api/vectors",
      search: "/api/search",
      embeddings: "/api/embeddings",
      files: "/api/files"
    }
  })
})

// OpenAPIドキュメント設定
app.doc('/specification', (c) => ({
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Vector Database API',
    description: 'Cloudflare Vectorize と Workers AI を使用したベクトルデータベースAPI'
  },
  servers: [
    {
      url: 'http://localhost:8787',
      description: 'Local development server'
    },
    {
      url: c.req.url.replace(/\/specification.*$/, ''),
      description: 'Current server'
    }
  ]
}))

// Swagger UI
app.get('/doc', swaggerUI({ url: '/specification' }))

// APIルートの登録
const api = new OpenAPIHono<{ Bindings: Env }>()

// ルートを登録
vectorRoutes(api)
searchRoutes(api)
embeddingsRoutes(api)
fileRoutes(api)
notionRoutes(api)

app.route('/api', api)

// 404ハンドラー
app.notFound((c) => {
  return c.json({
    error: "Not Found",
    message: "The requested endpoint does not exist"
  }, 404)
})

// エラーハンドラー
app.onError((err, c) => {
  console.error(`Error: ${err.message}`, err)
  return c.json({
    error: "Internal Server Error",
    message: err.message
  }, 500)
})


// Durable Objectsをエクスポート
export { VectorManager, AIEmbeddings, NotionManager } from './durable-objects'
// Workflowsをエクスポート
export { EmbeddingsWorkflow } from './workflows/embeddings'
export { BatchEmbeddingsWorkflow } from './workflows/batch-embeddings'
export { VectorOperationsWorkflow } from './workflows/vector-operations'
export { FileProcessingWorkflow } from './workflows/file-processing'
export { NotionSyncWorkflow } from './workflows/notion-sync'

export default app
