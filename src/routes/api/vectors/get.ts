import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import {
  VectorResponseSchema,
  type VectorResponse
} from '../../../schemas/vector.schema'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import { VectorizeService } from '../../../services'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// ベクトル取得ルート定義
export const getVectorRoute = createRoute({
  method: 'get',
  path: '/vectors/{id}',
  request: {
    params: z.object({
      id: z.string().min(1)
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: VectorResponseSchema
        }
      },
      description: 'ベクトル情報'
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
  summary: 'ベクトルの取得',
  description: 'IDを指定してベクトルを取得します'
})

// ベクトル取得ハンドラー
export const getVectorHandler: RouteHandler<typeof getVectorRoute, EnvType> = async (c) => {
  try {
    const { id } = c.req.valid('param')
    
    const vectorizeService = new VectorizeService(c.env)
    const vectors = await vectorizeService.getByIds([id])

    if (!vectors || vectors.length === 0) {
      return c.json<ErrorResponse, 404>({
        success: false,
        error: 'Not Found',
        message: `ベクトル ${id} が見つかりません`
      }, 404)
    }

    return c.json<VectorResponse, 200>({
      success: true,
      data: vectors[0],
      message: 'ベクトルが見つかりました'
    }, 200)
  } catch (error) {
    console.error('Get vector error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'ベクトル取得中にエラーが発生しました'
    }, 500)
  }
}