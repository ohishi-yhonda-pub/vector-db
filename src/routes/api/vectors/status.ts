import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import { VectorJobSchema } from '../../../schemas/vector.schema'
import { VectorJobService } from './job-service'

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
    
    const jobService = new VectorJobService(c.env)
    const result = await jobService.getJobStatus(jobId)
    
    if (!result.success) {
      return c.json<ErrorResponse, 404>(result.error!, 404)
    }
    
    return c.json({
      success: true as const,
      data: result.data!
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
    total: z.number(),
    summary: z.object({
      total: z.number(),
      pending: z.number(),
      processing: z.number(),
      completed: z.number(),
      failed: z.number()
    }).optional()
  })
})

// クエリパラメータスキーマ
const JobsQuerySchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  sort: z.enum(['asc', 'desc']).default('desc'),
  includeSummary: z.string().default('false').transform(val => val === 'true')
})

// 全ジョブ一覧取得ルート定義
export const getAllJobsRoute = createRoute({
  method: 'get',
  path: '/vectors/jobs',
  request: {
    query: JobsQuerySchema
  },
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
    const { status, sort, includeSummary } = c.req.valid('query')
    
    const jobService = new VectorJobService(c.env)
    const { jobs, total } = await jobService.getAllJobs()
    
    // フィルタリング
    let filteredJobs = jobService.filterJobsByStatus(jobs, status)
    
    // ソート
    filteredJobs = jobService.sortJobsByDate(filteredJobs, sort)
    
    // レスポンスの構築
    const responseData: any = {
      jobs: filteredJobs,
      total: filteredJobs.length
    }
    
    // サマリを含む場合
    if (includeSummary) {
      responseData.summary = jobService.getJobsSummary(jobs)
    }
    
    return c.json({
      success: true as const,
      data: responseData
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