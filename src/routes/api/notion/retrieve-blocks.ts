import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { NotionService } from '../../../services/notion.service'
import { NotionBlockListResponseSchema } from '../../../schemas/notion.schema'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// ブロック取得ルート定義
export const retrieveNotionBlocksRoute = createRoute({
  method: 'get',
  path: '/notion/pages/{pageId}/blocks',
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
          schema: NotionBlockListResponseSchema
        }
      },
      description: 'ブロック一覧'
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
  summary: 'Notionブロック取得',
  description: 'ページ内のブロックを取得します'
})

// ブロック取得ハンドラー
export const retrieveNotionBlocksHandler: RouteHandler<typeof retrieveNotionBlocksRoute, EnvType> = async (c) => {
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

    const notionService = new NotionService(c.env, notionToken)

    // キャッシュから取得
    if (fromCache) {
      const cachedBlocks = await notionService.getBlocks(pageId)
      if (cachedBlocks.length > 0) {
        const blocks = cachedBlocks.map(block => ({
          object: 'block' as const,
          id: block.id,
          parent: {
            type: block.parentType,
            page_id: block.parentType === 'page_id' ? block.parentId : undefined,
            block_id: block.parentType === 'block_id' ? block.parentId : undefined
          },
          created_time: block.createdTime,
          last_edited_time: block.lastEditedTime,
          created_by: { object: 'user' as const, id: block.createdById },
          last_edited_by: { object: 'user' as const, id: block.lastEditedById },
          has_children: block.hasChildren,
          archived: block.archived,
          in_trash: block.inTrash,
          type: block.type,
          ...JSON.parse(block.content)
        }))

        return c.json({
          success: true,
          data: {
            blocks,
            has_more: false,
            next_cursor: null
          }
        }, 200)
      }
    }

    // Notion APIから取得
    const blocks = await notionService.fetchBlocksFromNotion(pageId)
    
    if (blocks.length === 0) {
      return c.json({
        success: true,
        data: {
          blocks: [],
          has_more: false,
          next_cursor: null
        }
      }, 200)
    }

    // キャッシュに保存
    await notionService.saveBlocks(pageId, blocks)

    return c.json({
      success: true,
      data: {
        blocks,
        has_more: false,
        next_cursor: null
      }
    }, 200)
  } catch (error) {
    console.error('Retrieve blocks error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'ブロック取得中にエラーが発生しました'
    }, 500)
  }
}