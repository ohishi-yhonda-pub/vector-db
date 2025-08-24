import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import {
  SearchQuerySchema,
  SearchResponseSchema,
  type SearchResponse
} from '../../../schemas/search.schema'
import { type VectorizeMatch } from '../../../schemas/cloudflare.schema'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import { VectorizeService } from '../../../services'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// セマンティック検索ルート定義（GET版）
export const semanticSearchRoute = createRoute({
  method: 'get',
  path: '/search/semantic',
  request: {
    query: z.object({
      query: z.string().min(1).openapi({
        example: '検索クエリテキスト',
        description: '検索するテキストクエリ'
      }),
      topK: z.string().optional().transform(v => v ? Number(v) : 10).pipe(z.number().int().min(1).max(100)).openapi({
        example: '10',
        description: '返す結果の最大数'
      }),
      namespace: z.string().optional().openapi({
        example: 'default',
        description: '検索する名前空間'
      })
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SearchResponseSchema
        }
      },
      description: '検索結果'
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
  tags: ['Search'],
  summary: 'セマンティック検索（GET）',
  description: 'クエリパラメータを使用した簡易セマンティック検索'
})

// セマンティック検索ハンドラー
export const semanticSearchHandler: RouteHandler<typeof semanticSearchRoute, EnvType> = async (c) => {
  try {
    const startTime = Date.now()
    const query = c.req.valid('query')

    const vectorizeService = new VectorizeService(c.env)

    // Workers AIを直接使用してクエリテキストをベクトル化（同期的）
    const aiResult = await c.env.AI.run(c.env.DEFAULT_EMBEDDING_MODEL as keyof AiModels, { text: query.query })

    if (!('data' in aiResult) || !aiResult.data || aiResult.data.length === 0) {
      throw new Error('Failed to generate embedding for query')
    }
    const embedding = aiResult.data[0]

    // Vectorizeで検索
    const searchResults = await vectorizeService.query(
      embedding,
      {
        topK: query.topK,
        namespace: query.namespace,
        returnMetadata: true
      }
    )

    // 結果を整形
    const matches = searchResults.matches.map((match: VectorizeMatch) => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata
    }))

    const processingTime = Date.now() - startTime

    return c.json<SearchResponse, 200>({
      success: true,
      data: {
        matches,
        query: query.query,
        namespace: query.namespace,
        processingTime
      },
      message: `${matches.length}件の結果が見つかりました`
    }, 200)
  } catch (error) {
    console.error('Semantic search error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : '検索中にエラーが発生しました'
    }, 500)
  }
}