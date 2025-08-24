import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import {
  BatchEmbeddingSchema,
  BatchEmbeddingResponseSchema
} from '../../../schemas/embedding.schema'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// バッチ埋め込み生成ルート
export const batchEmbeddingRoute = createRoute({
  method: 'post',
  path: '/embeddings/batch',
  request: {
    body: {
      content: {
        'application/json': {
          schema: BatchEmbeddingSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: BatchEmbeddingResponseSchema
        }
      },
      description: 'バッチ処理が開始されました'
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
  summary: 'バッチテキスト埋め込み生成',
  description: '複数のテキストの埋め込みベクトルを非同期で一括生成します。処理状況はWorkflow IDで確認できます。'
})

// バッチ埋め込み生成ハンドラー
export const batchEmbeddingHandler: RouteHandler<typeof batchEmbeddingRoute, EnvType> = async (c) => {
  try {
    const body = c.req.valid('json')
    
    // Durable Objectを使用
    const aiEmbeddingsId = c.env.AI_EMBEDDINGS.idFromName('default')
    const aiEmbeddings = c.env.AI_EMBEDDINGS.get(aiEmbeddingsId)
    
    const result = await aiEmbeddings.generateBatchEmbeddings(
      body.texts,
      body.model,
      {
        batchSize: body.batchSize,
        saveToVectorize: body.saveToVectorize
      }
    )
    
    return c.json({
      success: true,
      data: result,
      message: `${result.textsCount}件のテキストの処理を開始しました`
    }, 200)
  } catch (error) {
    console.error('Batch embedding generation error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'バッチ埋め込み生成中にエラーが発生しました'
    }, 500)
  }
}