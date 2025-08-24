import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { NotionPageResponseSchema } from '../../../schemas/notion.schema'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import { NotionService } from '../../../services/notion.service'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// ページ取得ルート定義
export const retrieveNotionPageRoute = createRoute({
  method: 'get',
  path: '/notion/pages/{pageId}',
  request: {
    params: z.object({
      pageId: z.string().min(1)
    }),
    query: z.object({
      fromCache: z.string().optional().transform(val => val === 'true').default(false)
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: NotionPageResponseSchema
        }
      },
      description: 'ページ情報'
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: '認証エラー'
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'ページが見つかりません'
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
  summary: 'Notionページ取得',
  description: 'Notion APIまたはキャッシュからページ情報を取得します'
})

// ページ取得ハンドラー
export const retrieveNotionPageHandler: RouteHandler<typeof retrieveNotionPageRoute, EnvType> = async (c) => {
  try {
    const { pageId } = c.req.valid('param')
    const { fromCache } = c.req.valid('query')
    
    // Notion APIトークンを取得
    const notionToken = c.env.NOTION_API_KEY
    if (!notionToken) {
      return c.json<ErrorResponse, 401>({
        success: false,
        error: 'Unauthorized',
        message: 'Notion APIトークンが設定されていません'
      }, 401)
    }

    // NotionServiceを使用してページを取得
    const notionService = new NotionService(c.env, notionToken)
    
    // まずキャッシュから取得
    let page = await notionService.getPage(pageId)
    
    // キャッシュにない場合はNotion APIから取得
    if (!page && !fromCache) {
      const notionPage = await notionService.fetchPageFromNotion(pageId)
      if (notionPage) {
        await notionService.savePage(notionPage)
        page = await notionService.getPage(pageId)
      }
    }
    
    if (!page) {
      return c.json<ErrorResponse, 404>({
        success: false,
        error: 'Not Found',
        message: 'ページが見つかりません'
      }, 404)
    }

    // データベース形式の場合は変換
    if (page && !('object' in page)) {
      // キャッシュからの場合 - NotionPage型
      interface CachedPage {
        id: string
        createdTime: string
        lastEditedTime: string
        createdById: string
        lastEditedById: string
        cover: string | null
        icon: string | null
        parent: string
        archived: boolean
        inTrash: boolean
        properties: string
        url: string
        publicUrl: string | null
      }
      
      const cachedPage: CachedPage = page
      
      const objectType: 'page' = 'page'
      const userType: 'user' = 'user'
      
      const pageData = {
        object: objectType,
        id: cachedPage.id,
        created_time: cachedPage.createdTime,
        last_edited_time: cachedPage.lastEditedTime,
        created_by: { object: userType, id: cachedPage.createdById },
        last_edited_by: { object: userType, id: cachedPage.lastEditedById },
        cover: cachedPage.cover ? JSON.parse(cachedPage.cover) : null,
        icon: cachedPage.icon ? JSON.parse(cachedPage.icon) : null,
        parent: JSON.parse(cachedPage.parent),
        archived: cachedPage.archived,
        in_trash: cachedPage.inTrash,
        properties: JSON.parse(cachedPage.properties),
        url: cachedPage.url,
        public_url: cachedPage.publicUrl || undefined
      }
      
      return c.json({
        success: true,
        data: pageData
      }, 200)
    } else {
      // Notion APIから直接取得したページ
      const apiPage = await notionService.fetchPageFromNotion(pageId)
      if (!apiPage) {
        return c.json<ErrorResponse, 404>({
          success: false,
          error: 'Not Found',
          message: 'ページが見つかりません'
        }, 404)
      }
      
      return c.json({
        success: true,
        data: apiPage
      }, 200)
    }
  } catch (error) {
    console.error('Retrieve page error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'ページ取得中にエラーが発生しました'
    }, 500)
  }
}