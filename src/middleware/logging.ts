/**
 * ロギングミドルウェア
 */

import { Context, Next } from 'hono'

/**
 * ログレベル
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

/**
 * ログエントリーインターフェース
 */
export interface LogEntry {
  timestamp: string
  level: LogLevel
  method: string
  path: string
  query?: Record<string, string>
  statusCode?: number
  duration?: number
  userAgent?: string
  ip?: string
  requestId?: string
  error?: any
  metadata?: Record<string, any>
}

/**
 * リクエストIDを生成
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 構造化ログを出力
 */
function writeLog(entry: LogEntry, isDev: boolean = false) {
  if (isDev) {
    // 開発環境では読みやすい形式で出力
    const { timestamp, level, method, path, duration, statusCode, ...rest } = entry
    console.log(
      `[${timestamp}] ${level} ${method} ${path} ${statusCode || '-'} ${duration ? `${duration}ms` : ''}`
    )
    if (Object.keys(rest).length > 0) {
      console.log('  Details:', rest)
    }
  } else {
    // 本番環境ではJSON形式で出力
    console.log(JSON.stringify(entry))
  }
}

/**
 * リクエスト/レスポンスロギングミドルウェア
 */
export async function loggingMiddleware(c: Context, next: Next) {
  const startTime = Date.now()
  const requestId = generateRequestId()
  const isDev = c.env?.ENVIRONMENT === 'development'

  // リクエストIDをコンテキストに設定
  c.set('requestId', requestId)

  // リクエストログ
  const requestLog: LogEntry = {
    timestamp: new Date().toISOString(),
    level: LogLevel.INFO,
    method: c.req.method,
    path: c.req.path,
    query: c.req.query(),
    userAgent: c.req.header('User-Agent'),
    ip: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP'),
    requestId
  }

  writeLog(requestLog, isDev)

  try {
    await next()

    // レスポンスログ
    const duration = Date.now() - startTime
    const responseLog: LogEntry = {
      timestamp: new Date().toISOString(),
      level: c.res.status >= 400 ? LogLevel.WARN : LogLevel.INFO,
      method: c.req.method,
      path: c.req.path,
      statusCode: c.res.status,
      duration,
      requestId
    }

    writeLog(responseLog, isDev)
  } catch (error) {
    // エラーログ
    const duration = Date.now() - startTime
    const errorLog: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      method: c.req.method,
      path: c.req.path,
      statusCode: 500,
      duration,
      requestId,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    }

    writeLog(errorLog, isDev)
    throw error
  }
}

/**
 * パフォーマンス計測ミドルウェア
 */
export async function performanceMiddleware(c: Context, next: Next) {
  const metrics: Record<string, number> = {}
  const startTime = performance.now()

  await next()

  const endTime = performance.now()
  const totalTime = endTime - startTime

  // メトリクスをヘッダーに追加
  c.header('X-Response-Time', `${totalTime.toFixed(2)}ms`)
  c.header('X-Request-Id', c.get('requestId') || '')

  // 開発環境では詳細なメトリクスを出力
  if (c.env?.ENVIRONMENT === 'development') {
    metrics.total = totalTime
    
    const metricsLog: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.DEBUG,
      method: c.req.method,
      path: c.req.path,
      requestId: c.get('requestId'),
      metadata: {
        performance: metrics
      }
    }

    writeLog(metricsLog, true)
  }
}

/**
 * カスタムロガークラス
 */
export class Logger {
  constructor(
    private readonly context: string,
    private readonly isDev: boolean = false
  ) {}

  private log(level: LogLevel, message: string, metadata?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      method: '',
      path: '',
      metadata: {
        context: this.context,
        message,
        ...metadata
      }
    }
    writeLog(entry, this.isDev)
  }

  debug(message: string, metadata?: any) {
    if (this.isDev) {
      this.log(LogLevel.DEBUG, message, metadata)
    }
  }

  info(message: string, metadata?: any) {
    this.log(LogLevel.INFO, message, metadata)
  }

  warn(message: string, metadata?: any) {
    this.log(LogLevel.WARN, message, metadata)
  }

  error(message: string, error?: any, metadata?: any) {
    this.log(LogLevel.ERROR, message, {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error,
      ...metadata
    })
  }
}

/**
 * ロガーファクトリー
 */
export function createLogger(context: string, env?: Env): Logger {
  return new Logger(context, env?.ENVIRONMENT === 'development')
}

/**
 * 監査ログミドルウェア（重要な操作をログに記録）
 */
export function auditMiddleware(
  operations: string[] = ['POST', 'PUT', 'DELETE', 'PATCH']
) {
  return async (c: Context, next: Next) => {
    if (!operations.includes(c.req.method)) {
      await next()
      return
    }

    const auditLog: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      method: c.req.method,
      path: c.req.path,
      requestId: c.get('requestId'),
      userAgent: c.req.header('User-Agent'),
      ip: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP'),
      metadata: {
        type: 'AUDIT',
        operation: `${c.req.method} ${c.req.path}`,
        user: c.get('user') || 'anonymous'
      }
    }

    // リクエストボディも記録（センシティブデータは除外すべき）
    if (c.req.method !== 'GET' && c.req.method !== 'DELETE') {
      try {
        const body = await c.req.json()
        // パスワードなどのセンシティブデータを除外
        const sanitizedBody = { ...body }
        delete sanitizedBody.password
        delete sanitizedBody.token
        delete sanitizedBody.apiKey
        
        auditLog.metadata!.requestBody = sanitizedBody
      } catch {
        // JSONパースエラーは無視
      }
    }

    writeLog(auditLog, c.env?.ENVIRONMENT === 'development')
    
    await next()
  }
}