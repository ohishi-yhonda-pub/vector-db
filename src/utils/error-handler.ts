/**
 * 統一エラーハンドリングユーティリティ
 */

import { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'

/**
 * エラーコード定義
 */
export const ErrorCodes = {
  // 認証・認可エラー
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  
  // リクエストエラー
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  
  // サーバーエラー
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  
  // 外部サービスエラー
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  VECTORIZE_ERROR: 'VECTORIZE_ERROR',
  NOTION_API_ERROR: 'NOTION_API_ERROR',
  
  // 設定エラー
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  
  // 実装エラー
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  AI_SERVICE_ERROR: 'AI_SERVICE_ERROR',
  
  // ワークフローエラー
  WORKFLOW_ERROR: 'WORKFLOW_ERROR',
  JOB_FAILED: 'JOB_FAILED',
  WORKFLOW_NOT_FOUND: 'WORKFLOW_NOT_FOUND',
  
  // 埋め込みエラー
  EMBEDDING_GENERATION_ERROR: 'EMBEDDING_GENERATION_ERROR',
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]

/**
 * アプリケーションエラークラス
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message)
    this.name = 'AppError'
  }

  toJSON() {
    return {
      success: false,
      error: this.code,
      message: this.message,
      ...(this.details && { details: this.details })
    }
  }
}

/**
 * エラーレスポンスインターフェース
 */
export interface ErrorResponse {
  success: false
  error: string
  message: string
  details?: any
  timestamp?: string
  path?: string
}

/**
 * HTTPステータスコードとエラーコードのマッピング
 */
const statusCodeMap: Record<number, ErrorCode> = {
  400: ErrorCodes.BAD_REQUEST,
  401: ErrorCodes.UNAUTHORIZED,
  403: ErrorCodes.FORBIDDEN,
  404: ErrorCodes.NOT_FOUND,
  409: ErrorCodes.CONFLICT,
  500: ErrorCodes.INTERNAL_ERROR,
  503: ErrorCodes.SERVICE_UNAVAILABLE,
}

/**
 * エラーレスポンスを生成
 */
export function createErrorResponse(
  error: Error | AppError | unknown,
  context?: Context
): ErrorResponse {
  // AppErrorの場合
  if (error instanceof AppError) {
    return {
      success: false,
      error: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
      ...(context && { 
        timestamp: new Date().toISOString(),
        path: context.req.path 
      })
    }
  }

  // HTTPExceptionの場合
  if (error instanceof HTTPException) {
    const statusCode = error.status
    const errorCode = statusCodeMap[statusCode] || ErrorCodes.INTERNAL_ERROR
    
    return {
      success: false,
      error: errorCode,
      message: error.message,
      ...(context && { 
        timestamp: new Date().toISOString(),
        path: context.req.path 
      })
    }
  }

  // 通常のErrorの場合
  if (error instanceof Error) {
    // 特定のエラーメッセージからエラーコードを判定
    let errorCode = ErrorCodes.INTERNAL_ERROR
    let statusCode = 500

    if (error.message.includes('Vectorize')) {
      errorCode = ErrorCodes.VECTORIZE_ERROR as ErrorCode
    } else if (error.message.includes('Notion')) {
      errorCode = ErrorCodes.NOTION_API_ERROR as ErrorCode
    } else if (error.message.includes('AI')) {
      errorCode = ErrorCodes.AI_SERVICE_ERROR as ErrorCode
    } else if (error.message.includes('Workflow')) {
      errorCode = ErrorCodes.WORKFLOW_ERROR as ErrorCode
    } else if (error.message.includes('validation')) {
      errorCode = ErrorCodes.VALIDATION_ERROR
      statusCode = 400
    } else if (error.message.includes('not found')) {
      errorCode = ErrorCodes.NOT_FOUND
      statusCode = 404
    }

    return {
      success: false,
      error: errorCode,
      message: error.message,
      ...(context && { 
        timestamp: new Date().toISOString(),
        path: context.req.path 
      })
    }
  }

  // 未知のエラー
  return {
    success: false,
    error: ErrorCodes.INTERNAL_ERROR,
    message: 'An unexpected error occurred',
    details: error,
    ...(context && { 
      timestamp: new Date().toISOString(),
      path: context.req.path 
    })
  }
}

/**
 * エラーをHTTPステータスコードに変換
 */
export function getStatusCode(error: Error | AppError | unknown): number {
  if (error instanceof AppError) {
    return error.statusCode
  }

  if (error instanceof HTTPException) {
    return error.status
  }

  if (error instanceof Error) {
    if (error.message.includes('validation')) return 400
    if (error.message.includes('unauthorized')) return 401
    if (error.message.includes('forbidden')) return 403
    if (error.message.includes('not found')) return 404
    if (error.message.includes('conflict')) return 409
  }

  return 500
}

/**
 * エラーログを記録
 */
export function logError(
  error: Error | AppError | unknown,
  context?: Context,
  additionalInfo?: Record<string, any>
): void {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    ...(context && {
      path: context.req.path,
      method: context.req.method,
      query: context.req.query(),
    }),
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error instanceof AppError && {
        code: error.code,
        statusCode: error.statusCode,
        details: error.details
      })
    } : error,
    ...additionalInfo
  }

  // Production環境では構造化ログ、開発環境ではコンソール出力
  if (context?.env?.ENVIRONMENT === 'production') {
    console.error(JSON.stringify(errorInfo))
  } else {
    console.error('Error:', errorInfo)
  }
}

/**
 * 安全にエラーメッセージを取得
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return 'An unexpected error occurred'
}

/**
 * エラーハンドリングラッパー（非同期関数用）
 */
export async function handleAsync<T>(
  fn: () => Promise<T>,
  errorMessage?: string
): Promise<[T | null, Error | null]> {
  try {
    const result = await fn()
    return [result, null]
  } catch (error) {
    const appError = error instanceof AppError 
      ? error 
      : new AppError(
          ErrorCodes.INTERNAL_ERROR,
          errorMessage || getErrorMessage(error),
          500,
          error
        )
    return [null, appError]
  }
}

/**
 * Hono用エラーハンドラー
 * エラーレスポンスを生成して返す
 */
export function handleError(c: any, error: unknown, message?: string): Response {
  const errorMessage = message || getErrorMessage(error)
  const statusCode = getStatusCode(error)
  
  logError(error, c)
  
  return c.json(
    createErrorResponse(error, c),
    statusCode
  )
}

/**
 * リトライ可能なエラーかどうかを判定
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AppError) {
    return [
      ErrorCodes.SERVICE_UNAVAILABLE,
      ErrorCodes.TIMEOUT,
      ErrorCodes.EXTERNAL_API_ERROR,
    ].includes(error.code)
  }

  if (error instanceof Error) {
    return error.message.includes('timeout') ||
           error.message.includes('temporarily unavailable') ||
           error.message.includes('rate limit')
  }

  return false
}