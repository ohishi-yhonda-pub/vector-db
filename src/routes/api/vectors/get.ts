/**
 * ベクトル取得ルート (リファクタリング版)
 * IDによるベクトル単体取得
 */

import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { VectorResponseSchema } from '../../../schemas/vector.schema'
import { ErrorResponseSchema } from '../../../schemas/error.schema'
import { createSuccessResponse } from '../../../utils/response-builder'
import { notFoundResponse } from '../../../utils/response-builder-compat'
import { handleError } from '../../../utils/error-handler'

type EnvType = {
  Bindings: Env
}

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

export const getVectorHandler: RouteHandler<typeof getVectorRoute, EnvType> = async (c) => {
  try {
    const { id } = c.req.valid('param')
    
    const vectors = await c.env.VECTORIZE_INDEX.getByIds([id])
    const vector = vectors && vectors.length > 0 ? vectors[0] : null

    if (!vector) {
      const response = notFoundResponse(`ベクトル ${id} が見つかりません`)
      return new Response(response.body, {
        status: response.status,
        headers: response.headers
      })
    }

    const response = createSuccessResponse(vector, 'ベクトルが見つかりました')
    return c.json(response, 200)
    
  } catch (error) {
    return handleError(c, error, 'ベクトル取得中にエラーが発生しました')
  }
}