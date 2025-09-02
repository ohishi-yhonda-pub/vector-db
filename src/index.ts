/**
 * Vector DB - OpenAPI enabled API
 * 
 * A clean, simple vector database API built on Cloudflare Workers
 * with OpenAPI documentation and Swagger UI
 */

import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { cors } from 'hono/cors'
import { generateEmbedding, batchEmbedding } from './embeddings'
import { createVector, getVector, deleteVector, searchVectors, batchCreateVectors, listVectors, deleteAllVectors } from './vectors'
import {
  healthRoute,
  embeddingRoute,
  batchEmbeddingRoute,
  createVectorRoute,
  getVectorRoute,
  deleteVectorRoute,
  batchCreateVectorRoute,
  searchRoute,
  listVectorsRoute,
  deleteAllVectorsRoute,
  textToVectorRoute
} from './routes'
import { createVectorFromText } from './handlers/text-to-vector'

// Create OpenAPI Hono app with custom validation error handling
const app = new OpenAPIHono<{ Bindings: Env }>({
  defaultHook: (result, c) => {
    if (!result.success) {
      // Handle validation errors consistently
      const firstError = result.error.issues[0]
      return c.json(
        { 
          success: false, 
          error: `Invalid request: ${firstError.message}` 
        }, 
        400
      )
    }
  }
})

// ============= Middleware =============

// CORS
app.use('*', cors())

// Authentication
app.use('/api/*', async (c, next) => {
  // Skip auth in development
  if (c.env.ENVIRONMENT === 'development') {
    return next()
  }
  
  const apiKey = c.req.header('X-API-Key') || c.req.header('Authorization')?.replace('Bearer ', '')
  if (apiKey !== c.env.API_KEY) {
    return c.json({ success: false, error: 'Unauthorized' }, 401)
  }
  
  await next()
})

// Request logging
app.use('*', async (c, next) => {
  const start = Date.now()
  await next()
  const duration = Date.now() - start
  console.log(`${c.req.method} ${c.req.path} - ${c.res.status} (${duration}ms)`)
})

// ============= OpenAPI Routes =============

// Health check
app.openapi(healthRoute, (c) => {
  return c.json({ 
    status: 'ok', 
    service: 'Vector DB',
    version: '2.0.0',
    endpoints: [
      'POST /api/embeddings',
      'POST /api/embeddings/batch',
      'POST /api/vectors',
      'GET /api/vectors',
      'GET /api/vectors/:id',
      'DELETE /api/vectors/:id',
      'POST /api/vectors/batch',
      'POST /api/search',
      'DELETE /api/vectors/all'
    ]
  })
})

// Embedding endpoints
app.openapi(embeddingRoute, generateEmbedding)
app.openapi(batchEmbeddingRoute, batchEmbedding)

// Vector CRUD endpoints  
app.openapi(createVectorRoute, createVector)
app.openapi(batchCreateVectorRoute, batchCreateVectors)

// List vectors endpoint (before parameterized routes)
app.openapi(listVectorsRoute, listVectors)

// Delete all vectors endpoint (before parameterized routes)
app.openapi(deleteAllVectorsRoute, deleteAllVectors)

// Text to vector endpoint (using Workflow)
app.openapi(textToVectorRoute, createVectorFromText)

// Parameterized routes (must come after specific paths)
app.openapi(getVectorRoute, (c) => getVector(c, c.req.param('id')))
app.openapi(deleteVectorRoute, (c) => deleteVector(c, c.req.param('id')))

// Search endpoint
app.openapi(searchRoute, searchVectors)

// ============= Documentation Routes =============

// Swagger UI at /doc
app.get('/doc', swaggerUI({ url: '/specification' }))

// OpenAPI specification at /specification
app.doc('/specification', (c) => ({
  info: {
    title: 'Vector DB API',
    version: '2.0.0',
    description: 'A simple vector database API built on Cloudflare Workers with Vectorize and Workers AI'
  },
  servers: [
    {
      url: 'https://vector-db.m-tama-ramu.workers.dev',
      description: 'Production server'
    },
    {
      url: 'http://localhost:8787', 
      description: 'Development server'
    }
  ],
  openapi: '3.0.0'
}))

// ============= Error Handlers =============

// 404 handler
app.notFound((c) => {
  return c.json({ success: false, error: 'Not found' }, 404)
})

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ success: false, error: 'Internal server error' }, 500)
})

// ============= Export =============

export default app