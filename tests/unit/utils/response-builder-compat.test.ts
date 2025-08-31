import { describe, it, expect } from 'vitest'
import {
  corsHeaders,
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
  appendHeaders
} from '../../../src/utils/response-builder-compat'

describe('Response Builder Compat', () => {
  describe('corsHeaders', () => {
    it('should have correct CORS headers', () => {
      expect(corsHeaders).toEqual({
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'access-control-allow-headers': 'Content-Type, Authorization',
        'access-control-max-age': '86400'
      })
    })
  })

  describe('successResponse', () => {
    it('should create success response with data only', () => {
      const response = successResponse({ id: 1, name: 'test' })

      expect(response).toEqual({
        status: 200,
        body: JSON.stringify({ success: true, data: { id: 1, name: 'test' } }),
        headers: {
          'content-type': 'application/json',
          ...corsHeaders
        }
      })
    })

    it('should create success response with data and message', () => {
      const response = successResponse({ id: 1 }, 'Success message')

      const body = JSON.parse(response.body)
      expect(body.message).toBe('Success message')
      expect(body.success).toBe(true)
      expect(body.data).toEqual({ id: 1 })
    })

    it('should create success response with custom status', () => {
      const response = successResponse({ id: 1 }, undefined, 201)

      expect(response.status).toBe(201)
    })
  })

  describe('errorResponse', () => {
    it('should create basic error response', () => {
      const response = errorResponse('Error message')

      expect(response).toEqual({
        status: 500,
        body: JSON.stringify({ success: false, error: 'Error message' }),
        headers: {
          'content-type': 'application/json',
          ...corsHeaders
        }
      })
    })

    it('should create error response with custom status and code', () => {
      const response = errorResponse('Not found', 404, 'NOT_FOUND')

      const body = JSON.parse(response.body)
      expect(response.status).toBe(404)
      expect(body.code).toBe('NOT_FOUND')
      expect(body.error).toBe('Not found')
    })

    it('should create error response with details', () => {
      const response = errorResponse('Validation failed', 400, 'VALIDATION_ERROR', { field: 'name' })

      const body = JSON.parse(response.body)
      expect(body.details).toEqual({ field: 'name' })
    })
  })

  describe('paginatedResponse', () => {
    it('should create paginated response', () => {
      const data = [{ id: 1 }, { id: 2 }]
      const response = paginatedResponse(data, 10, 1, 5)

      const body = JSON.parse(response.body)
      expect(body.success).toBe(true)
      expect(body.data).toEqual(data)
      expect(body.pagination).toEqual({
        total: 10,
        page: 1,
        pageSize: 5,
        totalPages: 2,
        hasNext: true,
        hasPrev: false
      })
    })

    it('should create paginated response with message', () => {
      const response = paginatedResponse([], 0, 1, 10, 'No results found')

      const body = JSON.parse(response.body)
      expect(body.message).toBe('No results found')
    })

    it('should calculate pagination correctly for last page', () => {
      const response = paginatedResponse([], 15, 3, 5)

      const body = JSON.parse(response.body)
      expect(body.pagination).toEqual({
        total: 15,
        page: 3,
        pageSize: 5,
        totalPages: 3,
        hasNext: false,
        hasPrev: true
      })
    })
  })

  describe('validationErrorResponse', () => {
    it('should create validation error response', () => {
      const errors = [{ field: 'name', message: 'Required' }]
      const response = validationErrorResponse(errors)

      expect(response.status).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.code).toBe('VALIDATION_ERROR')
      expect(body.details.errors).toEqual(errors)
    })

    it('should create validation error response with custom message', () => {
      const response = validationErrorResponse([], 'Custom validation message')

      const body = JSON.parse(response.body)
      expect(body.error).toBe('Custom validation message')
    })
  })

  describe('notFoundResponse', () => {
    it('should create not found response with default message', () => {
      const response = notFoundResponse()

      expect(response.status).toBe(404)
      const body = JSON.parse(response.body)
      expect(body.error).toBe('Resource not found')
      expect(body.code).toBe('NOT_FOUND')
    })

    it('should create not found response with resource name', () => {
      const response = notFoundResponse('User')

      const body = JSON.parse(response.body)
      expect(body.error).toBe('User not found')
    })
  })

  describe('unauthorizedResponse', () => {
    it('should create unauthorized response with default message', () => {
      const response = unauthorizedResponse()

      expect(response.status).toBe(401)
      const body = JSON.parse(response.body)
      expect(body.error).toBe('Authentication required')
      expect(body.code).toBe('UNAUTHORIZED')
    })

    it('should create unauthorized response with custom message', () => {
      const response = unauthorizedResponse('Invalid token')

      const body = JSON.parse(response.body)
      expect(body.error).toBe('Invalid token')
    })
  })

  describe('forbiddenResponse', () => {
    it('should create forbidden response with default message', () => {
      const response = forbiddenResponse()

      expect(response.status).toBe(403)
      const body = JSON.parse(response.body)
      expect(body.error).toBe('Access denied')
      expect(body.code).toBe('FORBIDDEN')
    })

    it('should create forbidden response with custom message', () => {
      const response = forbiddenResponse('Insufficient permissions')

      const body = JSON.parse(response.body)
      expect(body.error).toBe('Insufficient permissions')
    })
  })

  describe('conflictResponse', () => {
    it('should create conflict response with default message', () => {
      const response = conflictResponse()

      expect(response.status).toBe(409)
      const body = JSON.parse(response.body)
      expect(body.error).toBe('Conflict')
      expect(body.code).toBe('CONFLICT')
    })

    it('should create conflict response with custom message and details', () => {
      const response = conflictResponse('Resource already exists', { resource: 'user' })

      const body = JSON.parse(response.body)
      expect(body.error).toBe('Resource already exists')
      expect(body.details).toEqual({ resource: 'user' })
    })
  })

  describe('internalErrorResponse', () => {
    it('should create internal error response with default message', () => {
      const response = internalErrorResponse()

      expect(response.status).toBe(500)
      const body = JSON.parse(response.body)
      expect(body.error).toBe('An unexpected error occurred')
      expect(body.code).toBe('INTERNAL_ERROR')
    })

    it('should create internal error response with custom message and details', () => {
      const response = internalErrorResponse('Database error', { query: 'SELECT * FROM users' })

      const body = JSON.parse(response.body)
      expect(body.error).toBe('Database error')
      expect(body.details).toEqual({ query: 'SELECT * FROM users' })
    })
  })

  describe('streamResponse', () => {
    it('should create stream response with default content type', () => {
      const stream = new ReadableStream()
      const response = streamResponse(stream)

      expect(response.status).toBe(200)
      expect(response.body).toBe(stream)
      expect(response.headers['content-type']).toBe('application/octet-stream')
    })

    it('should create stream response with custom content type', () => {
      const stream = new ReadableStream()
      const response = streamResponse(stream, 'text/plain')

      expect(response.headers['content-type']).toBe('text/plain')
    })
  })

  describe('jsonResponse', () => {
    it('should create JSON response with default status', () => {
      const data = { test: 'value' }
      const response = jsonResponse(data)

      expect(response.status).toBe(200)
      expect(response.body).toBe(JSON.stringify(data))
      expect(response.headers['content-type']).toBe('application/json')
    })

    it('should create JSON response with custom status', () => {
      const response = jsonResponse({ test: 'value' }, 201)

      expect(response.status).toBe(201)
    })
  })

  describe('textResponse', () => {
    it('should create text response', () => {
      const response = textResponse('Hello, World!')

      expect(response.status).toBe(200)
      expect(response.body).toBe('Hello, World!')
      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8')
    })

    it('should create text response with custom status', () => {
      const response = textResponse('Error text', 500)

      expect(response.status).toBe(500)
      expect(response.body).toBe('Error text')
    })
  })

  describe('htmlResponse', () => {
    it('should create HTML response', () => {
      const html = '<h1>Hello</h1>'
      const response = htmlResponse(html)

      expect(response.status).toBe(200)
      expect(response.body).toBe(html)
      expect(response.headers['content-type']).toBe('text/html; charset=utf-8')
    })

    it('should create HTML response with custom status', () => {
      const response = htmlResponse('<h1>Not Found</h1>', 404)

      expect(response.status).toBe(404)
    })
  })

  describe('redirectResponse', () => {
    it('should create temporary redirect response', () => {
      const response = redirectResponse('https://example.com')

      expect(response.status).toBe(302)
      expect(response.body).toBe('')
      expect(response.headers.location).toBe('https://example.com')
    })

    it('should create permanent redirect response', () => {
      const response = redirectResponse('https://example.com', true)

      expect(response.status).toBe(301)
      expect(response.headers.location).toBe('https://example.com')
    })
  })

  describe('noContentResponse', () => {
    it('should create no content response', () => {
      const response = noContentResponse()

      expect(response.status).toBe(204)
      expect(response.body).toBeNull()
      expect(response.headers).toEqual(corsHeaders)
    })
  })

  describe('createdResponse', () => {
    it('should create created response without data', () => {
      const response = createdResponse()

      expect(response.status).toBe(201)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(true)
      expect(body.data).toBeUndefined()
    })

    it('should create created response with data', () => {
      const data = { id: 1, name: 'Created item' }
      const response = createdResponse(data)

      const body = JSON.parse(response.body)
      expect(body.data).toEqual(data)
    })

    it('should create created response with location header', () => {
      const response = createdResponse({ id: 1 }, '/items/1')

      expect(response.headers.location).toBe('/items/1')
    })
  })

  describe('acceptedResponse', () => {
    it('should create accepted response without data', () => {
      const response = acceptedResponse()

      expect(response.status).toBe(202)
      const body = JSON.parse(response.body)
      expect(body.success).toBe(true)
      expect(body.data).toBeUndefined()
    })

    it('should create accepted response with data', () => {
      const data = { jobId: 'job-123' }
      const response = acceptedResponse(data)

      const body = JSON.parse(response.body)
      expect(body.data).toEqual(data)
    })
  })

  describe('getCorsHeaders', () => {
    it('should return CORS headers with default origin', () => {
      const headers = getCorsHeaders()

      expect(headers).toEqual({
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'access-control-allow-headers': 'Content-Type, Authorization',
        'access-control-max-age': '86400'
      })
    })

    it('should return CORS headers with custom origin', () => {
      const headers = getCorsHeaders('https://example.com')

      expect(headers['access-control-allow-origin']).toBe('https://example.com')
    })
  })

  describe('appendHeaders', () => {
    it('should append headers to response', () => {
      const originalResponse = {
        status: 200,
        body: 'test',
        headers: { 'content-type': 'text/plain' }
      }

      const response = appendHeaders(originalResponse, { 'custom-header': 'value' })

      expect(response.headers).toEqual({
        'content-type': 'text/plain',
        'custom-header': 'value'
      })
    })

    it('should append headers to response without existing headers', () => {
      const originalResponse = {
        status: 200,
        body: 'test'
      }

      const response = appendHeaders(originalResponse, { 'custom-header': 'value' })

      expect(response.headers).toEqual({
        'custom-header': 'value'
      })
    })

    it('should override existing headers', () => {
      const originalResponse = {
        status: 200,
        body: 'test',
        headers: { 'content-type': 'text/plain' }
      }

      const response = appendHeaders(originalResponse, { 'content-type': 'application/json' })

      expect(response.headers['content-type']).toBe('application/json')
    })
  })
})