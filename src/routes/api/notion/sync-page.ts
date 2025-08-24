import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { SyncNotionPageRequestSchema, NotionSyncResponseSchema } from '../../../schemas/notion.schema'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// ページ同期ルート定義
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

// ページ同期ハンドラー
export const syncNotionPageHandler: RouteHandler<typeof syncNotionPageRoute, EnvType> = async (c) => {
  try {
    const { pageId } = c.req.valid('param')
    const body = c.req.valid('json')
    
    // Notion APIトークンを取得
    const notionToken = c.env.NOTION_API_KEY
    if (!notionToken) {
      return c.json<ErrorResponse, 401>({
        success: false,
        error: 'Unauthorized',
        message: 'Notion APIトークンが設定されていません'
      }, 401)
    }

    // NotionManagerを使用して同期ジョブを作成
    const notionManagerId = c.env.NOTION_MANAGER.idFromName('global')
    const notionManager = c.env.NOTION_MANAGER.get(notionManagerId)
    
    const result = await notionManager.createSyncJob(pageId, {
      includeBlocks: body.includeBlocks,
      includeProperties: body.includeProperties,
      namespace: body.namespace
    })

    return c.json({
      success: true,
      data: {
        jobId: result.jobId,
        pageId,
        status: result.status,
        message: 'ページの同期処理を開始しました'
      }
    }, 202)
  } catch (error) {
    console.error('Sync page error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : '同期処理の開始中にエラーが発生しました'
    }, 500)
  }
}