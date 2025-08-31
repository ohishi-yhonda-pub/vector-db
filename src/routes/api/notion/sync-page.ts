/**
 * Notionページ同期ルート (リファクタリング版)
 * ページとコンテンツの同期・ベクトル化
 */

import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { SyncNotionPageRequestSchema, NotionSyncResponseSchema } from '../../../schemas/notion.schema'
import { ErrorResponseSchema } from '../../../schemas/error.schema'
import { createSuccessResponse } from '../../../utils/response-builder'
import { unauthorizedResponse, acceptedResponse } from '../../../utils/response-builder-compat'
import { handleError } from '../../../utils/error-handler'
import { NotionOrchestrator } from '../../../services/notion-orchestrator'

type EnvType = {
  Bindings: Env
}

export const syncNotionPageRoute = createRoute({
  method: 'post',
  path: '/notion/pages/{pageId}/sync',
  request: {
    params: z.object({
      pageId: z.string().min(1)
    }),
    body: {
      content: {
        'application/json': {
          schema: SyncNotionPageRequestSchema.omit({ pageId: true })
        }
      }
    }
  },
  responses: {
    202: {
      content: {
        'application/json': {
          schema: NotionSyncResponseSchema
        }
      },
      description: '同期処理を開始しました'
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
  summary: 'Notionページ同期',
  description: 'Notionページとそのコンテンツを同期し、ベクトル化します'
})

export const syncNotionPageHandler: RouteHandler<typeof syncNotionPageRoute, EnvType> = async (c) => {
  try {
    const { pageId } = c.req.valid('param')
    const body = c.req.valid('json')
    
    const notionToken = c.env.NOTION_API_KEY
    if (!notionToken) {
      const response = unauthorizedResponse('Notion APIトークンが設定されていません')
      return new Response(response.body, {
        status: response.status,
        headers: response.headers
      })
    }

    const notionOrchestrator = new NotionOrchestrator(c.env, notionToken)
    const result = await notionOrchestrator.syncPage(pageId)

    const responseData = {
      ...result,
      message: 'ページの同期処理を開始しました'
    }
    const response = acceptedResponse(responseData)
    return new Response(response.body, {
      status: response.status,
      headers: response.headers
    })
    
  } catch (error) {
    return handleError(c, error, '同期処理の開始中にエラーが発生しました')
  }
}