import { describe, it, expect } from 'vitest'
import {
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
  corsHeaders,
  getCorsHeaders,
  appendHeaders,
  // New API functions
  defaultCorsHeaders,
  createSuccessResponse,
  createListResponse,
  createCreatedResponse,
  createUpdatedResponse,
  createDeletedResponse,
  createAcceptedResponse,
  createEmptyResponse,
  jsonResponseWithContext,
  parsePaginationParams,
  parseSortParams,
  parseFilterParams,
  createBatchResponse,
  createJobStatusResponse
} from '../../../src/utils/response-builder'
import { Context } from 'hono'

describe('response-builder', () => {
  describe('successResponse', () => {
    it('should create success response with data', () => {
      const response = successResponse({ foo: 'bar' })
      const body = JSON.parse(response.body)
      
      expect(response.status).toBe(200)
      expect(body).toEqual({
        success: true,
        data: { foo: 'bar' }
      })
      expect(response.headers['content-type']).toBe('application/json')
    })

    it('should create success response with message', () => {
      const response = successResponse({ foo: 'bar' }, 'Operation successful')
      const body = JSON.parse(response.body)
      
      expect(body.message).toBe('Operation successful')
    })

    it('should create success response with custom status', () => {
      const response = successResponse({ foo: 'bar' }, undefined, 201)
      expect(response.status).toBe(201)
    })

    it('should handle null data', () => {
      const response = successResponse(null)
      const body = JSON.parse(response.body)
      
      expect(body.data).toBeNull()
    })

    it('should handle undefined data', () => {
      const response = successResponse(undefined)
      const body = JSON.parse(response.body)
      
      expect(body.data).toBeUndefined()
    })

    it('should include CORS headers', () => {
      const response = successResponse({ test: 'data' })
      
      expect(response.headers['access-control-allow-origin']).toBe('*')
      expect(response.headers['access-control-allow-methods']).toBeDefined()
    })
  })

  describe('errorResponse', () => {
    it('should create error response', () => {
      const response = errorResponse('Something went wrong', 400)
      const body = JSON.parse(response.body)
      
      expect(response.status).toBe(400)
      expect(body).toEqual({
        success: false,
        error: 'Something went wrong'
      })
    })

    it('should include error code', () => {
      const response = errorResponse('Not found', 404, 'RESOURCE_NOT_FOUND')
      const body = JSON.parse(response.body)
      
      expect(body.code).toBe('RESOURCE_NOT_FOUND')
    })

    it('should include details', () => {
      const details = { field: 'email', reason: 'invalid format' }
      const response = errorResponse('Validation failed', 400, undefined, details)
      const body = JSON.parse(response.body)
      
      expect(body.details).toEqual(details)
    })

    it('should default to 500 status', () => {
      const response = errorResponse('Internal error')
      expect(response.status).toBe(500)
    })

    it('should handle all parameters', () => {
      const response = errorResponse('Error', 403, 'FORBIDDEN', { reason: 'test' })
      const body = JSON.parse(response.body)
      
      expect(response.status).toBe(403)
      expect(body.code).toBe('FORBIDDEN')
      expect(body.details).toEqual({ reason: 'test' })
    })
  })

  describe('paginatedResponse', () => {
    it('should create paginated response', () => {
      const data = [1, 2, 3]
      const response = paginatedResponse(data, 100, 1, 10)
      const body = JSON.parse(response.body)
      
      expect(body).toEqual({
        success: true,
        data,
        pagination: {
          total: 100,
          page: 1,
          pageSize: 10,
          totalPages: 10,
          hasNext: true,
          hasPrev: false
        }
      })
    })

    it('should calculate pagination correctly', () => {
      const response = paginatedResponse([], 25, 3, 10)
      const body = JSON.parse(response.body)
      
      expect(body.pagination).toEqual({
        total: 25,
        page: 3,
        pageSize: 10,
        totalPages: 3,
        hasNext: false,
        hasPrev: true
      })
    })

    it('should handle single page', () => {
      const response = paginatedResponse([1, 2], 2, 1, 10)
      const body = JSON.parse(response.body)
      
      expect(body.pagination.totalPages).toBe(1)
      expect(body.pagination.hasNext).toBe(false)
      expect(body.pagination.hasPrev).toBe(false)
    })

    it('should handle empty data', () => {
      const response = paginatedResponse([], 0, 1, 10)
      const body = JSON.parse(response.body)
      
      expect(body.data).toEqual([])
      expect(body.pagination.total).toBe(0)
      expect(body.pagination.totalPages).toBe(0)
    })

    it('should handle exact page boundary', () => {
      const response = paginatedResponse([], 20, 2, 10)
      const body = JSON.parse(response.body)
      
      expect(body.pagination.totalPages).toBe(2)
      expect(body.pagination.hasNext).toBe(false)
    })
  })

  describe('specialized error responses', () => {
    it('should create validation error response', () => {
      const errors = [{ field: 'email', message: 'Invalid' }]
      const response = validationErrorResponse(errors)
      const body = JSON.parse(response.body)
      
      expect(response.status).toBe(400)
      expect(body.error).toBe('Validation failed')
      expect(body.code).toBe('VALIDATION_ERROR')
      expect(body.details).toEqual({ errors })
    })

    it('should create not found response', () => {
      const response = notFoundResponse('User')
      const body = JSON.parse(response.body)
      
      expect(response.status).toBe(404)
      expect(body.error).toBe('User not found')
      expect(body.code).toBe('NOT_FOUND')
    })

    it('should create unauthorized response with message', () => {
      const response = unauthorizedResponse('Invalid token')
      const body = JSON.parse(response.body)
      
      expect(response.status).toBe(401)
      expect(body.error).toBe('Invalid token')
      expect(body.code).toBe('UNAUTHORIZED')
    })

    it('should create unauthorized response with default message', () => {
      const response = unauthorizedResponse()
      const body = JSON.parse(response.body)
      
      expect(body.error).toBe('Authentication required')
    })

    it('should create forbidden response with message', () => {
      const response = forbiddenResponse('Admin only')
      const body = JSON.parse(response.body)
      
      expect(response.status).toBe(403)
      expect(body.error).toBe('Admin only')
      expect(body.code).toBe('FORBIDDEN')
    })

    it('should create forbidden response with default message', () => {
      const response = forbiddenResponse()
      const body = JSON.parse(response.body)
      
      expect(body.error).toBe('Access denied')
    })

    it('should create conflict response', () => {
      const response = conflictResponse('Email already exists')
      const body = JSON.parse(response.body)
      
      expect(response.status).toBe(409)
      expect(body.error).toBe('Email already exists')
      expect(body.code).toBe('CONFLICT')
    })

    it('should create internal error response with message', () => {
      const response = internalErrorResponse('Database connection failed')
      const body = JSON.parse(response.body)
      
      expect(response.status).toBe(500)
      expect(body.error).toBe('Database connection failed')
      expect(body.code).toBe('INTERNAL_ERROR')
    })

    it('should create internal error response with default message', () => {
      const response = internalErrorResponse()
      const body = JSON.parse(response.body)
      
      expect(body.error).toBe('An unexpected error occurred')
    })
  })

  describe('content type responses', () => {
    it('should create stream response', () => {
      const stream = new ReadableStream()
      const response = streamResponse(stream)
      
      expect(response.status).toBe(200)
      expect(response.body).toBe(stream)
      expect(response.headers['content-type']).toBe('application/octet-stream')
    })

    it('should create stream response with custom content type', () => {
      const stream = new ReadableStream()
      const response = streamResponse(stream, 'video/mp4')
      
      expect(response.headers['content-type']).toBe('video/mp4')
    })

    it('should create JSON response', () => {
      const response = jsonResponse({ foo: 'bar' })
      const body = JSON.parse(response.body)
      
      expect(response.status).toBe(200)
      expect(body).toEqual({ foo: 'bar' })
      expect(response.headers['content-type']).toBe('application/json')
    })

    it('should create JSON response with custom status', () => {
      const response = jsonResponse({ foo: 'bar' }, 201)
      expect(response.status).toBe(201)
    })

    it('should create text response', () => {
      const response = textResponse('Hello World')
      
      expect(response.status).toBe(200)
      expect(response.body).toBe('Hello World')
      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8')
    })

    it('should create text response with custom status', () => {
      const response = textResponse('Created', 201)
      expect(response.status).toBe(201)
    })

    it('should create HTML response', () => {
      const html = '<h1>Hello</h1>'
      const response = htmlResponse(html)
      
      expect(response.status).toBe(200)
      expect(response.body).toBe(html)
      expect(response.headers['content-type']).toBe('text/html; charset=utf-8')
    })

    it('should create HTML response with custom status', () => {
      const response = htmlResponse('<p>Not Found</p>', 404)
      expect(response.status).toBe(404)
    })
  })

  describe('redirect and status responses', () => {
    it('should create redirect response', () => {
      const response = redirectResponse('https://example.com')
      
      expect(response.status).toBe(302)
      expect(response.headers['location']).toBe('https://example.com')
    })

    it('should create permanent redirect', () => {
      const response = redirectResponse('https://example.com', true)
      expect(response.status).toBe(301)
    })

    it('should create no content response', () => {
      const response = noContentResponse()
      
      expect(response.status).toBe(204)
      expect(response.body).toBeNull()
    })

    it('should create created response with data', () => {
      const response = createdResponse({ id: 123 })
      const body = JSON.parse(response.body)
      
      expect(response.status).toBe(201)
      expect(body).toEqual({
        success: true,
        data: { id: 123 }
      })
    })

    it('should create created response with location', () => {
      const response = createdResponse({ id: 123 }, '/api/items/123')
      
      expect(response.headers['location']).toBe('/api/items/123')
    })

    it('should create created response without data', () => {
      const response = createdResponse()
      const body = JSON.parse(response.body)
      
      expect(body.success).toBe(true)
      expect(body.data).toBeUndefined()
    })

    it('should create accepted response', () => {
      const response = acceptedResponse({ jobId: 'abc123' })
      const body = JSON.parse(response.body)
      
      expect(response.status).toBe(202)
      expect(body).toEqual({
        success: true,
        data: { jobId: 'abc123' }
      })
    })

    it('should create accepted response without data', () => {
      const response = acceptedResponse()
      const body = JSON.parse(response.body)
      
      expect(body.success).toBe(true)
      expect(body.data).toBeUndefined()
    })
  })

  describe('header utilities', () => {
    it('should export CORS headers', () => {
      expect(corsHeaders).toEqual({
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'access-control-allow-headers': 'Content-Type, Authorization',
        'access-control-max-age': '86400'
      })
    })

    it('should get CORS headers with custom origin', () => {
      const headers = getCorsHeaders('https://example.com')
      
      expect(headers['access-control-allow-origin']).toBe('https://example.com')
    })

    it('should get CORS headers with default origin', () => {
      const headers = getCorsHeaders()
      
      expect(headers['access-control-allow-origin']).toBe('*')
    })

    it('should append headers to response', () => {
      const response = { 
        status: 200, 
        body: 'test',
        headers: { 'content-type': 'text/plain' }
      }
      
      const newHeaders = { 'x-custom': 'value' }
      const updated = appendHeaders(response, newHeaders)
      
      expect(updated.headers).toEqual({
        'content-type': 'text/plain',
        'x-custom': 'value'
      })
      expect(updated.status).toBe(200)
      expect(updated.body).toBe('test')
    })

    it('should override existing headers', () => {
      const response = { 
        status: 200, 
        body: 'test',
        headers: { 'x-custom': 'old' }
      }
      
      const updated = appendHeaders(response, { 'x-custom': 'new' })
      
      expect(updated.headers['x-custom']).toBe('new')
    })

    it('should handle response without headers', () => {
      const response = { status: 200, body: 'test' } as any
      const updated = appendHeaders(response, { 'x-custom': 'value' })
      
      expect(updated.headers).toEqual({ 'x-custom': 'value' })
    })
  })

  // New API Tests
  describe('defaultCorsHeaders', () => {
    it('should provide default CORS headers', () => {
      expect(defaultCorsHeaders).toEqual({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      })
    })
  })

  describe('createSuccessResponse', () => {
    it('should create success response with data only', () => {
      const response = createSuccessResponse({ id: 1, name: 'test' })
      
      expect(response).toEqual({
        success: true,
        data: { id: 1, name: 'test' }
      })
    })

    it('should create success response with message', () => {
      const response = createSuccessResponse({ id: 1 }, 'Data retrieved')
      
      expect(response).toEqual({
        success: true,
        data: { id: 1 },
        message: 'Data retrieved'
      })
    })

    it('should create success response with metadata', () => {
      const metadata = { version: '1.0', custom: 'value' }
      const response = createSuccessResponse({ id: 1 }, 'Success', metadata)
      
      expect(response.success).toBe(true)
      expect(response.data).toEqual({ id: 1 })
      expect(response.message).toBe('Success')
      expect(response.metadata?.version).toBe('1.0')
      expect(response.metadata?.custom).toBe('value')
      expect(response.metadata?.timestamp).toBeDefined()
    })

    it('should not include message or metadata if not provided', () => {
      const response = createSuccessResponse('data')
      
      expect(response).toEqual({
        success: true,
        data: 'data'
      })
      expect(response.message).toBeUndefined()
      expect(response.metadata).toBeUndefined()
    })
  })

  describe('createListResponse', () => {
    it('should create list response with items only', () => {
      const items = [{ id: 1 }, { id: 2 }]
      const response = createListResponse(items)
      
      expect(response).toEqual({
        success: true,
        data: items,
        metadata: {
          total: 2,
          count: 2
        }
      })
    })

    it('should create list response with explicit total', () => {
      const items = [{ id: 1 }]
      const response = createListResponse(items, 100)
      
      expect(response.metadata.total).toBe(100)
      expect(response.metadata.count).toBe(1)
    })

    it('should create list response with pagination', () => {
      const items = [{ id: 1 }, { id: 2 }]
      const response = createListResponse(items, 50, { page: 2, limit: 10 })
      
      expect(response.metadata.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 50,
        totalPages: 5,
        hasMore: true
      })
    })

    it('should create list response with additional metadata', () => {
      const items = [{ id: 1 }]
      const response = createListResponse(items, 1, undefined, { category: 'test' })
      
      expect(response.metadata.category).toBe('test')
    })

    it('should calculate hasMore correctly for last page', () => {
      const items = [{ id: 1 }]
      const response = createListResponse(items, 21, { page: 3, limit: 10 })
      
      expect(response.metadata.pagination?.hasMore).toBe(false)
      expect(response.metadata.pagination?.totalPages).toBe(3)
    })
  })

  describe('createCreatedResponse', () => {
    it('should create created response with default message', () => {
      const data = { id: 1, name: 'test' }
      const response = createCreatedResponse(data)
      
      expect(response.success).toBe(true)
      expect(response.data).toEqual(data)
      expect(response.message).toBe('Resource created successfully')
      expect(response.metadata?.timestamp).toBeDefined()
    })

    it('should create created response with custom message', () => {
      const response = createCreatedResponse({ id: 1 }, 'User created')
      
      expect(response.message).toBe('User created')
    })

    it('should create created response with location', () => {
      const response = createCreatedResponse({ id: 1 }, 'Created', '/users/1')
      
      expect(response.metadata?.location).toBe('/users/1')
    })
  })

  describe('createUpdatedResponse', () => {
    it('should create updated response with default message', () => {
      const data = { id: 1, name: 'updated' }
      const response = createUpdatedResponse(data)
      
      expect(response.success).toBe(true)
      expect(response.data).toEqual(data)
      expect(response.message).toBe('Resource updated successfully')
    })

    it('should create updated response with custom message', () => {
      const response = createUpdatedResponse({ id: 1 }, 'User updated')
      
      expect(response.message).toBe('User updated')
    })
  })

  describe('createDeletedResponse', () => {
    it('should create deleted response for single item', () => {
      const response = createDeletedResponse('123')
      
      expect(response.success).toBe(true)
      expect(response.data).toEqual({ deleted: '123' })
      expect(response.message).toBe('Resource deleted successfully')
    })

    it('should create deleted response for multiple items', () => {
      const response = createDeletedResponse(['123', '456', '789'])
      
      expect(response.data).toEqual({ deleted: ['123', '456', '789'] })
      expect(response.message).toBe('3 resources deleted successfully')
    })

    it('should create deleted response with custom message', () => {
      const response = createDeletedResponse('123', 'Item removed')
      
      expect(response.message).toBe('Item removed')
    })
  })

  describe('createAcceptedResponse', () => {
    it('should create accepted response with default message', () => {
      const data = { taskId: '123' }
      const response = createAcceptedResponse(data)
      
      expect(response.success).toBe(true)
      expect(response.data).toEqual(data)
      expect(response.message).toBe('Request accepted for processing')
      expect(response.metadata?.timestamp).toBeDefined()
    })

    it('should create accepted response with job ID', () => {
      const response = createAcceptedResponse({ task: 'sync' }, 'Processing started', 'job-456')
      
      expect(response.message).toBe('Processing started')
      expect(response.metadata?.jobId).toBe('job-456')
    })
  })

  describe('createEmptyResponse', () => {
    it('should create empty response with default message', () => {
      const response = createEmptyResponse()
      
      expect(response.success).toBe(true)
      expect(response.data).toBeNull()
      expect(response.message).toBe('Operation completed successfully')
    })

    it('should create empty response with custom message', () => {
      const response = createEmptyResponse('Delete completed')
      
      expect(response.message).toBe('Delete completed')
    })
  })

  describe('createBatchResponse', () => {
    it('should create batch response with only successful items', () => {
      const successful = [{ id: 1 }, { id: 2 }]
      const response = createBatchResponse(successful)
      
      expect(response.success).toBe(true)
      expect(response.data.successful).toEqual(successful)
      expect(response.data.failed).toEqual([])
      expect(response.data.metadata).toEqual({
        total: 2,
        succeeded: 2,
        failed: 0
      })
      expect(response.message).toBe('Batch operation completed: 2 succeeded, 0 failed')
    })

    it('should create batch response with mixed results', () => {
      const successful = [{ id: 1 }]
      const failed = [{ item: { id: 2 }, error: 'Validation failed' }]
      const response = createBatchResponse(successful, failed)
      
      expect(response.data.successful).toEqual(successful)
      expect(response.data.failed).toEqual(failed)
      expect(response.data.metadata).toEqual({
        total: 2,
        succeeded: 1,
        failed: 1
      })
      expect(response.message).toBe('Batch operation completed: 1 succeeded, 1 failed')
    })
  })

  describe('createJobStatusResponse', () => {
    it('should create job status response', () => {
      const jobStatus = {
        jobId: 'job-123',
        status: 'processing' as const,
        progress: { current: 5, total: 10, percentage: 50 },
        startedAt: '2023-01-01T10:00:00Z'
      }
      
      const response = createJobStatusResponse(jobStatus)
      
      expect(response.success).toBe(true)
      expect(response.data).toEqual(jobStatus)
      expect(response.metadata?.timestamp).toBeDefined()
    })

    it('should create completed job status response', () => {
      const jobStatus = {
        jobId: 'job-456',
        status: 'completed' as const,
        result: { processed: 100 },
        completedAt: '2023-01-01T11:00:00Z'
      }
      
      const response = createJobStatusResponse(jobStatus)
      
      expect(response.data.status).toBe('completed')
      expect(response.data.result).toEqual({ processed: 100 })
    })
  })

  describe('jsonResponseWithContext', () => {
    const createMockContext = (status?: number) => ({
      json: (data: any, statusCode?: number) => ({
        data,
        status: statusCode || 200
      })
    }) as any

    it('should call context json with default status', () => {
      const ctx = createMockContext()
      const data = createSuccessResponse({ id: 1 })
      
      const response = jsonResponseWithContext(ctx, data)
      
      expect(response.data).toEqual(data)
      expect(response.status).toBe(200)
    })

    it('should call context json with custom status', () => {
      const ctx = createMockContext()
      const data = createSuccessResponse({ id: 1 })
      
      const response = jsonResponseWithContext(ctx, data, 201)
      
      expect(response.status).toBe(201)
    })
  })

  describe('parsePaginationParams', () => {
    const createMockContext = (query: Record<string, string>) => ({
      req: {
        query: () => query
      }
    }) as Context

    it('should parse pagination with default values', () => {
      const ctx = createMockContext({})
      const params = parsePaginationParams(ctx)
      
      expect(params).toEqual({
        page: 1,
        limit: 20,
        offset: 0
      })
    })

    it('should parse pagination with custom values', () => {
      const ctx = createMockContext({ page: '3', limit: '10' })
      const params = parsePaginationParams(ctx)
      
      expect(params).toEqual({
        page: 3,
        limit: 10,
        offset: 20
      })
    })

    it('should enforce minimum page value', () => {
      const ctx = createMockContext({ page: '-1' })
      const params = parsePaginationParams(ctx)
      
      expect(params.page).toBe(1)
      expect(params.offset).toBe(0)
    })

    it('should enforce minimum and maximum limit values', () => {
      const ctx = createMockContext({ limit: '200' })
      const params = parsePaginationParams(ctx, { page: 1, limit: 20, maxLimit: 100 })
      
      expect(params.limit).toBe(100)
    })

    it('should enforce minimum limit value', () => {
      const ctx = createMockContext({ limit: '0' })
      const params = parsePaginationParams(ctx)
      
      expect(params.limit).toBe(1)
    })

    it('should use custom defaults', () => {
      const ctx = createMockContext({})
      const params = parsePaginationParams(ctx, { page: 2, limit: 50, maxLimit: 200 })
      
      expect(params).toEqual({
        page: 2,
        limit: 50,
        offset: 50
      })
    })
  })

  describe('parseSortParams', () => {
    const createMockContext = (query: Record<string, string>) => ({
      req: {
        query: () => query
      }
    }) as Context

    it('should parse sort with default values', () => {
      const ctx = createMockContext({})
      const params = parseSortParams(ctx, ['name', 'createdAt'])
      
      expect(params).toEqual({
        field: 'createdAt',
        order: 'desc'
      })
    })

    it('should parse sort with custom values using sortBy', () => {
      const ctx = createMockContext({ sortBy: 'name', order: 'asc' })
      const params = parseSortParams(ctx, ['name', 'createdAt'])
      
      expect(params).toEqual({
        field: 'name',
        order: 'asc'
      })
    })

    it('should parse sort with custom values using sort', () => {
      const ctx = createMockContext({ sort: 'name', sortOrder: 'asc' })
      const params = parseSortParams(ctx, ['name', 'createdAt'])
      
      expect(params).toEqual({
        field: 'name',
        order: 'asc'
      })
    })

    it('should use default when field not allowed', () => {
      const ctx = createMockContext({ sortBy: 'invalid' })
      const params = parseSortParams(ctx, ['name', 'createdAt'])
      
      expect(params).toEqual({
        field: 'createdAt',
        order: 'desc'
      })
    })

    it('should use default order when invalid', () => {
      const ctx = createMockContext({ sortBy: 'name', order: 'invalid' })
      const params = parseSortParams(ctx, ['name', 'createdAt'])
      
      expect(params).toEqual({
        field: 'name',
        order: 'desc'
      })
    })

    it('should use custom defaults', () => {
      const ctx = createMockContext({})
      const params = parseSortParams(ctx, ['title', 'updatedAt'], { field: 'title', order: 'asc' })
      
      expect(params).toEqual({
        field: 'title',
        order: 'asc'
      })
    })
  })

  describe('parseFilterParams', () => {
    const createMockContext = (query: Record<string, string>) => ({
      req: {
        query: () => query
      }
    }) as Context

    it('should parse filters with allowed fields', () => {
      const ctx = createMockContext({ 
        status: 'active',
        category: 'test',
        invalid: 'ignored'
      })
      const filters = parseFilterParams(ctx, ['status', 'category'])
      
      expect(filters).toEqual({
        status: 'active',
        category: 'test'
      })
    })

    it('should return empty object when no allowed filters', () => {
      const ctx = createMockContext({ status: 'active' })
      const filters = parseFilterParams(ctx, [])
      
      expect(filters).toEqual({})
    })

    it('should ignore undefined values', () => {
      const ctx = createMockContext({})
      const filters = parseFilterParams(ctx, ['status', 'category'])
      
      expect(filters).toEqual({})
    })
  })
})