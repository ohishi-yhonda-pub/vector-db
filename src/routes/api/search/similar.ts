/**
 * 類似ベクトル検索ルート（リファクタリング版）
 */

import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { SearchResponseSchema, type SearchResponse } from '../../../schemas/search.schema'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import { SimilarSearchParamsSchema, normalizeSearchParams } from './search-validator'
import { SearchService } from './search-service'
import { AppError, ErrorCodes, createErrorResponse, getStatusCode } from '../../../utils/error-handler'
import { createLogger } from '../../../middleware/logging'

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
          schema: SimilarSearchParamsSchema
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
  const logger = createLogger('SimilarSearch', c.env)
  const startTime = Date.now()
  
  try {
    // リクエストパラメータの取得と正規化
    const body = normalizeSearchParams(c.req.valid('json'))
    
    logger.info('Starting similar search', {
      vectorId: body.vectorId,
      topK: body.topK,
      namespace: body.namespace,
      excludeSelf: body.excludeSelf
    })
    
    // 検索サービスの初期化
    const searchService = new SearchService(c.env)
    
    // 類似検索の実行
    const matches = await searchService.searchSimilar(body.vectorId, {
      topK: body.topK,
      namespace: body.namespace,
      excludeSelf: body.excludeSelf
    })
    
    const processingTime = Date.now() - startTime
    
    logger.info('Similar search completed', {
      vectorId: body.vectorId,
      resultCount: matches.length,
      processingTime
    })
    
    // 成功レスポンスの返却
    return c.json<SearchResponse, 200>({
      success: true,
      data: {
        matches,
        query: `Similar to ${body.vectorId}`,
        namespace: body.namespace,
        processingTime
      },
      message: matches.length > 0
        ? `${matches.length}件の類似ベクトルが見つかりました`
        : '0件の類似ベクトルが見つかりました'
    }, 200)
    
  } catch (error) {
    const processingTime = Date.now() - startTime
    
    logger.error('Similar search failed', error, { processingTime })
    
    // エラーレスポンスの生成
    const errorResponse = createErrorResponse(error, c)
    const statusCode = getStatusCode(error)
    
    return c.json<ErrorResponse, any>(errorResponse, statusCode)
  }
}