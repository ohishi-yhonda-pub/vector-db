/**
 * Durable Object基底クラス
 */

import { AppError, ErrorCodes, logError } from '../utils/error-handler'

/**
 * Durable Object基底クラス
 */
export abstract class BaseDurableObject {
  protected ctx: DurableObjectState
  protected storage: DurableObjectStorage
  protected env: Env
  protected logger: any

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx
    this.storage = ctx.storage
    this.env = env
  }

  /**
   * 初期化処理
   */
  protected async initialize(): Promise<void> {
    // サブクラスでオーバーライド
  }

  /**
   * ストレージから値を取得
   */
  protected async getFromStorage<T>(key: string): Promise<T | undefined> {
    try {
      return await this.storage.get<T>(key)
    } catch (error) {
      logError(error, undefined, { operation: 'getFromStorage', key })
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to get value from storage: ${key}`,
        500,
        error
      )
    }
  }

  /**
   * ストレージに値を保存
   */
  protected async putToStorage<T>(key: string, value: T): Promise<void> {
    try {
      await this.storage.put(key, value)
    } catch (error) {
      logError(error, undefined, { operation: 'putToStorage', key })
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to put value to storage: ${key}`,
        500,
        error
      )
    }
  }

  /**
   * ストレージから値を削除
   */
  protected async deleteFromStorage(key: string): Promise<boolean> {
    try {
      return await this.storage.delete(key)
    } catch (error) {
      logError(error, undefined, { operation: 'deleteFromStorage', key })
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to delete value from storage: ${key}`,
        500,
        error
      )
    }
  }

  /**
   * ストレージからバルク取得
   */
  protected async getMultipleFromStorage<T>(
    keys: string[]
  ): Promise<Map<string, T>> {
    try {
      return await this.storage.get<T>(keys)
    } catch (error) {
      logError(error, undefined, { operation: 'getMultipleFromStorage', keys })
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        'Failed to get multiple values from storage',
        500,
        error
      )
    }
  }

  /**
   * ストレージにバルク保存
   */
  protected async putMultipleToStorage<T>(
    entries: Record<string, T>
  ): Promise<void> {
    try {
      await this.storage.put(entries)
    } catch (error) {
      logError(error, undefined, { operation: 'putMultipleToStorage' })
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        'Failed to put multiple values to storage',
        500,
        error
      )
    }
  }

  /**
   * トランザクション実行
   */
  protected async transaction<T>(
    fn: () => Promise<T>
  ): Promise<T> {
    try {
      return await this.storage.transaction(async () => {
        return await fn()
      })
    } catch (error) {
      logError(error, undefined, { operation: 'transaction' })
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        'Transaction failed',
        500,
        error
      )
    }
  }

  /**
   * アラーム設定
   */
  protected async setAlarm(delayMs: number): Promise<void> {
    try {
      const alarmTime = Date.now() + delayMs
      await this.storage.setAlarm(alarmTime)
    } catch (error) {
      logError(error, undefined, { operation: 'setAlarm', delayMs })
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        'Failed to set alarm',
        500,
        error
      )
    }
  }

  /**
   * アラーム削除
   */
  protected async deleteAlarm(): Promise<void> {
    try {
      await this.storage.deleteAlarm()
    } catch (error) {
      logError(error, undefined, { operation: 'deleteAlarm' })
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        'Failed to delete alarm',
        500,
        error
      )
    }
  }

  /**
   * アラームハンドラー（サブクラスでオーバーライド）
   */
  async alarm(): Promise<void> {
    // サブクラスで実装
  }

  /**
   * 状態を取得
   */
  protected async getState(): Promise<any> {
    return this.state
  }

  /**
   * 状態を設定
   */
  protected async setState(newState: any): Promise<void> {
    this.state = { ...this.state, ...newState }
  }

  /**
   * HTTPリクエストハンドラー
   */
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      const method = request.method
      const path = url.pathname

      // ルーティング処理（サブクラスでオーバーライド）
      return await this.handleRequest(request, method, path)
    } catch (error) {
      logError(error, undefined, { 
        url: request.url, 
        method: request.method 
      })

      if (error instanceof AppError) {
        return new Response(
          JSON.stringify(error.toJSON()),
          {
            status: error.statusCode,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred'
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
  }

  /**
   * リクエストハンドラー（サブクラスでオーバーライド）
   */
  protected abstract handleRequest(
    request: Request,
    method: string,
    path: string
  ): Promise<Response>

  /**
   * JSON レスポンスを生成
   */
  protected jsonResponse(data: any, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * エラーレスポンスを生成
   */
  protected errorResponse(
    message: string,
    status: number = 500,
    code?: string
  ): Response {
    return this.jsonResponse(
      {
        success: false,
        error: code || 'ERROR',
        message
      },
      status
    )
  }
}