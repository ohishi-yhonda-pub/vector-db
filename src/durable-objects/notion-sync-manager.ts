/**
 * Notion同期管理
 * 同期ジョブの管理とステート管理
 */

import { BaseJobManager, Job, JobStatus } from '../base/job-manager'
import type { NotionPage } from '../db/schema'
import { AppError, ErrorCodes } from '../utils/error-handler'

export type JobType = 'sync_page' | 'bulk_sync' | 'sync_blocks' | 'sync_properties'

export interface SyncJobData {
  pageId?: string
  databaseId?: string
  jobType: JobType
  includeBlocks?: boolean
  includeProperties?: boolean
  namespace?: string
  query?: string
  limit?: number
  startCursor?: string
}

export interface SyncJobResult {
  success: boolean
  vectorsCreated?: number
  blocksProcessed?: number
  propertiesProcessed?: number
  pagesProcessed?: number
  error?: string
  nextCursor?: string
  hasMore?: boolean
}

export interface SyncProgress {
  currentStep: string
  totalSteps: number
  completedSteps: number
  percentComplete: number
}

export interface SyncStatistics {
  totalPages: number
  totalSyncJobs: number
  completedJobs: number
  failedJobs: number
  totalVectorsCreated: number
  lastSyncAt?: string
  averageProcessingTime?: number
}

/**
 * Notion同期マネージャー
 * 同期ジョブの管理と実行を担当
 */
export class NotionSyncManager extends BaseJobManager<SyncJobData, SyncJobResult> {
  private stats: SyncStatistics = {
    totalPages: 0,
    totalSyncJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    totalVectorsCreated: 0
  }

  protected jobTypePrefix = 'notion_sync'
  protected maxConcurrentJobs = 5
  protected defaultRetryLimit = 3

  constructor(context: string = 'NotionSync', env?: Env) {
    super(context, env)
  }

  /**
   * ジョブプロセッサーを登録
   */
  protected registerProcessors(): void {
    // プロセッサーは親クラスでオーバーライドされるため、ここでは空実装
  }

  /**
   * 同期ジョブを作成
   */
  async createSyncJob(
    data: SyncJobData,
    priority: number = 5
  ): Promise<string> {
    // ジョブタイプの検証
    if (!this.isValidJobType(data.jobType)) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        `Invalid job type: ${data.jobType}`,
        400
      )
    }

    // 同じページの実行中ジョブをチェック
    if (data.pageId) {
      const existingJob = this.findRunningJobForPage(data.pageId)
      if (existingJob) {
        throw new AppError(
          ErrorCodes.CONFLICT,
          `Sync job already running for page ${data.pageId}`,
          409,
          { existingJobId: existingJob.id }
        )
      }
    }

    return this.createJob({
      type: data.jobType,
      params: data,
      priority
    }).then(job => job.id)
  }

  /**
   * ジョブタイプが有効かチェック
   */
  private isValidJobType(jobType: string): jobType is JobType {
    return ['sync_page', 'bulk_sync', 'sync_blocks', 'sync_properties'].includes(jobType)
  }

  /**
   * 特定ページの実行中ジョブを検索
   */
  private findRunningJobForPage(pageId: string): Job<SyncJobData, SyncJobResult> | undefined {
    return Array.from(this.jobs.values()).find(
      job => 
        job.params?.pageId === pageId && 
        (job.status === JobStatus.PENDING || job.status === JobStatus.PROCESSING)
    )
  }

  /**
   * バルク同期ジョブを作成
   */
  async createBulkSyncJob(
    databaseId: string,
    options?: {
      includeBlocks?: boolean
      includeProperties?: boolean
      namespace?: string
      limit?: number
    }
  ): Promise<string> {
    return this.createSyncJob({
      databaseId,
      jobType: 'bulk_sync',
      ...options
    }, 10) // バルク同期は高優先度
  }

  /**
   * ジョブの進捗を更新
   */
  updateJobProgress(
    jobId: string,
    progress: Partial<SyncProgress>
  ): void {
    const job = this.jobs.get(jobId)
    if (!job) {
      throw new AppError(
        ErrorCodes.NOT_FOUND,
        `Job not found: ${jobId}`,
        404
      )
    }

    const currentProgress = job.progress || {
      currentStep: '',
      totalSteps: 0,
      completedSteps: 0,
      percentComplete: 0
    }

    job.progress = {
      ...currentProgress,
      ...progress,
      percentComplete: progress.totalSteps 
        ? Math.round((progress.completedSteps || 0) / progress.totalSteps * 100)
        : currentProgress.percentComplete
    }
  }

  /**
   * ジョブ実行（実際の処理は親クラスで実装）
   */
  protected async processJob(
    job: Job<SyncJobData, SyncJobResult>
  ): Promise<SyncJobResult> {
    // この実装は親クラス（NotionManager）でオーバーライドされる
    throw new AppError(
      ErrorCodes.NOT_IMPLEMENTED,
      'Job processing must be implemented by parent class',
      500
    )
  }

  /**
   * 統計情報を更新
   */
  updateStatistics(result: SyncJobResult): void {
    this.stats.totalSyncJobs++
    
    if (result.success) {
      this.stats.completedJobs++
      this.stats.totalVectorsCreated += result.vectorsCreated || 0
      this.stats.totalPages += result.pagesProcessed || 0
      this.stats.lastSyncAt = new Date().toISOString()
    } else {
      this.stats.failedJobs++
    }

    // 平均処理時間を計算
    const completedJobs = Array.from(this.jobs.values()).filter(
      job => job.status === JobStatus.COMPLETED
    )
    
    if (completedJobs.length > 0) {
      const totalTime = completedJobs.reduce((sum, job) => {
        const start = new Date(job.createdAt).getTime()
        const end = job.completedAt ? new Date(job.completedAt).getTime() : start
        return sum + (end - start)
      }, 0)
      
      this.stats.averageProcessingTime = Math.round(totalTime / completedJobs.length)
    }
  }

  /**
   * 統計情報を取得
   */
  getStatistics(): SyncStatistics {
    return { ...this.stats }
  }

  /**
   * 古いジョブをクリーンアップ
   */
  async cleanupOldJobs(daysOld: number = 7): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)
    
    const jobsToDelete: string[] = []
    
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status !== JobStatus.COMPLETED && job.status !== JobStatus.FAILED) {
        continue
      }
      
      const jobDate = new Date(job.completedAt || job.createdAt)
      if (jobDate < cutoffDate) {
        jobsToDelete.push(jobId)
      }
    }

    jobsToDelete.forEach(jobId => {
      this.jobs.delete(jobId)
    })

    return jobsToDelete.length
  }

  /**
   * 特定のページに関連するジョブを取得
   */
  getJobsForPage(pageId: string): Job<SyncJobData, SyncJobResult>[] {
    return Array.from(this.jobs.values()).filter(
      job => job.params?.pageId === pageId
    )
  }

  /**
   * アクティブなジョブ数を取得
   */
  getActiveJobCount(): number {
    return Array.from(this.jobs.values()).filter(
      job => job.status === JobStatus.PENDING || job.status === JobStatus.PROCESSING
    ).length
  }
}