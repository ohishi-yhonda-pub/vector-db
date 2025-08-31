/**
 * レスポンス生成ヘルパーユーティリティ
 */

import { Context } from 'hono'

/**
 * CORSヘッダー（新API用）
 */
export const defaultCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

/**
 * 成功レスポンスインターフェース
 */
export interface SuccessResponse<T = any> {
  success: true
  data: T
  message?: string
  metadata?: ResponseMetadata
}

/**
 * ページネーションメタデータ
 */
export interface PaginationMetadata {
  page: number
  limit: number
  total: number
  totalPages: number
  hasMore: boolean
}

/**
 * レスポンスメタデータ
 */
export interface ResponseMetadata {
  timestamp?: string
  version?: string
  pagination?: PaginationMetadata
  [key: string]: any
}

/**
 * リストレスポンスインターフェース
 */
export interface ListResponse<T = any> {
  success: true
  data: T[]
  metadata: {
    total: number
    count: number
    pagination?: PaginationMetadata
    [key: string]: any
  }
}

/**
 * 成功レスポンスを生成
 */
export function createSuccessResponse<T>(
  data: T,
  message?: string,
  metadata?: ResponseMetadata
): SuccessResponse<T> {
  return {
    success: true,
    data,
    ...(message && { message }),
    ...(metadata && { metadata: {
      timestamp: new Date().toISOString(),
      ...metadata
    }})
  }
}

/**
 * リストレスポンスを生成
 */
export function createListResponse<T>(
  items: T[],
  total?: number,
  pagination?: Partial<PaginationMetadata>,
  additionalMetadata?: Record<string, any>
): ListResponse<T> {
  const count = items.length
  const actualTotal = total ?? count

  let paginationMetadata: PaginationMetadata | undefined
  if (pagination) {
    const { page = 1, limit = 20 } = pagination
    const totalPages = Math.ceil(actualTotal / limit)
    paginationMetadata = {
      page,
      limit,
      total: actualTotal,
      totalPages,
      hasMore: page < totalPages
    }
  }

  return {
    success: true,
    data: items,
    metadata: {
      total: actualTotal,
      count,
      ...(paginationMetadata && { pagination: paginationMetadata }),
      ...additionalMetadata
    }
  }
}

/**
 * 作成レスポンスを生成（201 Created）
 */
export function createCreatedResponse<T>(
  data: T,
  message: string = 'Resource created successfully',
  location?: string
): SuccessResponse<T> {
  return {
    success: true,
    data,
    message,
    metadata: {
      timestamp: new Date().toISOString(),
      ...(location && { location })
    }
  }
}

/**
 * 更新レスポンスを生成
 */
export function createUpdatedResponse<T>(
  data: T,
  message: string = 'Resource updated successfully'
): SuccessResponse<T> {
  return createSuccessResponse(data, message)
}

/**
 * 削除レスポンスを生成
 */
export function createDeletedResponse(
  id: string | string[],
  message?: string
): SuccessResponse<{ deleted: string | string[] }> {
  const ids = Array.isArray(id) ? id : [id]
  const defaultMessage = ids.length === 1 
    ? 'Resource deleted successfully'
    : `${ids.length} resources deleted successfully`
  
  return createSuccessResponse(
    { deleted: id },
    message || defaultMessage
  )
}

/**
 * 受付レスポンスを生成（202 Accepted）
 */
export function createAcceptedResponse<T>(
  data: T,
  message: string = 'Request accepted for processing',
  jobId?: string
): SuccessResponse<T> {
  return {
    success: true,
    data,
    message,
    metadata: {
      timestamp: new Date().toISOString(),
      ...(jobId && { jobId })
    }
  }
}

/**
 * 空レスポンスを生成（204 No Content相当）
 */
export function createEmptyResponse(
  message: string = 'Operation completed successfully'
): SuccessResponse<null> {
  return createSuccessResponse(null, message)
}

/**
 * JSONレスポンスを生成（Honoのレスポンスヘルパー）
 */
export function jsonResponseWithContext<T>(
  c: Context,
  data: SuccessResponse<T> | ListResponse<T>,
  status: number = 200
) {
  return c.json(data, status)
}

/**
 * ページネーションパラメータを解析
 */
export function parsePaginationParams(
  c: Context,
  defaults = { page: 1, limit: 20, maxLimit: 100 }
): { page: number; limit: number; offset: number } {
  const query = c.req.query()
  
  let page = parseInt(query.page || String(defaults.page), 10)
  let limit = parseInt(query.limit || String(defaults.limit), 10)
  
  // バリデーション
  page = Math.max(1, page)
  limit = Math.min(Math.max(1, limit), defaults.maxLimit)
  
  const offset = (page - 1) * limit
  
  return { page, limit, offset }
}

/**
 * ソートパラメータを解析
 */
export function parseSortParams(
  c: Context,
  allowedFields: string[],
  defaultSort = { field: 'createdAt', order: 'desc' as 'asc' | 'desc' }
): { field: string; order: 'asc' | 'desc' } {
  const query = c.req.query()
  
  const field = query.sortBy || query.sort || defaultSort.field
  const order = (query.order || query.sortOrder || defaultSort.order).toLowerCase() as 'asc' | 'desc'
  
  // バリデーション
  if (!allowedFields.includes(field)) {
    return defaultSort
  }
  
  if (order !== 'asc' && order !== 'desc') {
    return { field, order: defaultSort.order }
  }
  
  return { field, order }
}

/**
 * フィルターパラメータを解析
 */
export function parseFilterParams(
  c: Context,
  allowedFilters: string[]
): Record<string, any> {
  const query = c.req.query()
  const filters: Record<string, any> = {}
  
  for (const key of allowedFilters) {
    if (query[key] !== undefined) {
      filters[key] = query[key]
    }
  }
  
  return filters
}

/**
 * バッチ操作の結果レスポンスを生成
 */
export interface BatchOperationResult<T = any> {
  successful: T[]
  failed: Array<{
    item: any
    error: string
  }>
  metadata: {
    total: number
    succeeded: number
    failed: number
  }
}

export function createBatchResponse<T>(
  successful: T[],
  failed: Array<{ item: any; error: string }> = []
): SuccessResponse<BatchOperationResult<T>> {
  const total = successful.length + failed.length
  
  return createSuccessResponse<BatchOperationResult<T>>({
    successful,
    failed,
    metadata: {
      total,
      succeeded: successful.length,
      failed: failed.length
    }
  }, `Batch operation completed: ${successful.length} succeeded, ${failed.length} failed`)
}

/**
 * ジョブステータスレスポンスを生成
 */
export interface JobStatusResponse {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: {
    current: number
    total: number
    percentage: number
  }
  result?: any
  error?: string
  startedAt?: string
  completedAt?: string
}

export function createJobStatusResponse(
  jobStatus: JobStatusResponse
): SuccessResponse<JobStatusResponse> {
  return createSuccessResponse(jobStatus, undefined, {
    timestamp: new Date().toISOString()
  })
}

// 互換性のために以前のAPIをエクスポート
export {
  successResponse,
  errorResponse,
  paginatedResponse,
  validationErrorResponse,
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
  conflictResponse,
  internalErrorResponse,
  streamResponse,
  jsonResponse,
  textResponse,
  htmlResponse,
  redirectResponse,
  noContentResponse,
  createdResponse,
  acceptedResponse,
  getCorsHeaders,
  appendHeaders,
  corsHeaders
} from './response-builder-compat'