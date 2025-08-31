/**
 * response-builder互換性レイヤー
 * テストとの互換性のために既存のAPIをエクスポート
 */

// CORSヘッダーの定義（小文字キー）
export const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization',
  'access-control-max-age': '86400'
}

/**
 * 成功レスポンス（互換性用）
 */
export function successResponse(data: any, message?: string, status = 200) {
  const body: any = {
    success: true,
    data
  }
  
  if (message) {
    body.message = message
  }
  
  return {
    status,
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      ...corsHeaders
    }
  }
}

/**
 * エラーレスポンス（互換性用）
 */
export function errorResponse(
  message: string,
  status = 500,
  code?: string,
  details?: any
) {
  const errorBody: any = {
    success: false,
    error: message
  }
  
  if (code) {
    errorBody.code = code
  }
  
  if (details) {
    errorBody.details = details
  }
  
  return {
    status,
    body: JSON.stringify(errorBody),
    headers: {
      'content-type': 'application/json',
      ...corsHeaders
    }
  }
}

/**
 * ページネーションレスポンス（互換性用）
 */
export function paginatedResponse(
  data: any[],
  total: number,
  page: number,
  pageSize: number,
  message?: string
) {
  const totalPages = Math.ceil(total / pageSize)
  
  const body: any = {
    success: true,
    data,
    pagination: {
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  }
  
  if (message) {
    body.message = message
  }
  
  return {
    status: 200,
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      ...corsHeaders
    }
  }
}

/**
 * バリデーションエラーレスポンス
 */
export function validationErrorResponse(errors: any[], message = 'Validation failed') {
  return errorResponse(message, 400, 'VALIDATION_ERROR', { errors })
}

/**
 * Not Foundレスポンス
 */
export function notFoundResponse(resourceName?: string) {
  const message = resourceName ? `${resourceName} not found` : 'Resource not found'
  return errorResponse(message, 404, 'NOT_FOUND')
}

/**
 * 認証エラーレスポンス
 */
export function unauthorizedResponse(message?: string) {
  return errorResponse(message || 'Authentication required', 401, 'UNAUTHORIZED')
}

/**
 * 権限エラーレスポンス
 */
export function forbiddenResponse(message?: string) {
  return errorResponse(message || 'Access denied', 403, 'FORBIDDEN')
}

/**
 * 競合エラーレスポンス
 */
export function conflictResponse(message = 'Conflict', details?: any) {
  return errorResponse(message, 409, 'CONFLICT', details)
}

/**
 * 内部エラーレスポンス
 */
export function internalErrorResponse(message?: string, details?: any) {
  return errorResponse(message || 'An unexpected error occurred', 500, 'INTERNAL_ERROR', details)
}

/**
 * ストリームレスポンス
 */
export function streamResponse(stream: ReadableStream, contentType = 'application/octet-stream') {
  return {
    status: 200,
    body: stream,
    headers: {
      'content-type': contentType,
      ...corsHeaders
    }
  }
}

/**
 * JSONレスポンス
 */
export function jsonResponse(data: any, status = 200) {
  return {
    status,
    body: JSON.stringify(data),
    headers: {
      'content-type': 'application/json',
      ...corsHeaders
    }
  }
}

/**
 * テキストレスポンス
 */
export function textResponse(text: string, status = 200) {
  return {
    status,
    body: text,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      ...corsHeaders
    }
  }
}

/**
 * HTMLレスポンス
 */
export function htmlResponse(html: string, status = 200) {
  return {
    status,
    body: html,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...corsHeaders
    }
  }
}

/**
 * リダイレクトレスポンス
 */
export function redirectResponse(url: string, permanent = false) {
  return {
    status: permanent ? 301 : 302,
    body: '',
    headers: {
      'location': url,
      ...corsHeaders
    }
  }
}

/**
 * No Contentレスポンス
 */
export function noContentResponse() {
  return {
    status: 204,
    body: null,
    headers: corsHeaders
  }
}

/**
 * Createdレスポンス
 */
export function createdResponse(data?: any, location?: string) {
  const body: any = {
    success: true
  }
  
  if (data !== undefined) {
    body.data = data
  }
  
  const headers: any = {
    'content-type': 'application/json',
    ...corsHeaders
  }
  
  if (location) {
    headers['location'] = location
  }
  
  return {
    status: 201,
    body: JSON.stringify(body),
    headers
  }
}

/**
 * Acceptedレスポンス
 */
export function acceptedResponse(data?: any) {
  const body: any = {
    success: true
  }
  
  if (data !== undefined) {
    body.data = data
  }
  
  return {
    status: 202,
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      ...corsHeaders
    }
  }
}

/**
 * CORSヘッダーを取得
 */
export function getCorsHeaders(origin = '*') {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-max-age': '86400'
  }
}

/**
 * ヘッダーを追加
 */
export function appendHeaders(response: any, headers: Record<string, string>) {
  return {
    ...response,
    headers: {
      ...(response.headers || {}),
      ...headers
    }
  }
}