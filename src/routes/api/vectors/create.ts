import { createRoute, RouteHandler } from '@hono/zod-openapi'
import {
  CreateVectorSchema,
  AsyncVectorOperationResponseSchema,
  type AsyncVectorOperationResponse
} from '../../../schemas/vector.schema'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// ベクトル作成ルート定義
export const createVectorRoute = createRoute({
  method: 'post',
  path: '/vectors',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateVectorSchema
        }
      }
    }
  },
  responses: {
    202: {
      content: {
        'application/json': {
          schema: AsyncVectorOperationResponseSchema
        }
      },
      description: 'ベクトル作成処理が開始されました'
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
  tags: ['Vectors'],
  summary: 'ベクトル作成',
  description: 'テキストから埋め込みベクトルを生成して保存します'
})

// ベクトル作成ハンドラー
export const createVectorHandler: RouteHandler<typeof createVectorRoute, EnvType> = async (c) => {
  try {
    const body = c.req.valid('json')
    
    // VectorManager Durable Objectを使用
    const vectorManagerId = c.env.VECTOR_CACHE.idFromName('default')
    const vectorManager = c.env.VECTOR_CACHE.get(vectorManagerId)
    
    // 非同期でベクトルを作成
    const result = await vectorManager.createVectorAsync(
      body.text,
      body.model,
      body.namespace,
      body.metadata
    )
    
    return c.json<AsyncVectorOperationResponse, 202>({
      success: true,
      data: {
        jobId: result.jobId,
        workflowId: result.workflowId,
        status: result.status,
        message: 'ベクトルの作成を開始しました'
      }
    }, 202) // 202 Accepted for async operations
  } catch (error) {
    console.error('Create vector error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'ベクトル作成中にエラーが発生しました'
    }, 500)
  }
}