/**
 * バッチ埋め込み生成ルート（リファクタリング版）
 */

import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import {
  BatchEmbeddingSchema,
  BatchEmbeddingResponseSchema,
  type BatchEmbeddingResponse
} from '../../../schemas/embedding.schema'
import { AppError } from '../../../utils/error-handler'
import { createLogger } from '../../../middleware/logging'

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
  const logger = createLogger('BatchEmbedding', c.env)
  const startTime = Date.now()
  
  try {
    const body = c.req.valid('json')
    
    // 入力検証
    if (!body.texts || body.texts.length === 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        'At least one text is required for batch processing',
        400
      )
    }
    
    // 空文字列のチェック
    const emptyTextIndex = body.texts.findIndex(text => !text || text.trim().length === 0)
    if (emptyTextIndex !== -1) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Text at index ${emptyTextIndex} cannot be empty`,
        400
      )
    }
    
    logger.info('Starting batch embedding generation', {
      textsCount: body.texts.length,
      model: body.model,
      batchSize: body.batchSize || 10,
      saveToVectorize: body.saveToVectorize || false
    })
    
    // EmbeddingServiceを使用（リファクタリング後の新実装）
    const { EmbeddingService } = await import('./embedding-service')
    const embeddingService = new EmbeddingService(c.env)
    
    // バッチ埋め込み生成の実行
    const result = await embeddingService.generateBatchEmbeddings(
      body.texts,
      body.model,
      {
        batchSize: body.batchSize,
        saveToVectorize: body.saveToVectorize
      }
    )
    
    const processingTime = Date.now() - startTime
    
    logger.info('Batch embedding generation initiated', {
      batchId: result.batchId,
      workflowCount: result.workflowIds.length,
      processingTime
    })
    
    // 成功レスポンスの返却
    const response: BatchEmbeddingResponse = {
      success: true,
      data: result,
      message: `${result.textsCount}件のテキストの処理を開始しました`
    }
    
    return c.json(response, 200)
    
  } catch (error) {
    const processingTime = Date.now() - startTime
    
    if (error instanceof AppError) {
      logger.error('Batch embedding generation failed with AppError', error, {
        code: error.code,
        statusCode: error.statusCode,
        processingTime
      })
      
      return c.json<ErrorResponse, 400 | 500>({
        success: false,
        error: error.code,
        message: error.message
      }, error.statusCode as 400 | 500)
    }
    
    logger.error('Unexpected batch embedding generation error', error, { processingTime })
    
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'バッチ埋め込み生成中にエラーが発生しました'
    }, 500)
  }
}