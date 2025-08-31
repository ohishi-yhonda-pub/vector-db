import { z } from '@hono/zod-openapi'
import { VectorJobSchema, type VectorJob } from '../../../schemas/vector.schema'
import type { ErrorResponse } from '../../../schemas/error.schema'

/**
 * VectorManager Durable Objectとの通信を抽象化
 */
export class VectorJobService {
  private vectorManager: any

  constructor(env: Env) {
    const vectorManagerId = env.VECTOR_CACHE.idFromName('default')
    this.vectorManager = env.VECTOR_CACHE.get(vectorManagerId)
  }

  /**
   * ジョブステータスを取得
   */
  async getJobStatus(jobId: string): Promise<{
    success: boolean
    data?: VectorJob
    error?: ErrorResponse
  }> {
    try {
      const job = await this.vectorManager.getJobStatus(jobId)
      
      if (!job) {
        return {
          success: false,
          error: {
            success: false,
            error: 'Not Found',
            message: `ジョブ ${jobId} が見つかりません`
          }
        }
      }
      
      // jobデータをVectorJobSchemaで検証
      const validatedJob = VectorJobSchema.parse(job)
      
      return {
        success: true,
        data: validatedJob
      }
    } catch (error) {
      console.error('Get job status error:', error)
      throw error
    }
  }

  /**
   * すべてのジョブを取得
   */
  async getAllJobs(): Promise<{
    jobs: VectorJob[]
    total: number
  }> {
    try {
      const jobs = await this.vectorManager.getAllJobs()
      
      // jobsデータをVectorJobSchemaの配列で検証
      const validatedJobs = z.array(VectorJobSchema).parse(jobs)
      
      return {
        jobs: validatedJobs,
        total: validatedJobs.length
      }
    } catch (error) {
      console.error('Get all jobs error:', error)
      throw error
    }
  }

  /**
   * ベクトルを削除
   */
  async deleteVector(vectorId: string): Promise<{
    jobId: string
    status: string
    workflowId?: string
  }> {
    try {
      const result = await this.vectorManager.deleteVectorsAsync([vectorId])
      return {
        jobId: result.jobId,
        status: result.status || 'processing',
        ...(result.workflowId && { workflowId: result.workflowId })
      }
    } catch (error) {
      console.error('Delete vector error:', error)
      throw error
    }
  }

  /**
   * ジョブをフィルタリング
   */
  filterJobsByStatus(jobs: VectorJob[], status?: string): VectorJob[] {
    if (!status) return jobs
    return jobs.filter(job => job.status === status)
  }

  /**
   * ジョブをソート
   */
  sortJobsByDate(jobs: VectorJob[], order: 'asc' | 'desc' = 'desc'): VectorJob[] {
    return [...jobs].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      return order === 'desc' ? dateB - dateA : dateA - dateB
    })
  }

  /**
   * ジョブステータスのサマリを取得
   */
  getJobsSummary(jobs: VectorJob[]): {
    total: number
    pending: number
    processing: number
    completed: number
    failed: number
  } {
    return {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length
    }
  }
}