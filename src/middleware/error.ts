/**
 * エラーハンドリングミドルウェア
 */

import { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { 
  AppError, 
  createErrorResponse, 
  getStatusCode, 
  logError 
} from '../utils/error-handler'

/**
 * グローバルエラーハンドリングミドルウェア
 */
export async function errorMiddleware(c: Context, next: Next) {
  try {
    await next()
  } catch (error) {
    // エラーログを記録
    logError(error, c, {
      url: c.req.url,
      headers: Object.fromEntries([...c.req.raw.headers as any])
    })

    // ステータスコードを取得
    const statusCode = getStatusCode(error)

    // エラーレスポンスを生成
    const errorResponse = createErrorResponse(error, c)

    // レスポンスを返す
    return c.json(errorResponse, statusCode as any)
  }
}

/**
 * 404エラーハンドラー
 */
export function notFoundHandler(c: Context) {
  const error = new AppError(
    'NOT_FOUND',
    `Route not found: ${c.req.method} ${c.req.path}`,
    404
  )
  
  const errorResponse = createErrorResponse(error, c)
  return c.json(errorResponse, 404 as any)
}

/**
 * 開発環境用の詳細エラーミドルウェア
 */
export async function devErrorMiddleware(c: Context, next: Next) {
  try {
    await next()
  } catch (error) {
    const isDev = c.env?.ENVIRONMENT === 'development'
    
    if (isDev && error instanceof Error) {
      // 開発環境では詳細なエラー情報を返す
      return c.json({
        success: false,
        error: error.name,
        message: error.message,
        stack: error.stack?.split('\n'),
        timestamp: new Date().toISOString(),
        path: c.req.path,
        method: c.req.method,
        query: c.req.query(),
        headers: Object.fromEntries([...c.req.raw.headers as any])
      }, getStatusCode(error) as any)
    }
    
    // 本番環境では通常のエラーハンドリング
    throw error
  }
}