import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import { VectorJobSchema, type VectorJob } from '../../../schemas/vector.schema'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// ジョブステータス取得のパラメータスキーマ
const JobStatusParamsSchema = z.object({
  jobId: z.string().describe('ジョブID')
})

// ジョブステータスレスポンススキーマ
const JobStatusResponseSchema = z.object({
  success: z.literal(true),
  data: VectorJobSchema
})

// ジョブステータス取得ルート定義
export const getJobStatusRoute = createRoute({
  method: 'get',
  path: '/vectors/jobs/{jobId}',
  request: {
    params: JobStatusParamsSchema
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: JobStatusResponseSchema
        }
      },
      description: 'ジョブステータス'
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'ジョブが見つかりません'
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
  summary: 'ジョブステータス取得',
  description: 'ベクトル作成・削除ジョブのステータスを取得します'
})

// ジョブステータス取得ハンドラー
export const getJobStatusHandler: RouteHandler<typeof getJobStatusRoute, EnvType> = async (c) => {
  try {
    const { jobId } = c.req.valid('param')
    
    // VectorManager Durable Objectを使用
    const vectorManagerId = c.env.VECTOR_CACHE.idFromName('default')
    const vectorManager = c.env.VECTOR_CACHE.get(vectorManagerId)
    
    // ジョブステータスを取得
    const job = await vectorManager.getJobStatus(jobId)
    
    if (!job) {
      return c.json<ErrorResponse, 404>({
        success: false,
        error: 'Not Found',
        message: `ジョブ ${jobId} が見つかりません`
      }, 404)
    }
    
    // jobデータをVectorJobSchemaで検証
    const validatedJob = VectorJobSchema.parse(job)
    
    return c.json({
      success: true as const,
      data: validatedJob
    }, 200)
  } catch (error) {
    console.error('Get job status error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'ジョブステータス取得中にエラーが発生しました'
    }, 500)
  }
}

// 全ジョブ一覧取得のレスポンススキーマ
const AllJobsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    jobs: z.array(VectorJobSchema),
    total: z.number()
  })
})

// 全ジョブ一覧取得ルート定義
export const getAllJobsRoute = createRoute({
  method: 'get',
  path: '/vectors/jobs',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: AllJobsResponseSchema
        }
      },
      description: 'ジョブ一覧'
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
  summary: 'ジョブ一覧取得',
  description: 'すべてのベクトル作成・削除ジョブの一覧を取得します'
})

// 全ジョブ一覧取得ハンドラー
export const getAllJobsHandler: RouteHandler<typeof getAllJobsRoute, EnvType> = async (c) => {
  try {
    // VectorManager Durable Objectを使用
    const vectorManagerId = c.env.VECTOR_CACHE.idFromName('default')
    const vectorManager = c.env.VECTOR_CACHE.get(vectorManagerId)
    
    // すべてのジョブを取得
    const jobs = await vectorManager.getAllJobs()
    
    // jobsデータをVectorJobSchemaの配列で検証
    const validatedJobs = z.array(VectorJobSchema).parse(jobs)
    
    return c.json({
      success: true as const,
      data: {
        jobs: validatedJobs,
        total: validatedJobs.length
      }
    }, 200)
  } catch (error) {
    console.error('Get all jobs error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'ジョブ一覧取得中にエラーが発生しました'
    }, 500)
  }
}