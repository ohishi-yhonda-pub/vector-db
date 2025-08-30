import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// 一括削除レスポンスのスキーマ
const BulkDeleteResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    requested: z.number(),
    deleted: z.number(),
    failed: z.number(),
    errors: z.array(z.string()).optional()
  }).optional(),
  message: z.string()
})

type BulkDeleteResponse = z.infer<typeof BulkDeleteResponseSchema>

// 一括削除リクエストのスキーマ
const BulkDeleteRequestSchema = z.object({
  ids: z.array(z.string()).min(1).max(1000).openapi({
    description: '削除するベクトルIDの配列（最大1000件）',
    example: ['vec_123', 'vec_456', 'vec_789']
  })
})

// ベクトル一括削除ルート定義
export const bulkDeleteVectorsRoute = createRoute({
  method: 'post',
  path: '/vectors/bulk-delete',
  request: {
    body: {
      content: {
        'application/json': {
          schema: BulkDeleteRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: BulkDeleteResponseSchema
        }
      },
      description: 'ベクトルが削除されました'
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
  tags: ['Vectors'],
  summary: 'ベクトルの一括削除',
  description: '指定されたIDリストのベクトルを一括削除します'
})

// ベクトル一括削除ハンドラー
export const bulkDeleteVectorsHandler: RouteHandler<typeof bulkDeleteVectorsRoute, EnvType> = async (c) => {
  try {
    const { ids } = await c.req.json()
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return c.json<ErrorResponse, 400>({
        success: false,
        error: 'Bad Request',
        message: 'IDリストが指定されていません'
      }, 400)
    }

    if (ids.length > 1000) {
      return c.json<ErrorResponse, 400>({
        success: false,
        error: 'Bad Request',
        message: 'IDは最大1000件まで指定できます'
      }, 400)
    }
    
    console.log(`[bulk-delete] Deleting ${ids.length} vectors`)
    
    // Vectorizeから直接削除
    let deletedCount = 0
    let failedCount = 0
    const errors: string[] = []
    
    // バッチで削除（100件ずつ）
    const batchSize = 100
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, Math.min(i + batchSize, ids.length))
      
      try {
        await c.env.VECTORIZE_INDEX.deleteByIds(batch)
        // deleteByIdsは成功時にvoidまたはmutation情報を返す
        deletedCount += batch.length
        console.log(`[bulk-delete] Batch ${Math.floor(i / batchSize) + 1}: Delete operation enqueued for ${batch.length} vectors`)
      } catch (error) {
        console.error(`[bulk-delete] Batch ${Math.floor(i / batchSize) + 1} failed:`, error)
        failedCount += batch.length
        errors.push(`Failed to delete batch starting at index ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
    
    // VectorManagerの状態も更新（削除されたIDを除外）
    try {
      const vectorManagerId = c.env.VECTOR_CACHE.idFromName('global')
      const vectorManager = c.env.VECTOR_CACHE.get(vectorManagerId)
      await vectorManager.removeDeletedVectors(ids)
    } catch (error) {
      console.error('[bulk-delete] Failed to update VectorManager state:', error)
      // エラーがあってもVectorizeからの削除は成功としてカウント
    }
    
    return c.json<BulkDeleteResponse, 200>({
      success: failedCount === 0,
      data: {
        requested: ids.length,
        deleted: deletedCount,
        failed: failedCount,
        errors: errors.length > 0 ? errors : undefined
      },
      message: `${deletedCount}件のベクトルを削除しました${failedCount > 0 ? `（${failedCount}件失敗）` : ''}`
    }, 200)
    
  } catch (error) {
    console.error('Bulk delete vectors error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : '一括削除中にエラーが発生しました'
    }, 500)
  }
}