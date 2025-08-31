/**
 * リトライロジックユーティリティ
 */

import { AppError, ErrorCodes, isRetryableError } from './error-handler'

/**
 * リトライ設定
 */
export interface RetryConfig {
  maxAttempts?: number
  initialDelay?: number
  maxDelay?: number
  backoffMultiplier?: number
  timeout?: number
  retryCondition?: (error: unknown) => boolean
  onRetry?: (attempt: number, error: unknown, delay: number) => void
}

/**
 * デフォルトのリトライ設定
 */
const DEFAULT_RETRY_CONFIG: Required<Omit<RetryConfig, 'onRetry'>> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  timeout: 60000,
  retryCondition: isRetryableError
}

/**
 * 指数バックオフでリトライ
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config?: RetryConfig
): Promise<T> {
  const {
    maxAttempts,
    initialDelay,
    maxDelay,
    backoffMultiplier,
    timeout,
    retryCondition,
    onRetry
  } = { ...DEFAULT_RETRY_CONFIG, ...config }

  let lastError: unknown
  let delay = initialDelay

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // タイムアウト処理
      if (timeout) {
        return await withTimeout(fn(), timeout)
      }
      return await fn()
    } catch (error) {
      lastError = error

      // 最後の試行またはリトライ不可能なエラーの場合
      if (attempt === maxAttempts || !retryCondition(error)) {
        throw error
      }

      // リトライコールバック
      if (onRetry) {
        onRetry(attempt, error, delay)
      }

      // 遅延実行
      await sleep(delay)

      // 次回の遅延時間を計算（指数バックオフ）
      delay = Math.min(delay * backoffMultiplier, maxDelay)
    }
  }

  throw lastError
}

/**
 * サーキットブレーカー実装
 */
export class CircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'

  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000,
    private readonly resetTimeout: number = 30000
  ) {}

  /**
   * サーキットブレーカー経由で関数を実行
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // オープン状態のチェック
    if (this.state === 'OPEN') {
      const now = Date.now()
      if (now - this.lastFailureTime < this.resetTimeout) {
        throw new AppError(
          ErrorCodes.SERVICE_UNAVAILABLE,
          'Circuit breaker is OPEN',
          503
        )
      }
      // リセットタイムアウト経過後はHALF_OPENに移行
      this.state = 'HALF_OPEN'
    }

    try {
      const result = await withTimeout(fn(), this.timeout)
      
      // 成功時の処理
      if (this.state === 'HALF_OPEN') {
        this.reset()
      }
      
      return result
    } catch (error) {
      this.recordFailure()
      throw error
    }
  }

  /**
   * 失敗を記録
   */
  private recordFailure(): void {
    this.failures++
    this.lastFailureTime = Date.now()

    if (this.failures >= this.threshold) {
      this.state = 'OPEN'
    }
  }

  /**
   * サーキットブレーカーをリセット
   */
  private reset(): void {
    this.failures = 0
    this.lastFailureTime = 0
    this.state = 'CLOSED'
  }

  /**
   * 現在の状態を取得
   */
  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.state
  }

  /**
   * 統計情報を取得
   */
  getStats(): {
    state: string
    failures: number
    lastFailureTime: number
  } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    }
  }
}

/**
 * タイムアウト処理
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AppError(
        ErrorCodes.TIMEOUT,
        `Operation timed out after ${timeoutMs}ms`,
        504
      ))
    }, timeoutMs)

    promise
      .then(result => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch(error => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

/**
 * スリープ関数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * レート制限付き実行
 */
export class RateLimiter {
  private queue: Array<() => void> = []
  private running = 0

  constructor(
    private readonly maxConcurrent: number = 5,
    private readonly minInterval: number = 100
  ) {}

  /**
   * レート制限付きで関数を実行
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // 同時実行数の制限に達している場合は待機
    while (this.running >= this.maxConcurrent) {
      await new Promise<void>(resolve => {
        this.queue.push(resolve)
      })
    }

    this.running++

    try {
      const startTime = Date.now()
      const result = await fn()
      
      // 最小インターバルを確保
      const elapsed = Date.now() - startTime
      if (elapsed < this.minInterval) {
        await sleep(this.minInterval - elapsed)
      }
      
      return result
    } finally {
      this.running--
      
      // 待機中のタスクを実行
      const next = this.queue.shift()
      if (next) {
        next()
      }
    }
  }

  /**
   * 現在の状態を取得
   */
  getStats(): {
    running: number
    queued: number
  } {
    return {
      running: this.running,
      queued: this.queue.length
    }
  }
}

/**
 * バルク処理のリトライ
 */
export async function retryBulkOperation<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  config?: RetryConfig & { concurrency?: number }
): Promise<{
  successful: Array<{ item: T; result: R }>
  failed: Array<{ item: T; error: unknown }>
}> {
  const successful: Array<{ item: T; result: R }> = []
  const failed: Array<{ item: T; error: unknown }> = []
  const concurrency = config?.concurrency || 5

  // バッチ処理
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const promises = batch.map(async (item) => {
      try {
        const result = await retryWithBackoff(
          () => operation(item),
          config
        )
        successful.push({ item, result })
      } catch (error) {
        failed.push({ item, error })
      }
    })
    
    await Promise.all(promises)
  }

  return { successful, failed }
}

/**
 * プリセットリトライ設定
 */
export const RetryPresets = {
  /**
   * 高速リトライ（API呼び出し用）
   */
  fast: {
    maxAttempts: 3,
    initialDelay: 100,
    maxDelay: 1000,
    backoffMultiplier: 2,
    timeout: 5000
  } as RetryConfig,

  /**
   * 標準リトライ（一般的な操作用）
   */
  standard: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    timeout: 30000
  } as RetryConfig,

  /**
   * 長時間リトライ（ファイル処理等）
   */
  slow: {
    maxAttempts: 5,
    initialDelay: 5000,
    maxDelay: 60000,
    backoffMultiplier: 1.5,
    timeout: 300000
  } as RetryConfig,

  /**
   * 外部API用（レート制限考慮）
   */
  externalApi: {
    maxAttempts: 5,
    initialDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    timeout: 60000,
    retryCondition: (error: unknown) => {
      if (isRetryableError(error)) return true
      
      // レート制限エラーの場合もリトライ
      if (error instanceof Error) {
        return error.message.includes('rate limit') ||
               error.message.includes('429')
      }
      return false
    }
  } as RetryConfig
}