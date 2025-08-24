import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { 
  SearchQuerySchema,
  SearchResponseSchema,
  type SearchResponse,
  type SearchMatch
} from '../../../schemas/search.schema'
import { type VectorizeMatch } from '../../../schemas/cloudflare.schema'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import { VectorizeService } from '../../../services'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// ベクトル検索ルート定義
export const searchVectorsRoute = createRoute({
  method: 'post',
  path: '/search',
  request: {
    body: {
      content: {
        'application/json': {
          schema: SearchQuerySchema
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
  summary: 'ベクトル検索',
  description: 'テキストクエリを使用してベクトルデータベースを検索します'
})

// ベクトル検索ハンドラー
export const searchVectorsHandler: RouteHandler<typeof searchVectorsRoute, EnvType> = async (c) => {
  try {
    const startTime = Date.now()
    const body = c.req.valid('json')
    
    const vectorizeService = new VectorizeService(c.env)
    
    // Workers AIを直接使用してクエリテキストをベクトル化（同期的）
    const aiResult = await c.env.AI.run(c.env.DEFAULT_EMBEDDING_MODEL as keyof AiModels, { text: body.query })
    
    if (!('data' in aiResult) || !aiResult.data || aiResult.data.length === 0) {
      throw new Error('Failed to generate embedding for query')
    }
    const embedding = aiResult.data[0]
    
    // Vectorizeで検索
    const searchResults = await vectorizeService.query(
      embedding,
      {
        topK: body.topK,
        namespace: body.namespace,
        filter: body.filter,
        returnMetadata: body.includeMetadata
      }
    )
    
    // 結果を整形
    const matches = searchResults.matches.map((match: VectorizeMatch) => {
      const result: SearchMatch = {
        id: match.id,
        score: match.score
      }
      
      if (body.includeMetadata && match.metadata) {
        result.metadata = match.metadata
      }
      
      if (body.includeValues) {
        // 値を含める場合は別途取得が必要
        // ここでは簡略化のため省略
      }
      
      return result
    })
    
    const processingTime = Date.now() - startTime
    
    return c.json<SearchResponse, 200>({
      success: true,
      data: {
        matches,
        query: body.query,
        namespace: body.namespace,
        processingTime
      },
      message: `${matches.length}件の結果が見つかりました`
    }, 200)
  } catch (error) {
    console.error('Search error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : '検索中にエラーが発生しました'
    }, 500)
  }
}