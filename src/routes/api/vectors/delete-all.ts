import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// 全削除レスポンスのスキーマ
const DeleteAllResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    deletedCount: z.number(),
    message: z.string()
  }).optional(),
  message: z.string()
})

type DeleteAllResponse = z.infer<typeof DeleteAllResponseSchema>

// 全ベクトル削除ルート定義
export const deleteAllVectorsRoute = createRoute({
  method: 'delete',
  path: '/vectors/all',
  request: {
    query: z.object({
      namespace: z.string().optional().openapi({
        description: '削除対象のnamespace（省略時は全namespace）',
        example: 'documents'
      }),
      confirm: z.string().openapi({
        description: '削除確認（"DELETE_ALL"を指定）',
        example: 'DELETE_ALL'
      })
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: DeleteAllResponseSchema
        }
      },
      description: 'ベクトルが削除されました'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: '確認文字列が正しくありません'
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
  summary: '全ベクトルの削除',
  description: '指定されたnamespace内の全ベクトルを削除します（危険な操作）'
})

// 全ベクトル削除ハンドラー
export const deleteAllVectorsHandler: RouteHandler<typeof deleteAllVectorsRoute, EnvType> = async (c) => {
  try {
    const { namespace, confirm } = c.req.valid('query')
    
    // 確認文字列のチェック
    if (confirm !== 'DELETE_ALL') {
      return c.json<ErrorResponse, 400>({
        success: false,
        error: 'Bad Request',
        message: '削除を実行するには、confirmパラメータに"DELETE_ALL"を指定してください'
      }, 400)
    }
    
    // VectorManagerを使用して全削除
    const vectorManagerId = c.env.VECTOR_CACHE.idFromName('global')
    const vectorManager = c.env.VECTOR_CACHE.get(vectorManagerId)
    
    const result = await vectorManager.deleteAllVectors(namespace)
    
    return c.json<DeleteAllResponse, 200>({
      success: true,
      data: {
        deletedCount: result.deletedCount || 0,
        message: namespace 
          ? `Namespace "${namespace}" 内の全ベクトルを削除しました`
          : '全namespaceの全ベクトルを削除しました'
      },
      message: `${result.deletedCount || 0}件のベクトルを削除しました`
    }, 200)
  } catch (error) {
    console.error('Delete all vectors error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : '全削除中にエラーが発生しました'
    }, 500)
  }
}