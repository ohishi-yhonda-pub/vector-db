import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import {
  ScheduleBatchEmbeddingSchema,
  ScheduleBatchResponseSchema
} from '../../../schemas/embedding.schema'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// スケジュールバッチ埋め込みルート
export const scheduleBatchEmbeddingRoute = createRoute({
  method: 'post',
  path: '/embeddings/schedule',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ScheduleBatchEmbeddingSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ScheduleBatchResponseSchema
        }
      },
      description: 'バッチ処理がスケジュールされました'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: '不正なリクエスト'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'サーバーエラー'
    }
  },
  tags: ['Embeddings'],
  summary: 'バッチ埋め込み生成のスケジュール',
  description: 'バッチ埋め込み生成を非同期でスケジュールします'
})

// スケジュールバッチ埋め込みハンドラー
export const scheduleBatchEmbeddingHandler: RouteHandler<typeof scheduleBatchEmbeddingRoute, EnvType> = async (c) => {
  try {
    const body = c.req.valid('json')
    
    // Durable Objectを使用
    const aiEmbeddingsId = c.env.AI_EMBEDDINGS.idFromName('default')
    const aiEmbeddings = c.env.AI_EMBEDDINGS.get(aiEmbeddingsId)
    
    const result = await aiEmbeddings.scheduleBatchEmbeddings(
      body.texts,
      body.model,
      {
        batchSize: body.batchSize,
        saveToVectorize: body.saveToVectorize,
        delayMs: body.delayMs
      }
    )
    
    return c.json({
      success: true,
      data: result,
      message: `${result.textsCount}件のテキストの処理がスケジュールされました`
    }, 200)
  } catch (error) {
    console.error('Schedule batch embedding error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'バッチ処理のスケジュール中にエラーが発生しました'
    }, 500)
  }
}