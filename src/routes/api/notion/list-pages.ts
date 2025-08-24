import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
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

// ページ一覧取得ルート定義
export const listNotionPagesRoute = createRoute({
  method: 'get',
  path: '/notion/pages',
  request: {
    query: z.object({
      page_size: z.string().default('100').transform(val => parseInt(val)),
      filter_archived: z.string().default('false').transform(val => val === 'true'),
      from_cache: z.string().default('false').transform(val => val === 'true')
    })
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

// ページ一覧取得ハンドラー
export const listNotionPagesHandler: RouteHandler<typeof listNotionPagesRoute, EnvType> = async (c) => {
  try {
    const { page_size, filter_archived, from_cache } = c.req.valid('query')
    
    // Notion APIトークンを取得
    const notionToken = c.env.NOTION_API_KEY
    if (!notionToken) {
      return c.json<ErrorResponse, 401>({
        success: false,
        error: 'Unauthorized',
        message: 'Notion APIトークンが設定されていません'
      }, 401)
    }

    // NotionManagerを使用してページ一覧を取得
    const notionManagerId = c.env.NOTION_MANAGER.idFromName('global')
    const notionManager = c.env.NOTION_MANAGER.get(notionManagerId)
    
    const pages: Array<NotionPage | Record<string, unknown>> = await notionManager.listPages({
      fromCache: from_cache,
      archived: filter_archived,
      limit: page_size
    })

    interface FormattedPage {
      id: string
      title: string
      url: string
      last_edited_time: string
      created_time: string
      archived: boolean
      parent: {
        type: string
        database_id?: string
        page_id?: string
        workspace?: boolean
      }
    }

    const formattedPages: FormattedPage[] = pages.map((page: NotionPage | Record<string, unknown>) => {
      if (from_cache && 'createdTime' in page) {
        // キャッシュからの場合はデータベース形式 (NotionPage型)
        const cachedPage = page as NotionPage
        const parent = typeof cachedPage.parent === 'string' ? JSON.parse(cachedPage.parent) : cachedPage.parent
        const properties = typeof cachedPage.properties === 'string' ? JSON.parse(cachedPage.properties) : cachedPage.properties
        
        // タイトルをプロパティから抽出
        let title = 'Untitled'
        if (properties && properties.title && properties.title.title && Array.isArray(properties.title.title) && properties.title.title.length > 0) {
          title = properties.title.title.map((t: any) => t.plain_text || '').join('')
        }
        
        return {
          id: cachedPage.id,
          title,
          url: cachedPage.url,
          last_edited_time: cachedPage.lastEditedTime,
          created_time: cachedPage.createdTime,
          archived: cachedPage.archived,
          parent: {
            type: parent.type,
            database_id: parent.database_id,
            page_id: parent.page_id,
            workspace: parent.workspace
          }
        }
      } else {
        // Notion APIからの場合 (Record<string, unknown>型)
        const apiPage = page as Record<string, unknown>
        const pageParent = apiPage.parent as Record<string, unknown>
        const pageProperties = apiPage.properties as Record<string, any>
        
        // タイトルをプロパティから抽出
        let title = 'Untitled'
        if (pageProperties && pageProperties.title && pageProperties.title.title && Array.isArray(pageProperties.title.title) && pageProperties.title.title.length > 0) {
          title = pageProperties.title.title.map((t: any) => t.plain_text || '').join('')
        }
        
        return {
          id: String(apiPage.id),
          title,
          url: String(apiPage.url),
          last_edited_time: String(apiPage.last_edited_time),
          created_time: String(apiPage.created_time),
          archived: Boolean(apiPage.archived),
          parent: {
            type: String(pageParent?.type || ''),
            database_id: pageParent?.database_id ? String(pageParent.database_id) : undefined,
            page_id: pageParent?.page_id ? String(pageParent.page_id) : undefined,
            workspace: pageParent?.workspace !== undefined ? Boolean(pageParent.workspace) : undefined
          }
        }
      }
    })

    let hasMore = false
    if (!from_cache) {
      hasMore = pages.length >= page_size
    }
    
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