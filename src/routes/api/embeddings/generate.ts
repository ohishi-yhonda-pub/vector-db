/**
 * 埋め込み生成ルート（リファクタリング版）
 */

import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import {
  GenerateEmbeddingSchema,
  GenerateEmbeddingResponseSchema,
  type GenerateEmbeddingResponse
} from '../../../schemas/embedding.schema'
import { EmbeddingService } from './embedding-service'
import { AppError } from '../../../utils/error-handler'
import { createLogger } from '../../../middleware/logging'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// 埋め込み生成ルート
export const generateEmbeddingRoute = createRoute({
  method: 'post',
  path: '/embeddings',
  request: {
    body: {
      content: {
        'application/json': {
          schema: GenerateEmbeddingSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: GenerateEmbeddingResponseSchema
        }
      },
      description: '処理が開始されました'
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
  summary: 'テキスト埋め込み生成',
  description: 'Workers AIを使用してテキストの埋め込みベクトルを非同期で生成します。処理状況はWorkflow IDで確認できます。'
})

// 埋め込み生成ハンドラー
export const generateEmbeddingHandler: RouteHandler<typeof generateEmbeddingRoute, EnvType> = async (c) => {
  const logger = createLogger('GenerateEmbedding', c.env)
  const startTime = Date.now()
  
  try {
    const body = c.req.valid('json')
    
    // 入力検証
    if (!body.text || body.text.trim().length === 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Text cannot be empty',
        400
      )
    }
    
    logger.info('Starting embedding generation', {
      textLength: body.text.length,
      model: body.model
    })
    
    // 埋め込みサービスの初期化
    const embeddingService = new EmbeddingService(c.env)
    
    // 埋め込み生成の実行
    const result = await embeddingService.generateEmbedding(
      body.text,
      body.model
    )
    
    const processingTime = Date.now() - startTime
    
    logger.info('Embedding generation initiated', {
      workflowId: result.workflowId,
      processingTime
    })
    
    // 成功レスポンスの返却
    const response: GenerateEmbeddingResponse = {
      success: true,
      data: result,
      message: 'テキストの処理を開始しました'
    }
    
    return c.json(response, 200)
    
  } catch (error) {
    const processingTime = Date.now() - startTime
    
    if (error instanceof AppError) {
      logger.error('Embedding generation failed with AppError', error, {
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
    
    logger.error('Unexpected embedding generation error', error, { processingTime })
    
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : '埋め込み生成中にエラーが発生しました'
    }, 500)
  }
}