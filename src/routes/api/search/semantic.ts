/**
 * セマンティック検索ルート（リファクタリング版）
 */

import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { SearchResponseSchema, type SearchResponse } from '../../../schemas/search.schema'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import { SemanticSearchQuerySchema, SemanticSearchBodySchema, normalizeSearchParams } from './search-validator'
import { SearchService } from './search-service'
import { AppError } from '../../../utils/error-handler'
import { createLogger } from '../../../middleware/logging'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// セマンティック検索ルート定義（GET版）
export const semanticSearchRoute = createRoute({
  method: 'get',
  path: '/search/semantic',
  request: {
    query: SemanticSearchQuerySchema
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
  const logger = createLogger('SemanticSearch', c.env)
  const startTime = Date.now()

  try {
    // クエリパラメータの取得と正規化
    const query = normalizeSearchParams(c.req.valid('query'))
    
    logger.info('Starting semantic search', {
      query: query.query.substring(0, 50),
      topK: query.topK,
      namespace: query.namespace
    })

    // 検索サービスの初期化
    const searchService = new SearchService(c.env)

    // セマンティック検索の実行（メタデータを含める）
    const matches = await searchService.searchByText(query.query, {
      topK: query.topK,
      namespace: query.namespace,
      includeMetadata: true,
      includeValues: false
    })

    const processingTime = Date.now() - startTime

    logger.info('Semantic search completed', {
      resultCount: matches.length,
      processingTime
    })

    // 成功レスポンスの返却
    return c.json<SearchResponse, 200>({
      success: true,
      data: {
        matches,
        query: query.query,
        namespace: query.namespace,
        processingTime
      },
      message: matches.length > 0
        ? `${matches.length}件の結果が見つかりました`
        : '0件の結果が見つかりました'
    }, 200)

  } catch (error) {
    const processingTime = Date.now() - startTime

    if (error instanceof AppError) {
      logger.error('Semantic search failed with AppError', error, {
        code: error.code,
        statusCode: error.statusCode,
        processingTime
      })

      return c.json<ErrorResponse, 400 | 500>({
        success: false,
        error: error.code,
        message: error.message
      }, error.statusCode as 400 | 500)
    }

    logger.error('Unexpected semantic search error', error, { processingTime })

    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : '検索中にエラーが発生しました'
    }, 500)
  }
}

// POST版セマンティック検索ルート定義（より詳細な設定が可能）
export const semanticSearchPostRoute = createRoute({
  method: 'post',
  path: '/search/semantic',
  request: {
    body: {
      content: {
        'application/json': {
          schema: SemanticSearchBodySchema
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
  summary: 'セマンティック検索（POST）',
  description: 'リクエストボディを使用した詳細セマンティック検索'
})

// POST版も同じハンドラーを使用（バリデーション方法が異なるだけ）
export const semanticSearchPostHandler: RouteHandler<typeof semanticSearchPostRoute, EnvType> = async (c) => {
  const logger = createLogger('SemanticSearchPost', c.env)
  const startTime = Date.now()

  try {
    // リクエストボディの取得と正規化
    const body = normalizeSearchParams(c.req.valid('json'))
    
    logger.info('Starting semantic search (POST)', {
      query: body.query.substring(0, 50),
      topK: body.topK,
      namespace: body.namespace
    })

    // 検索サービスの初期化
    const searchService = new SearchService(c.env)

    // セマンティック検索の実行
    const matches = await searchService.searchByText(body.query, {
      topK: body.topK,
      namespace: body.namespace,
      includeMetadata: true,
      includeValues: false
    })

    const processingTime = Date.now() - startTime

    logger.info('Semantic search (POST) completed', {
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

    if (error instanceof AppError) {
      logger.error('Semantic search (POST) failed with AppError', error, {
        code: error.code,
        statusCode: error.statusCode,
        processingTime
      })

      return c.json<ErrorResponse, 400 | 500>({
        success: false,
        error: error.code,
        message: error.message
      }, error.statusCode as 400 | 500)
    }

    logger.error('Unexpected semantic search (POST) error', error, { processingTime })

    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : '検索中にエラーが発生しました'
    }, 500)
  }
}