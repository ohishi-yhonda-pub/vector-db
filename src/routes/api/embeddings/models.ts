/**
 * 埋め込みモデル管理ルート（リファクタリング版）
 */

import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import { z } from '@hono/zod-openapi'
import { EmbeddingService } from './embedding-service'
import { AppError } from '../../../utils/error-handler'
import { createLogger } from '../../../middleware/logging'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// モデル情報レスポンススキーマ
const ModelsResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    models: z.array(z.object({
      id: z.string(),
      name: z.string(),
      dimensions: z.number(),
      maxTokens: z.number(),
      supported: z.boolean()
    })),
    defaultModel: z.string()
  }),
  message: z.string()
})

// 利用可能モデル取得ルート
export const getAvailableModelsRoute = createRoute({
  method: 'get',
  path: '/embeddings/models',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ModelsResponseSchema
        }
      },
      description: '利用可能なモデル一覧'
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
  summary: '利用可能な埋め込みモデル一覧取得',
  description: 'Workers AIで利用可能な埋め込みモデルの一覧とデフォルトモデルを取得します'
})

// 利用可能モデル取得ハンドラー
export const getAvailableModelsHandler: RouteHandler<typeof getAvailableModelsRoute, EnvType> = async (c) => {
  const logger = createLogger('GetEmbeddingModels', c.env)
  
  try {
    logger.info('Fetching available embedding models')
    
    // 埋め込みサービスの初期化
    const embeddingService = new EmbeddingService(c.env)
    
    // 利用可能なモデルの取得
    const modelsInfo = await embeddingService.getAvailableModels()
    
    logger.info('Successfully fetched models', {
      modelsCount: modelsInfo.models.length,
      defaultModel: modelsInfo.defaultModel
    })
    
    // 成功レスポンスの返却
    return c.json({
      success: true,
      data: modelsInfo,
      message: `${modelsInfo.models.length}個のモデルが利用可能です`
    }, 200)
    
  } catch (error) {
    if (error instanceof AppError) {
      logger.error('Failed to get models with AppError', error, {
        code: error.code,
        statusCode: error.statusCode
      })
      
      return c.json<ErrorResponse, 500>({
        success: false,
        error: error.code,
        message: error.message
      }, 500)
    }
    
    logger.error('Unexpected error fetching models', error)
    
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'モデル一覧取得中にエラーが発生しました'
    }, 500)
  }
}

// モデル詳細取得ルート
export const getModelDetailsRoute = createRoute({
  method: 'get',
  path: '/embeddings/models/{modelId}',
  request: {
    params: z.object({
      modelId: z.string().openapi({
        example: 'text-embedding-ada-002',
        description: 'モデルID'
      })
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            data: z.object({
              id: z.string(),
              name: z.string(),
              dimensions: z.number(),
              maxTokens: z.number(),
              supported: z.boolean(),
              description: z.string().optional(),
              performance: z.object({
                speed: z.enum(['fast', 'medium', 'slow']),
                quality: z.enum(['high', 'medium', 'low'])
              }).optional()
            }),
            message: z.string()
          })
        }
      },
      description: 'モデル詳細情報'
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'モデルが見つかりません'
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
  summary: '埋め込みモデル詳細取得',
  description: '指定された埋め込みモデルの詳細情報を取得します'
})

// モデル詳細取得ハンドラー
export const getModelDetailsHandler: RouteHandler<typeof getModelDetailsRoute, EnvType> = async (c) => {
  const logger = createLogger('GetModelDetails', c.env)
  const { modelId } = c.req.valid('param')
  
  try {
    logger.info('Fetching model details', { modelId })
    
    // 埋め込みサービスの初期化
    const embeddingService = new EmbeddingService(c.env)
    
    // 利用可能なモデルの取得
    const modelsInfo = await embeddingService.getAvailableModels()
    
    // 指定されたモデルを検索
    const model = modelsInfo.models.find(m => m.id === modelId)
    
    if (!model) {
      throw new AppError(
        'MODEL_NOT_FOUND',
        `Model not found: ${modelId}`,
        404
      )
    }
    
    // モデル詳細情報の拡張（実際の実装では追加情報を取得）
    const modelDetails = {
      ...model,
      description: getModelDescription(modelId),
      performance: getModelPerformance(modelId)
    }
    
    logger.info('Successfully fetched model details', { modelId })
    
    // 成功レスポンスの返却
    return c.json({
      success: true,
      data: modelDetails,
      message: `モデル ${modelId} の詳細情報`
    }, 200)
    
  } catch (error) {
    if (error instanceof AppError) {
      logger.error('Failed to get model details with AppError', error, {
        code: error.code,
        statusCode: error.statusCode,
        modelId
      })
      
      if (error.statusCode === 404) {
        return c.json<ErrorResponse, 404>({
          success: false,
          error: error.code,
          message: error.message
        }, 404)
      }
      
      return c.json<ErrorResponse, 500>({
        success: false,
        error: error.code,
        message: error.message
      }, 500)
    }
    
    logger.error('Unexpected error fetching model details', error, { modelId })
    
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'モデル詳細取得中にエラーが発生しました'
    }, 500)
  }
}

// ヘルパー関数：モデル説明の取得
function getModelDescription(modelId: string): string {
  const descriptions: Record<string, string> = {
    'text-embedding-ada-002': 'OpenAI Ada 002 - 高速で効率的な汎用埋め込みモデル',
    'text-embedding-3-small': 'OpenAI Embedding v3 Small - バランスの取れた性能',
    'text-embedding-3-large': 'OpenAI Embedding v3 Large - 高精度な埋め込み生成',
    '@cf/baai/bge-base-en-v1.5': 'BAAI BGE Base - 英語特化型埋め込みモデル',
    '@cf/baai/bge-large-en-v1.5': 'BAAI BGE Large - 高精度英語埋め込みモデル',
    '@cf/baai/bge-small-en-v1.5': 'BAAI BGE Small - 軽量英語埋め込みモデル'
  }
  
  return descriptions[modelId] || '埋め込みモデル'
}

// ヘルパー関数：モデルパフォーマンス情報の取得
function getModelPerformance(modelId: string): { speed: 'fast' | 'medium' | 'slow', quality: 'high' | 'medium' | 'low' } {
  const performance: Record<string, { speed: 'fast' | 'medium' | 'slow', quality: 'high' | 'medium' | 'low' }> = {
    'text-embedding-ada-002': { speed: 'fast', quality: 'medium' },
    'text-embedding-3-small': { speed: 'fast', quality: 'medium' },
    'text-embedding-3-large': { speed: 'slow', quality: 'high' },
    '@cf/baai/bge-base-en-v1.5': { speed: 'medium', quality: 'medium' },
    '@cf/baai/bge-large-en-v1.5': { speed: 'slow', quality: 'high' },
    '@cf/baai/bge-small-en-v1.5': { speed: 'fast', quality: 'low' }
  }
  
  return performance[modelId] || { speed: 'medium', quality: 'medium' }
}