/**
 * Notionページ取得ルート (リファクタリング版)
 * キャッシュとAPI取得の統一化
 */

import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { NotionPageResponseSchema } from '../../../schemas/notion.schema'
import { ErrorResponseSchema } from '../../../schemas/error.schema'
import { createSuccessResponse } from '../../../utils/response-builder'
import { unauthorizedResponse, notFoundResponse } from '../../../utils/response-builder-compat'
import { handleError } from '../../../utils/error-handler'
import { NotionOrchestrator } from '../../../services/notion-orchestrator'
import { PageFormatter } from './page-formatter'

type EnvType = {
  Bindings: Env
}

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

export const retrieveNotionPageHandler: RouteHandler<typeof retrieveNotionPageRoute, EnvType> = async (c) => {
  try {
    const { pageId } = c.req.valid('param')
    const { fromCache } = c.req.valid('query')
    
    const notionToken = c.env.NOTION_API_KEY
    if (!notionToken) {
      const response = unauthorizedResponse('Notion APIトークンが設定されていません')
      return new Response(response.body, {
        status: response.status,
        headers: response.headers
      })
    }

    const notionOrchestrator = new NotionOrchestrator(c.env, notionToken)
    const page = await notionOrchestrator.getPage(pageId, !fromCache)
    
    if (!page) {
      const response = notFoundResponse('ページが見つかりません')
      return new Response(response.body, {
        status: response.status,
        headers: response.headers
      })
    }

    // PageFormatterに渡すfromCacheは、データがDBから取得されたかどうかを示す
    // NotionOrchestratorは常にDBから取得したNotionPageを返すため、常にtrue
    const formattedPage = PageFormatter.formatPage(page, true)
    const response = createSuccessResponse(formattedPage)
    return c.json(response, 200)
    
  } catch (error) {
    return handleError(c, error, 'ページ取得中にエラーが発生しました')
  }
}