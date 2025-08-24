import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import type { NotionPage } from '../../../db/schema'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// バルク同期レスポンススキーマ
const NotionBulkSyncResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    totalPages: z.number(),
    syncJobs: z.array(z.object({
      pageId: z.string(),
      jobId: z.string(),
      status: z.string()
    })),
    message: z.string()
  }).optional(),
  message: z.string().optional()
})

// バルク同期ルート定義
export const bulkSyncNotionPagesRoute = createRoute({
  method: 'post',
  path: '/notion/pages/bulk-sync',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            includeBlocks: z.boolean().default(true),
            includeProperties: z.boolean().default(true),
            namespace: z.string().optional(),
            maxPages: z.number().min(1).max(100).default(50),
            filterArchived: z.boolean().default(false),
            pageIds: z.array(z.string()).optional() // 特定のページのみ同期する場合
          })
        }
      }
    }
  },
  responses: {
    202: {
      content: {
        'application/json': {
          schema: NotionBulkSyncResponseSchema
        }
      },
      description: 'バルク同期処理を開始しました'
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
  summary: 'Notionページバルク同期',
  description: '複数のNotionページを一括で同期・ベクトル化します'
})

// バルク同期ハンドラー
export const bulkSyncNotionPagesHandler: RouteHandler<typeof bulkSyncNotionPagesRoute, EnvType> = async (c) => {
  try {
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

    // NotionManagerを使用してバルク同期ジョブを作成
    const notionManagerId = c.env.NOTION_MANAGER.idFromName('global')
    const notionManager = c.env.NOTION_MANAGER.get(notionManagerId)
    
    let pagesToSync: string[] = []

    // 特定のページIDが指定されている場合
    if (body.pageIds && body.pageIds.length > 0) {
      pagesToSync = body.pageIds.slice(0, body.maxPages)
    } else {
      // NotionManagerを使用してページ一覧を取得
      const pages: Array<NotionPage | Record<string, unknown>> = await notionManager.listPages({
        fromCache: false,
        archived: body.filterArchived,
        limit: body.maxPages
      })
      
      pagesToSync = pages.map((page: NotionPage | Record<string, unknown>): string => {
        if ('createdTime' in page && typeof page.createdTime === 'string') {
          // NotionPage型
          const notionPage = page as NotionPage
          return notionPage.id
        } else {
          // Record<string, unknown>型
          return String(page.id)
        }
      })
    }

    const result = await notionManager.createBulkSyncJob(pagesToSync, {
      includeBlocks: body.includeBlocks,
      includeProperties: body.includeProperties,
      namespace: body.namespace,
      maxPages: body.maxPages
    })

    return c.json({
      success: true,
      data: {
        totalPages: pagesToSync.length,
        syncJobs: result.syncJobs,
        message: `${result.syncJobs.length}個のページの同期処理を開始しました`
      }
    }, 202)
  } catch (error) {
    console.error('Bulk sync error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'バルク同期処理の開始中にエラーが発生しました'
    }, 500)
  }
}