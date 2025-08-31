import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import { PageFormatter, type FormattedPage } from './page-formatter'
import type { NotionPage } from '../../../db/schema'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// ページ一覧レスポンススキーマ
const NotionPageListResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    pages: z.array(z.object({
      id: z.string(),
      title: z.string().optional(),
      url: z.string(),
      last_edited_time: z.string(),
      created_time: z.string(),
      archived: z.boolean(),
      parent: z.object({
        type: z.string(),
        database_id: z.string().optional(),
        page_id: z.string().optional(),
        workspace: z.boolean().optional()
      })
    })),
    has_more: z.boolean(),
    next_cursor: z.string().nullable()
  }).optional(),
  message: z.string().optional()
})

// クエリパラメータスキーマ
const QuerySchema = z.object({
  page_size: z.string().default('100').transform(val => parseInt(val)),
  filter_archived: z.string().default('false').transform(val => val === 'true'),
  from_cache: z.string().default('false').transform(val => val === 'true')
})

// ページ一覧取得ルート定義
export const listNotionPagesRoute = createRoute({
  method: 'get',
  path: '/notion/pages',
  request: {
    query: QuerySchema
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: NotionPageListResponseSchema
        }
      },
      description: 'ページ一覧'
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: '認証エラー'
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
  tags: ['Notion'],
  summary: 'Notionページ一覧取得',
  description: 'アクセス可能なすべてのNotionページを取得します'
})

// NotionManagerとの通信を抽象化
class NotionPageService {
  static async getPages(
    env: Env,
    options: {
      fromCache: boolean
      archived: boolean
      limit: number
    }
  ): Promise<Array<NotionPage | Record<string, unknown>>> {
    const notionManagerId = env.NOTION_MANAGER.idFromName('global')
    const notionManager = env.NOTION_MANAGER.get(notionManagerId)
    
    return await notionManager.listPages({
      fromCache: options.fromCache,
      archived: options.archived,
      limit: options.limit
    })
  }

  static validateToken(token: string | undefined): { valid: boolean; error?: ErrorResponse } {
    if (!token) {
      return {
        valid: false,
        error: {
          success: false,
          error: 'Unauthorized',
          message: 'Notion APIトークンが設定されていません'
        }
      }
    }
    return { valid: true }
  }
}

// ページ一覧取得ハンドラー
export const listNotionPagesHandler: RouteHandler<typeof listNotionPagesRoute, EnvType> = async (c) => {
  try {
    const { page_size, filter_archived, from_cache } = c.req.valid('query')
    
    // Notion APIトークンの検証
    const tokenValidation = NotionPageService.validateToken(c.env.NOTION_API_KEY)
    if (!tokenValidation.valid) {
      return c.json<ErrorResponse, 401>(tokenValidation.error!, 401)
    }

    // ページ一覧を取得
    const pages = await NotionPageService.getPages(c.env, {
      fromCache: from_cache,
      archived: filter_archived,
      limit: page_size
    })

    // ページをフォーマット
    const formattedPages = PageFormatter.formatPages(pages, from_cache)

    // has_moreフラグの設定
    const hasMore = !from_cache && pages.length >= page_size
    
    return c.json({
      success: true,
      data: {
        pages: formattedPages,
        has_more: hasMore,
        next_cursor: null
      }
    }, 200)
  } catch (error) {
    console.error('List pages error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'ページ一覧取得中にエラーが発生しました'
    }, 500)
  }
}