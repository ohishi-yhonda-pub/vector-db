import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { SearchResponseSchema, type SearchResponse } from '../../../schemas/search.schema'
import { type VectorizeMatch } from '../../../schemas/cloudflare.schema'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import { VectorizeService } from '../../../services'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// 類似検索ルート定義
export const similarSearchRoute = createRoute({
  method: 'post',
  path: '/search/similar',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            vectorId: z.string().min(1).openapi({
              example: 'vec_123456',
              description: '類似検索の基準となるベクトルID'
            }),
            topK: z.number().int().min(1).max(100).default(10),
            namespace: z.string().optional(),
            excludeSelf: z.boolean().default(true).openapi({
              description: '結果から自分自身を除外するか'
            })
          })
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SearchResponseSchema
        }
      },
      description: '類似検索結果'
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
  tags: ['Search'],
  summary: '類似ベクトル検索',
  description: '指定されたベクトルIDに類似するベクトルを検索します'
})

// 類似検索ハンドラー
export const similarSearchHandler: RouteHandler<typeof similarSearchRoute, EnvType> = async (c) => {
  try {
    const startTime = Date.now()
    const body = c.req.valid('json')
    
    const vectorizeService = new VectorizeService(c.env)
    
    // 類似検索を実行
    const searchResults = await vectorizeService.findSimilar(
      body.vectorId,
      {
        topK: body.topK,
        namespace: body.namespace,
        excludeSelf: body.excludeSelf,
        returnMetadata: true
      }
    )
    
    const processingTime = Date.now() - startTime
    
    return c.json<SearchResponse, 200>({
      success: true,
      data: {
        matches: searchResults.matches.map((match: VectorizeMatch) => ({
          id: match.id,
          score: match.score,
          metadata: match.metadata
        })),
        query: `Similar to ${body.vectorId}`,
        namespace: body.namespace,
        processingTime
      },
      message: `${searchResults.matches.length}件の類似ベクトルが見つかりました`
    }, 200)
  } catch (error) {
    console.error('Similar search error:', error)
    
    if (error instanceof Error && error.message.includes('not found')) {
      return c.json<ErrorResponse, 404>({
        success: false,
        error: 'Not Found',
        message: error.message
      }, 404)
    }
    
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : '類似検索中にエラーが発生しました'
    }, 500)
  }
}