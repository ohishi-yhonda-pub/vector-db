import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import {
  AsyncVectorOperationResponseSchema,
  type AsyncVectorOperationResponse
} from '../../../schemas/vector.schema'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// ベクトル削除ルート定義
export const deleteVectorRoute = createRoute({
  method: 'delete',
  path: '/vectors/{id}',
  request: {
    params: z.object({
      id: z.string().min(1)
    })
  },
  responses: {
    202: {
      content: {
        'application/json': {
          schema: AsyncVectorOperationResponseSchema
        }
      },
      description: 'ベクトル削除処理が開始されました'
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'ベクトルが見つかりません'
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
  summary: 'ベクトルの削除',
  description: 'IDを指定してベクトルを削除します'
})

// ベクトル削除ハンドラー
export const deleteVectorHandler: RouteHandler<typeof deleteVectorRoute, EnvType> = async (c) => {
  try {
    const { id } = c.req.valid('param')
    
    // VectorManager Durable Objectを使用
    const vectorManagerId = c.env.VECTOR_CACHE.idFromName('default')
    const vectorManager = c.env.VECTOR_CACHE.get(vectorManagerId)
    
    // 非同期でベクトルを削除
    const result = await vectorManager.deleteVectorsAsync([id])
    
    return c.json<AsyncVectorOperationResponse, 202>({
      success: true,
      data: {
        jobId: result.jobId,
        workflowId: result.workflowId,
        status: result.status,
        message: 'ベクトルの削除を開始しました'
      }
    }, 202) // 202 Accepted for async operations
  } catch (error) {
    console.error('Delete vector error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'ベクトルの削除中にエラーが発生しました'
    }, 500)
  }
}