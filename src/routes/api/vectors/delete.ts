/**
 * ベクトル削除ルート (リファクタリング版)
 * IDによるベクトル単体削除
 */

import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { AsyncVectorOperationResponseSchema } from '../../../schemas/vector.schema'
import { ErrorResponseSchema } from '../../../schemas/error.schema'
import { acceptedResponse } from '../../../utils/response-builder-compat'
import { handleError } from '../../../utils/error-handler'
import { VectorJobService } from './job-service'

type EnvType = {
  Bindings: Env
}

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

export const deleteVectorHandler: RouteHandler<typeof deleteVectorRoute, EnvType> = async (c) => {
  try {
    const { id } = c.req.valid('param')
    
    const jobService = new VectorJobService(c.env)
    const result = await jobService.deleteVector(id)
    
    const response = acceptedResponse(result, 'ベクトルの削除を開始しました')
    return new Response(response.body, {
      status: response.status,
      headers: response.headers
    })
    
  } catch (error) {
    return handleError(c, error, 'ベクトルの削除中にエラーが発生しました')
  }
}