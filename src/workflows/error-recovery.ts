/**
 * Notion同期エラーリカバリー
 * エラー処理、リトライ、フォールバック機能
 */

import { WorkflowStep } from 'cloudflare:workers'
import { AppError, ErrorCodes } from '../utils/error-handler'

export type RecoveryAction = 'retry' | 'skip' | 'abort' | 'fallback'

export interface ErrorInfo {
  type: string
  message: string
  stepName: string
  timestamp: string
  retryCount: number
  recoverable: boolean
}

export interface RecoveryStrategy {
  maxRetries: number
  retryDelayMs: number
  fallbackEnabled: boolean
  skipOnError: boolean
}

/**
 * エラーリカバリーマネージャー
 * Workflowでのエラー処理とリトライ戦略を管理
 */
export class ErrorRecoveryManager {
  private errors: ErrorInfo[] = []
  private strategy: RecoveryStrategy

  constructor(strategy: Partial<RecoveryStrategy> = {}) {
    this.strategy = {
      maxRetries: 3,
      retryDelayMs: 1000,
      fallbackEnabled: true,
      skipOnError: false,
      ...strategy
    }
  }

  /**
   * エラーを記録
   */
  recordError(error: any, stepName: string, retryCount: number = 0): ErrorInfo {
    const errorInfo: ErrorInfo = {
      type: error instanceof AppError ? error.code : 'UNKNOWN_ERROR',
      message: error.message || 'Unknown error occurred',
      stepName,
      timestamp: new Date().toISOString(),
      retryCount,
      recoverable: this.isRecoverable(error)
    }

    this.errors.push(errorInfo)
    console.warn(`[ErrorRecovery] Error recorded:`, errorInfo)
    
    return errorInfo
  }

  /**
   * エラーがリカバリー可能かチェック
   */
  isRecoverable(error: any): boolean {
    if (error instanceof AppError) {
      // 一時的なエラーはリカバリー可能
      const recoverableCodes = [
        ErrorCodes.TIMEOUT,
        ErrorCodes.SERVICE_UNAVAILABLE,
        ErrorCodes.EXTERNAL_SERVICE_ERROR,
        ErrorCodes.NOTION_API_ERROR
      ]
      return recoverableCodes.includes(error.code as any)
    }

    // ネットワークエラーやタイムアウトはリカバリー可能
    const recoverableMessages = [
      'timeout',
      'network',
      'connection',
      'rate limit',
      'temporarily unavailable'
    ]

    const message = error.message?.toLowerCase() || ''
    return recoverableMessages.some(keyword => message.includes(keyword))
  }

  /**
   * リトライが可能かチェック
   */
  canRetry(stepName: string): boolean {
    const stepErrors = this.errors.filter(e => e.stepName === stepName)
    const lastError = stepErrors[stepErrors.length - 1]
    
    if (!lastError) return true
    
    return lastError.recoverable && lastError.retryCount < this.strategy.maxRetries
  }

  /**
   * 次のリトライカウントを取得
   */
  getNextRetryCount(stepName: string): number {
    const stepErrors = this.errors.filter(e => e.stepName === stepName)
    const maxRetryCount = Math.max(0, ...stepErrors.map(e => e.retryCount))
    return maxRetryCount + 1
  }

  /**
   * リトライ遅延時間を計算（指数バックオフ）
   */
  getRetryDelay(retryCount: number): number {
    return this.strategy.retryDelayMs * Math.pow(2, retryCount - 1)
  }

  /**
   * リトライ実行ヘルパー
   */
  async executeWithRetry<T>(
    step: WorkflowStep,
    stepName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    let lastError: any
    let retryCount = this.getNextRetryCount(stepName)

    while (retryCount <= this.strategy.maxRetries) {
      try {
        console.log(`[ErrorRecovery] Executing step: ${stepName} (attempt ${retryCount})`)
        
        if (retryCount > 1) {
          const delay = this.getRetryDelay(retryCount - 1)
          console.log(`[ErrorRecovery] Waiting ${delay}ms before retry`)
          await step.sleep(delay)
        }

        const result = await operation()
        
        if (retryCount > 1) {
          console.log(`[ErrorRecovery] Step ${stepName} succeeded after ${retryCount} attempts`)
        }
        
        return result
      } catch (error: any) {
        lastError = error
        this.recordError(error, stepName, retryCount)
        
        if (!this.canRetry(stepName)) {
          console.error(`[ErrorRecovery] Max retries exceeded for step: ${stepName}`)
          break
        }
        
        console.warn(`[ErrorRecovery] Step ${stepName} failed, will retry (${retryCount}/${this.strategy.maxRetries})`)
        retryCount++
      }
    }

    throw lastError
  }

  /**
   * フォールバック実行
   */
  async executeWithFallback<T>(
    step: WorkflowStep,
    stepName: string,
    primaryOperation: () => Promise<T>,
    fallbackOperation?: () => Promise<T>
  ): Promise<T> {
    try {
      return await this.executeWithRetry(step, stepName, primaryOperation)
    } catch (primaryError: any) {
      if (this.strategy.fallbackEnabled && fallbackOperation) {
        console.log(`[ErrorRecovery] Primary operation failed for ${stepName}, trying fallback`)
        
        try {
          const result = await fallbackOperation()
          console.log(`[ErrorRecovery] Fallback succeeded for step: ${stepName}`)
          return result
        } catch (fallbackError: any) {
          console.error(`[ErrorRecovery] Fallback also failed for step: ${stepName}`)
          this.recordError(fallbackError, `${stepName}_fallback`)
          throw primaryError // 元のエラーを投げる
        }
      }
      
      if (this.strategy.skipOnError) {
        console.warn(`[ErrorRecovery] Skipping failed step: ${stepName}`)
        return null as T // スキップする場合はnullを返す
      }
      
      throw primaryError
    }
  }

  /**
   * 部分的成功を処理
   */
  handlePartialSuccess<T>(
    results: Array<{ success: boolean; data?: T; error?: any }>,
    stepName: string
  ): { successful: T[]; failed: any[]; hasErrors: boolean } {
    const successful: T[] = []
    const failed: any[] = []

    results.forEach((result, index) => {
      if (result.success && result.data) {
        successful.push(result.data)
      } else {
        const error = result.error || new Error('Unknown error')
        this.recordError(error, `${stepName}_item_${index}`)
        failed.push(error)
      }
    })

    const hasErrors = failed.length > 0
    const successRate = successful.length / results.length

    console.log(`[ErrorRecovery] Partial success for ${stepName}: ${successful.length}/${results.length} (${Math.round(successRate * 100)}%)`)

    return { successful, failed, hasErrors }
  }

  /**
   * エラーサマリーを生成
   */
  getErrorSummary(): {
    totalErrors: number
    recoverableErrors: number
    unrecoverableErrors: number
    stepErrorCounts: Record<string, number>
    mostCommonError: string | null
  } {
    const totalErrors = this.errors.length
    const recoverableErrors = this.errors.filter(e => e.recoverable).length
    const unrecoverableErrors = totalErrors - recoverableErrors

    const stepErrorCounts: Record<string, number> = {}
    const errorTypeCounts: Record<string, number> = {}

    this.errors.forEach(error => {
      stepErrorCounts[error.stepName] = (stepErrorCounts[error.stepName] || 0) + 1
      errorTypeCounts[error.type] = (errorTypeCounts[error.type] || 0) + 1
    })

    const mostCommonError = Object.keys(errorTypeCounts).reduce((a, b) => 
      errorTypeCounts[a] > errorTypeCounts[b] ? a : b
    , null)

    return {
      totalErrors,
      recoverableErrors,
      unrecoverableErrors,
      stepErrorCounts,
      mostCommonError
    }
  }

  /**
   * 全エラー情報を取得
   */
  getAllErrors(): ErrorInfo[] {
    return [...this.errors]
  }

  /**
   * エラー情報をクリア
   */
  clearErrors(): void {
    this.errors = []
  }

  /**
   * 戦略を更新
   */
  updateStrategy(newStrategy: Partial<RecoveryStrategy>): void {
    this.strategy = { ...this.strategy, ...newStrategy }
    console.log(`[ErrorRecovery] Strategy updated:`, this.strategy)
  }
}