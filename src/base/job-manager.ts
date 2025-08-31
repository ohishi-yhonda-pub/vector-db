/**
 * ジョブ管理基底クラス
 */

import { AppError, ErrorCodes, getErrorMessage } from '../utils/error-handler'
import { createLogger, Logger } from '../middleware/logging'

/**
 * ジョブステータス
 */
export enum JobStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  RETRYING = 'retrying'
}

/**
 * ジョブ優先度
 */
export enum JobPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

/**
 * ジョブインターフェース
 */
export interface Job<T = any, R = any> {
  id: string
  type: string
  status: JobStatus
  priority: JobPriority
  params: T
  result?: R
  error?: string
  retryCount: number
  maxRetries: number
  createdAt: string
  startedAt?: string
  completedAt?: string
  metadata?: Record<string, any>
}

/**
 * ジョブ作成オプション
 */
export interface CreateJobOptions<T = any> {
  type: string
  params: T
  priority?: JobPriority
  maxRetries?: number
  metadata?: Record<string, any>
}

/**
 * ジョブ実行結果
 */
export interface JobExecutionResult<R = any> {
  success: boolean
  result?: R
  error?: string
  duration?: number
}

/**
 * ジョブプロセッサー関数型
 */
export type JobProcessor<T = any, R = any> = (job: Job<T, R>) => Promise<R>

/**
 * ジョブ管理基底クラス
 */
export abstract class BaseJobManager<T = any, R = any> {
  protected jobs: Map<string, Job<T, R>> = new Map()
  protected queue: string[] = []
  protected processing: Set<string> = new Set()
  protected processors: Map<string, JobProcessor<T, R>> = new Map()
  protected logger: Logger
  protected isProcessing: boolean = false
  protected maxConcurrent: number = 5
  protected pollInterval: number = 1000

  constructor(
    protected readonly context: string,
    env?: Env
  ) {
    this.logger = createLogger(`JobManager:${context}`, env)
    this.registerProcessors()
  }

  /**
   * ジョブプロセッサーを登録（サブクラスで実装）
   */
  protected abstract registerProcessors(): void

  /**
   * ジョブを作成
   */
  async createJob(options: CreateJobOptions<T>): Promise<Job<T, R>> {
    const job: Job<T, R> = {
      id: this.generateJobId(),
      type: options.type,
      status: JobStatus.PENDING,
      priority: options.priority || JobPriority.NORMAL,
      params: options.params,
      retryCount: 0,
      maxRetries: options.maxRetries || 3,
      createdAt: new Date().toISOString(),
      metadata: options.metadata
    }

    this.jobs.set(job.id, job)
    this.enqueueJob(job)

    this.logger.info('Job created', {
      jobId: job.id,
      type: job.type,
      priority: JobPriority[job.priority]
    })

    // 処理開始
    this.startProcessing()

    return job
  }

  /**
   * ジョブをキューに追加
   */
  protected enqueueJob(job: Job<T, R>): void {
    // 優先度順にキューに追加
    const index = this.queue.findIndex(id => {
      const queuedJob = this.jobs.get(id)
      return queuedJob && queuedJob.priority < job.priority
    })

    if (index === -1) {
      this.queue.push(job.id)
    } else {
      this.queue.splice(index, 0, job.id)
    }

    job.status = JobStatus.QUEUED
  }

  /**
   * ジョブ処理を開始
   */
  protected async startProcessing(): Promise<void> {
    if (this.isProcessing) return

    this.isProcessing = true
    this.logger.debug('Job processing started')

    while (this.queue.length > 0 || this.processing.size > 0) {
      // 同時実行数の制限内で新しいジョブを開始
      while (this.processing.size < this.maxConcurrent && this.queue.length > 0) {
        const jobId = this.queue.shift()
        if (jobId) {
          this.processJob(jobId).catch(error => {
            this.logger.error(`Job processing error: ${jobId}`, error)
          })
        }
      }

      // 少し待機
      await new Promise(resolve => setTimeout(resolve, this.pollInterval))
    }

    this.isProcessing = false
    this.logger.debug('Job processing stopped')
  }

  /**
   * 個別ジョブを処理
   */
  protected async processJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) {
      this.logger.warn(`Job not found: ${jobId}`)
      return
    }

    this.processing.add(jobId)
    job.status = JobStatus.PROCESSING
    job.startedAt = new Date().toISOString()

    this.logger.info(`Processing job: ${jobId}`, {
      type: job.type,
      retryCount: job.retryCount
    })

    try {
      const processor = this.processors.get(job.type)
      if (!processor) {
        throw new AppError(
          ErrorCodes.INTERNAL_ERROR,
          `No processor registered for job type: ${job.type}`,
          500
        )
      }

      const startTime = Date.now()
      const result = await processor(job)
      const duration = Date.now() - startTime

      job.status = JobStatus.COMPLETED
      job.result = result
      job.completedAt = new Date().toISOString()

      this.logger.info(`Job completed: ${jobId}`, {
        duration,
        type: job.type
      })

      // 完了後のフック
      await this.onJobCompleted(job)
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      
      this.logger.error(`Job failed: ${jobId}`, error, {
        type: job.type,
        retryCount: job.retryCount
      })

      if (job.retryCount < job.maxRetries) {
        // リトライ
        job.retryCount++
        job.status = JobStatus.RETRYING
        job.error = errorMessage

        this.logger.info(`Retrying job: ${jobId}`, {
          attempt: job.retryCount,
          maxRetries: job.maxRetries
        })

        // 指数バックオフでリトライをキューに戻す
        const delay = Math.min(1000 * Math.pow(2, job.retryCount), 30000)
        setTimeout(() => {
          this.enqueueJob(job)
        }, delay)
      } else {
        // 最終的に失敗
        job.status = JobStatus.FAILED
        job.error = errorMessage
        job.completedAt = new Date().toISOString()

        // 失敗後のフック
        await this.onJobFailed(job, error)
      }
    } finally {
      this.processing.delete(jobId)
    }
  }

  /**
   * ジョブ完了後のフック（サブクラスでオーバーライド可能）
   */
  protected async onJobCompleted(job: Job<T, R>): Promise<void> {
    // サブクラスで実装
  }

  /**
   * ジョブ失敗後のフック（サブクラスでオーバーライド可能）
   */
  protected async onJobFailed(job: Job<T, R>, error: unknown): Promise<void> {
    // サブクラスで実装
  }

  /**
   * ジョブステータスを取得
   */
  getJob(jobId: string): Job<T, R> | undefined {
    return this.jobs.get(jobId)
  }

  /**
   * すべてのジョブを取得
   */
  getAllJobs(): Job<T, R>[] {
    return Array.from(this.jobs.values())
  }

  /**
   * ステータス別にジョブを取得
   */
  getJobsByStatus(status: JobStatus): Job<T, R>[] {
    return this.getAllJobs().filter(job => job.status === status)
  }

  /**
   * タイプ別にジョブを取得
   */
  getJobsByType(type: string): Job<T, R>[] {
    return this.getAllJobs().filter(job => job.type === type)
  }

  /**
   * ジョブがキャンセル可能かどうかを判定
   */
  protected canCancelJob(job: Job<T, R>): boolean {
    // 完了済み、処理中、またはキャンセル済みのジョブはキャンセルできない
    // PENDING, QUEUED, RETRYINGはキャンセル可能
    return !(
      job.status === JobStatus.PROCESSING || 
      job.status === JobStatus.COMPLETED ||
      job.status === JobStatus.FAILED ||
      job.status === JobStatus.CANCELLED
    )
  }

  /**
   * ジョブのキャンセル処理を実行
   */
  protected performCancelJob(job: Job<T, R>, jobId: string): void {
    // キューから削除
    const queueIndex = this.queue.indexOf(jobId)
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1)
    }

    job.status = JobStatus.CANCELLED
    job.completedAt = new Date().toISOString()
  }

  /**
   * ジョブをキャンセル
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId)
    if (!job) return false

    if (!this.canCancelJob(job)) {
      this.logger.warn(`Cannot cancel job with status ${job.status}: ${jobId}`)
      return false
    }

    this.performCancelJob(job, jobId)
    this.logger.info(`Job cancelled: ${jobId}`)
    return true
  }

  /**
   * すべてのジョブをクリア
   */
  clearJobs(onlyCompleted: boolean = false): number {
    let cleared = 0

    if (onlyCompleted) {
      const completed = [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]
      for (const [id, job] of this.jobs.entries()) {
        if (completed.includes(job.status)) {
          this.jobs.delete(id)
          cleared++
        }
      }
    } else {
      cleared = this.jobs.size
      this.jobs.clear()
      this.queue = []
    }

    this.logger.info(`Cleared ${cleared} jobs`, { onlyCompleted })
    return cleared
  }

  /**
   * ジョブIDを生成
   */
  protected generateJobId(): string {
    return `job_${this.context}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 統計情報を取得
   */
  getStatistics(): Record<string, number> {
    const stats: Record<string, number> = {
      total: this.jobs.size,
      queued: this.queue.length,
      processing: this.processing.size
    }

    // ステータス別カウント
    for (const status of Object.values(JobStatus)) {
      stats[status] = this.getJobsByStatus(status as JobStatus).length
    }

    return stats
  }

  /**
   * プロセッサーを登録
   */
  protected registerProcessor(type: string, processor: JobProcessor<T, R>): void {
    this.processors.set(type, processor)
    this.logger.debug(`Processor registered: ${type}`)
  }

  /**
   * 設定を更新
   */
  updateConfig(config: {
    maxConcurrent?: number
    pollInterval?: number
  }): void {
    if (config.maxConcurrent !== undefined) {
      this.maxConcurrent = config.maxConcurrent
    }
    if (config.pollInterval !== undefined) {
      this.pollInterval = config.pollInterval
    }

    this.logger.info('Config updated', config)
  }
}