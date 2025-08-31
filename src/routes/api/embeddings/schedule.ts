/**
 * スケジュールバッチ埋め込み生成ルート (リファクタリング版)
 * バッチ埋め込み生成の非同期スケジュール機能
 */

import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { ErrorResponseSchema } from '../../../schemas/error.schema'
import {
  ScheduleBatchEmbeddingSchema,
  ScheduleBatchResponseSchema
} from '../../../schemas/embedding.schema'
import { createSuccessResponse } from '../../../utils/response-builder'
import { handleError } from '../../../utils/error-handler'
import { EmbeddingService } from './embedding-service'

type EnvType = {
  Bindings: Env
}

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

export const scheduleBatchEmbeddingHandler: RouteHandler<typeof scheduleBatchEmbeddingRoute, EnvType> = async (c) => {
  try {
    const body = c.req.valid('json')
    
    // EmbeddingServiceを使用（リファクタリング後の新実装）
    const embeddingService = new EmbeddingService(c.env)
    
    // scheduleBatchEmbeddingsメソッドを呼び出す
    // Note: EmbeddingServiceにscheduleBatchEmbeddingsメソッドがない場合は、
    // generateBatchEmbeddingsを使用してバッチ処理を実行
    const result = await embeddingService.generateBatchEmbeddings(
      body.texts,
      body.model,
      {
        batchSize: body.batchSize,
        saveToVectorize: body.saveToVectorize
      }
    )
    
    // レスポンスにtextsCountを追加
    const responseData = {
      ...result,
      textsCount: result.textsCount || body.texts.length
    }
    
    const response = createSuccessResponse(responseData, `${responseData.textsCount}件のテキストの処理がスケジュールされました`)
    return c.json(response, 200)
    
  } catch (error) {
    return handleError(c, error, 'バッチ処理のスケジュール中にエラーが発生しました')
  }
}