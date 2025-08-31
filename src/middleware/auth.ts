/**
 * 認証ミドルウェア
 */

import { Context, Next } from 'hono'
import { AppError, ErrorCodes } from '../utils/error-handler'

/**
 * APIキー認証ミドルウェア
 */
export async function apiKeyAuth(
  c: Context,
  next: Next,
  options?: {
    headerName?: string
    envVarName?: string
    optional?: boolean
  }
) {
  const {
    headerName = 'X-API-Key',
    envVarName = 'API_KEY',
    optional = false
  } = options || {}

  const apiKey = c.req.header(headerName)
  const expectedKey = c.env?.[envVarName]

  // APIキーが設定されていない場合（環境変数）
  if (!optional && !expectedKey) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      'API key not configured',
      500
    )
  }

  // APIキーが提供されていない場合
  if (!optional && !apiKey) {
    throw new AppError(
      ErrorCodes.UNAUTHORIZED,
      'API key required',
      401
    )
  }

  // APIキーが一致しない場合
  if (apiKey && expectedKey && apiKey !== expectedKey) {
    throw new AppError(
      ErrorCodes.UNAUTHORIZED,
      'Invalid API key',
      401
    )
  }

  await next()
}

/**
 * Notion API認証ミドルウェア
 */
export async function notionAuth(c: Context, next: Next) {
  const notionApiKey = c.env?.NOTION_API_KEY

  if (!notionApiKey) {
    throw new AppError(
      ErrorCodes.UNAUTHORIZED,
      'Notion APIトークンが設定されていません',
      401
    )
  }

  // Notion APIキーをコンテキストに追加
  c.set('notionApiKey', notionApiKey)

  await next()
}

/**
 * Bearer トークン認証ミドルウェア
 */
export async function bearerAuth(
  c: Context,
  next: Next,
  validateToken?: (token: string) => Promise<boolean>
) {
  const authorization = c.req.header('Authorization')

  if (!authorization) {
    throw new AppError(
      ErrorCodes.UNAUTHORIZED,
      'Authorization header required',
      401
    )
  }

  const match = authorization.match(/^Bearer\s+(.+)$/)
  if (!match) {
    throw new AppError(
      ErrorCodes.UNAUTHORIZED,
      'Invalid authorization format',
      401
    )
  }

  const token = match[1]

  // カスタムバリデーション関数が提供されている場合
  if (validateToken) {
    const isValid = await validateToken(token)
    if (!isValid) {
      throw new AppError(
        ErrorCodes.UNAUTHORIZED,
        'Invalid token',
        401
      )
    }
  }

  // トークンをコンテキストに追加
  c.set('token', token)

  await next()
}

/**
 * レート制限ミドルウェア（簡易版）
 */
export function rateLimitAuth(
  windowMs: number = 60000, // 1分
  maxRequests: number = 60
) {
  const requests = new Map<string, { count: number; resetTime: number }>()

  return async (c: Context, next: Next) => {
    const clientId = c.req.header('X-Forwarded-For') || 
                    c.req.header('X-Real-IP') || 
                    'anonymous'

    const now = Date.now()
    const clientData = requests.get(clientId)

    if (!clientData || now > clientData.resetTime) {
      // 新しいウィンドウを開始
      requests.set(clientId, {
        count: 1,
        resetTime: now + windowMs
      })
    } else {
      // 既存のウィンドウ内
      clientData.count++

      if (clientData.count > maxRequests) {
        throw new AppError(
          ErrorCodes.FORBIDDEN,
          'Rate limit exceeded',
          429
        )
      }
    }

    // レート制限情報をヘッダーに追加
    const data = requests.get(clientId)!
    c.header('X-RateLimit-Limit', String(maxRequests))
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - data.count)))
    c.header('X-RateLimit-Reset', String(data.resetTime))

    await next()
  }
}

/**
 * CORS設定ミドルウェア
 */
export function corsAuth(options?: {
  origin?: string | string[] | ((origin: string) => boolean)
  credentials?: boolean
  allowMethods?: string[]
  allowHeaders?: string[]
  exposeHeaders?: string[]
  maxAge?: number
}) {
  const {
    origin = '*',
    credentials = false,
    allowMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders = ['Content-Type', 'Authorization'],
    exposeHeaders = [],
    maxAge = 86400
  } = options || {}

  return async (c: Context, next: Next) => {
    const requestOrigin = c.req.header('Origin') || ''

    // Origin の検証
    let allowOrigin = '*'
    if (typeof origin === 'string') {
      allowOrigin = origin
    } else if (Array.isArray(origin)) {
      if (origin.includes(requestOrigin)) {
        allowOrigin = requestOrigin
      }
    } else if (typeof origin === 'function') {
      if (origin(requestOrigin)) {
        allowOrigin = requestOrigin
      }
    }

    // CORS ヘッダーの設定
    c.header('Access-Control-Allow-Origin', allowOrigin)
    
    if (credentials) {
      c.header('Access-Control-Allow-Credentials', 'true')
    }

    // Preflight リクエストの処理
    if (c.req.method === 'OPTIONS') {
      c.header('Access-Control-Allow-Methods', allowMethods.join(', '))
      c.header('Access-Control-Allow-Headers', allowHeaders.join(', '))
      
      if (exposeHeaders.length > 0) {
        c.header('Access-Control-Expose-Headers', exposeHeaders.join(', '))
      }
      
      if (maxAge) {
        c.header('Access-Control-Max-Age', String(maxAge))
      }

      return new Response('', { status: 204 })
    }

    await next()
  }
}