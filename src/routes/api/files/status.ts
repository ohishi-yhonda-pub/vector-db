import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { FileProcessingResultSchema } from '../../../schemas/file-upload.schema'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// ファイル処理状況確認ルート定義
export const fileStatusRoute = createRoute({
  method: 'get',
  path: '/files/status/{workflowId}',
  request: {
    params: z.object({
      workflowId: z.string().min(1)
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            data: z.object({
              workflowId: z.string(),
              status: z.enum(['running', 'completed', 'failed', 'unknown']),
              result: FileProcessingResultSchema.optional(),
              error: z.string().optional()
            })
          })
        }
      },
      description: '処理状況'
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'ワークフローが見つかりません'
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
  tags: ['Files'],
  summary: 'ファイル処理状況確認',
  description: 'アップロードされたファイルの処理状況を確認します'
})

// ファイル処理状況確認ハンドラー
export const fileStatusHandler: RouteHandler<typeof fileStatusRoute, EnvType> = async (c) => {
  try {
    const { workflowId } = c.req.valid('param')
    
    // VectorManagerからジョブ情報を取得
    const vectorManagerId = c.env.VECTOR_CACHE.idFromName('global')
    const vectorManager = c.env.VECTOR_CACHE.get(vectorManagerId)
    
    // ジョブ情報を取得
    const job = await vectorManager.getFileProcessingJob(workflowId)
    if (!job) {
      return c.json<ErrorResponse, 404>({
        success: false,
        error: 'Not Found',
        message: 'ジョブが見つかりません'
      }, 404)
    }
    
    // Workflowの状態を取得
    const status = await vectorManager.getFileProcessingWorkflowStatus(workflowId)
    
    // ステータスをマッピング
    let mappedStatus: 'running' | 'completed' | 'failed' | 'unknown'
    if (job.status === 'processing' || status.status === 'running') {
      mappedStatus = 'running'
    } else if (job.status === 'completed' || status.status === 'complete') {
      mappedStatus = 'completed'
    } else if (job.status === 'failed' || status.status === 'errored') {
      mappedStatus = 'failed'
    } else {
      mappedStatus = 'unknown'
    }
    
    return c.json({
      success: true,
      data: {
        workflowId,
        status: mappedStatus,
        result: status.output ? FileProcessingResultSchema.parse(status.output) : undefined,
        error: job.error || status.error || undefined
      }
    }, 200)
  } catch (error) {
    // Workflowが見つからない場合
    if (error instanceof Error && error.message.includes('not found')) {
      return c.json<ErrorResponse, 404>({
        success: false,
        error: 'Not Found',
        message: 'ワークフローが見つかりません'
      }, 404)
    }
    
    console.error('File status error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : '状況確認中にエラーが発生しました'
    }, 500)
  }
}