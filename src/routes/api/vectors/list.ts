import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import {
  VectorListResponseSchema,
  type VectorListResponse
} from '../../../schemas/vector.schema'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// ベクトル一覧取得ルート定義
export const listVectorsRoute = createRoute({
  method: 'get',
  path: '/vectors',
  request: {
    query: z.object({
      namespace: z.string().optional(),
      limit: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).default(10),
      cursor: z.string().optional()
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: VectorListResponseSchema
        }
      },
      description: 'ベクトル一覧'
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
  summary: 'ベクトル一覧の取得',
  description: 'ベクトルの一覧を取得します'
})

// ベクトル一覧取得ハンドラー
export const listVectorsHandler: RouteHandler<typeof listVectorsRoute, EnvType> = async (c) => {
  try {
    const { namespace, limit, cursor } = c.req.valid('query')
    
    // VectorManager Durable Objectを使用して一覧を取得
    const vectorManagerId = c.env.VECTOR_CACHE.idFromName('default')
    const vectorManager = c.env.VECTOR_CACHE.get(vectorManagerId)
    
    // ベクトル一覧を取得
    const result = await vectorManager.listVectors({
      namespace,
      limit,
      cursor
    })
    
    return c.json({
      success: true,
      data: result.vectors || [],
      count: result.count || 0,
      cursor: result.nextCursor,
      message: 'ベクトル一覧を取得しました'
    } as any, 200)
  } catch (error) {
    console.error('List vectors error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'ベクトル一覧の取得中にエラーが発生しました'
    }, 500)
  }
}