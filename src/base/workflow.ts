/**
 * Workflow基底クラス
 */

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers'
import { AppError, ErrorCodes, logError, getErrorMessage } from '../utils/error-handler'
import { retryWithBackoff, RetryConfig, RetryPresets } from '../utils/retry'
import { createLogger, Logger } from '../middleware/logging'

/**
 * ワークフローステータス
 */
export enum WorkflowStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * ワークフロー結果インターフェース
 */
export interface WorkflowResult<T = any> {
  success: boolean
  status: WorkflowStatus
  data?: T
  error?: string
  metadata?: Record<string, any>
  startedAt: string
  completedAt?: string
  duration?: number
}

/**
 * ステップ結果インターフェース
 */
export interface StepResult<T = any> {
  success: boolean
  data?: T
  error?: string
  retryCount?: number
}

/**
 * Workflow基底クラス
 */
export abstract class BaseWorkflow<TParams = any, TResult = any> extends WorkflowEntrypoint<Env, TParams> {
  protected logger: Logger
  protected startTime: number = 0
  protected metadata: Record<string, any> = {}

  constructor(ctx: any, env: Env) {
    super(ctx, env)
    this.logger = createLogger(this.constructor.name, env)
  }

  /**
   * ワークフロー実行
   */
  async run(event: WorkflowEvent<TParams>, step: WorkflowStep): Promise<WorkflowResult<TResult>> {
    this.startTime = Date.now()
    const startedAt = new Date().toISOString()

    try {
      this.logger.info('Workflow started', { 
        params: event.payload,
        timestamp: startedAt
      })

      // 実際のワークフロー実行（サブクラスで実装）
      const result = await this.execute(event.payload, step)

      const completedAt = new Date().toISOString()
      const duration = Date.now() - this.startTime

      this.logger.info('Workflow completed', {
        duration,
        result
      })

      return {
        success: true,
        status: WorkflowStatus.COMPLETED,
        data: result,
        metadata: this.metadata,
        startedAt,
        completedAt,
        duration
      }
    } catch (error) {
      const completedAt = new Date().toISOString()
      const duration = Date.now() - this.startTime
      const errorMessage = getErrorMessage(error)

      this.logger.error('Workflow failed', error, {
        duration,
        params: event.payload
      })

      return {
        success: false,
        status: WorkflowStatus.FAILED,
        error: errorMessage,
        metadata: this.metadata,
        startedAt,
        completedAt,
        duration
      }
    }
  }

  /**
   * 実際のワークフロー実行（サブクラスで実装）
   */
  protected abstract execute(params: TParams, step: WorkflowStep): Promise<TResult>

  /**
   * ステップ実行ヘルパー
   */
  protected async executeStep<T>(
    step: WorkflowStep,
    name: string,
    fn: () => Promise<T>,
    options?: {
      retry?: RetryConfig | boolean
      critical?: boolean
      timeout?: number
    }
  ): Promise<StepResult<T>> {
    const stepName = `${this.constructor.name}.${name}`

    try {
      this.logger.debug(`Step started: ${name}`)

      // リトライ設定
      const retryConfig = options?.retry === true 
        ? RetryPresets.standard 
        : options?.retry === false 
        ? undefined 
        : options?.retry

      // ステップ実行
      const result = await step.do(stepName, async () => {
        if (retryConfig) {
          return await retryWithBackoff(fn, {
            ...retryConfig,
            onRetry: (attempt, error, delay) => {
              this.logger.warn(`Step retry: ${name}`, {
                attempt,
                error: getErrorMessage(error),
                delay
              })
            }
          })
        }
        return await fn()
      }) as T

      this.logger.debug(`Step completed: ${name}`)

      return {
        success: true,
        data: result
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      
      this.logger.error(`Step failed: ${name}`, error)

      if (options?.critical !== false) {
        throw new AppError(
          ErrorCodes.WORKFLOW_ERROR,
          `Critical step failed: ${name} - ${errorMessage}`,
          500,
          error
        )
      }

      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * 並列ステップ実行
   */
  protected async executeParallelSteps<T>(
    step: WorkflowStep,
    tasks: Array<{
      name: string
      fn: () => Promise<T>
      critical?: boolean
    }>
  ): Promise<Array<StepResult<T>>> {
    this.logger.debug(`Executing ${tasks.length} parallel steps`)

    const promises = tasks.map(task => 
      this.executeStep(step, task.name, task.fn, { critical: task.critical })
    )

    const results = await Promise.all(promises)

    const failed = results.filter(r => !r.success)
    if (failed.length > 0) {
      this.logger.warn(`${failed.length} parallel steps failed`)
    }

    return results
  }

  /**
   * 条件付きステップ実行
   */
  protected async executeConditionalStep<T>(
    step: WorkflowStep,
    name: string,
    condition: () => boolean | Promise<boolean>,
    fn: () => Promise<T>
  ): Promise<StepResult<T> | null> {
    const shouldExecute = await condition()
    
    if (!shouldExecute) {
      this.logger.debug(`Step skipped (condition not met): ${name}`)
      return null
    }

    return await this.executeStep(step, name, fn)
  }

  /**
   * スリープステップ
   */
  protected async sleep(step: WorkflowStep, durationMs: number, reason?: string): Promise<void> {
    this.logger.debug(`Sleeping for ${durationMs}ms`, { reason })
    await step.sleep(durationMs.toString())
  }

  /**
   * 外部ワークフロー呼び出し
   */
  protected async callWorkflow<P, R>(
    step: WorkflowStep,
    workflow: any,
    params: P,
    name: string
  ): Promise<R> {
    return await step.do(`call_workflow_${name}`, async () => {
      const instance = await workflow.create({
        params
      })
      
      const status = await instance.status()
      
      if (status.status === 'complete') {
        return status.output as R
      }
      
      throw new AppError(
        ErrorCodes.WORKFLOW_ERROR,
        `Called workflow failed: ${name}`,
        500,
        status
      )
    }) as R
  }

  /**
   * メタデータ設定
   */
  protected setMetadata(key: string, value: any): void {
    this.metadata[key] = value
  }

  /**
   * メタデータ取得
   */
  protected getMetadata(key: string): any {
    return this.metadata[key]
  }

  /**
   * 進捗報告
   */
  protected reportProgress(current: number, total: number, message?: string): void {
    const percentage = Math.round((current / total) * 100)
    
    this.metadata.progress = {
      current,
      total,
      percentage,
      message
    }

    this.logger.info(`Progress: ${percentage}%`, {
      current,
      total,
      message
    })
  }

  /**
   * エラーハンドリングヘルパー
   */
  protected handleError(error: unknown, context: string): never {
    logError(error, undefined, {
      workflow: this.constructor.name,
      context
    })

    if (error instanceof AppError) {
      throw error
    }

    throw new AppError(
      ErrorCodes.WORKFLOW_ERROR,
      `Workflow error in ${context}: ${getErrorMessage(error)}`,
      500,
      error
    )
  }
}