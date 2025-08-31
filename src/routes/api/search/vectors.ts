/**
 * ベクトル検索ルート（リファクタリング版）
 */

import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { SearchResponseSchema, type SearchResponse } from '../../../schemas/search.schema'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import { TextSearchParamsSchema, normalizeSearchParams } from './search-validator'
import { SearchService } from './search-service'
import { AppError, createErrorResponse, getStatusCode } from '../../../utils/error-handler'
import { createLogger } from '../../../middleware/logging'

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
          schema: TextSearchParamsSchema
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
  const logger = createLogger('SearchVectors', c.env)
  const startTime = Date.now()
  
  try {
    // リクエストパラメータの取得と正規化
    const body = normalizeSearchParams(c.req.valid('json'))
    
    logger.info('Starting vector search', {
      query: body.query.substring(0, 50),
      topK: body.topK,
      namespace: body.namespace
    })
    
    // 検索サービスの初期化
    const searchService = new SearchService(c.env)
    
    // テキスト検索の実行
    const matches = await searchService.searchByText(body.query, {
      topK: body.topK,
      namespace: body.namespace,
      filter: body.filter,
      includeMetadata: body.includeMetadata,
      includeValues: body.includeValues
    })
    
    const processingTime = Date.now() - startTime
    
    logger.info('Search completed', {
      resultCount: matches.length,
      processingTime
    })
    
    // 成功レスポンスの返却
    return c.json<SearchResponse, 200>({
      success: true,
      data: {
        matches,
        query: body.query,
        namespace: body.namespace,
        processingTime
      },
      message: matches.length > 0 
        ? `${matches.length}件の結果が見つかりました` 
        : '0件の結果が見つかりました'
    }, 200)
    
  } catch (error) {
    const processingTime = Date.now() - startTime
    
    logger.error('Search failed', error, { processingTime })
    
    // エラーレスポンスの生成
    const errorResponse = createErrorResponse(error, c)
    const statusCode = getStatusCode(error)
    
    return c.json<ErrorResponse, any>(errorResponse, statusCode)
  }
}