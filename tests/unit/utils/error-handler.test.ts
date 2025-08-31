import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  AppError,
  ErrorCodes,
  createErrorResponse,
  getStatusCode,
  logError,
  getErrorMessage,
  handleAsync,
  isRetryableError
} from '../../../src/utils/error-handler'

describe('Error Handler Utils', () => {
  let mockContext: Partial<Context>
  let consoleErrorSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    mockContext = {
      req: {
        path: '/test',
        method: 'GET',
        query: vi.fn().mockReturnValue({ param: 'value' })
      } as any,
      env: {}
    }
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('AppError', () => {
    it('should create AppError with required parameters', () => {
      const error = new AppError(ErrorCodes.VALIDATION_ERROR, 'Test message', 400)

      expect(error.code).toBe(ErrorCodes.VALIDATION_ERROR)
      expect(error.message).toBe('Test message')
      expect(error.statusCode).toBe(400)
      expect(error.name).toBe('AppError')
    })

    it('should create AppError with default status code', () => {
      const error = new AppError(ErrorCodes.INTERNAL_ERROR, 'Test message')

      expect(error.statusCode).toBe(500)
    })

    it('should create AppError with details', () => {
      const details = { field: 'test', value: 123 }
      const error = new AppError(ErrorCodes.VALIDATION_ERROR, 'Test message', 400, details)

      expect(error.details).toEqual(details)
    })

    it('should serialize to JSON correctly', () => {
      const error = new AppError(ErrorCodes.NOT_FOUND, 'Resource not found', 404, { id: 123 })
      const json = error.toJSON()

      expect(json).toEqual({
        success: false,
        error: ErrorCodes.NOT_FOUND,
        message: 'Resource not found',
        details: { id: 123 }
      })
    })

    it('should serialize to JSON without details when not provided', () => {
      const error = new AppError(ErrorCodes.UNAUTHORIZED, 'Access denied', 401)
      const json = error.toJSON()

      expect(json).toEqual({
        success: false,
        error: ErrorCodes.UNAUTHORIZED,
        message: 'Access denied'
      })
    })
  })

  describe('createErrorResponse', () => {
    it('should create response from AppError', () => {
      const error = new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400, { field: 'name' })
      const response = createErrorResponse(error, mockContext as Context)

      expect(response).toEqual({
        success: false,
        error: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed',
        details: { field: 'name' },
        timestamp: expect.any(String),
        path: '/test'
      })
    })

    it('should create response from HTTPException', () => {
      const error = new HTTPException(404, { message: 'Not found' })
      const response = createErrorResponse(error, mockContext as Context)

      expect(response).toEqual({
        success: false,
        error: ErrorCodes.NOT_FOUND,
        message: 'Not found',
        timestamp: expect.any(String),
        path: '/test'
      })
    })

    it('should create response from generic Error with Vectorize message', () => {
      const error = new Error('Vectorize operation failed')
      const response = createErrorResponse(error)

      expect(response).toEqual({
        success: false,
        error: ErrorCodes.VECTORIZE_ERROR,
        message: 'Vectorize operation failed'
      })
    })

    it('should create response from generic Error with Notion message', () => {
      const error = new Error('Notion API request failed')
      const response = createErrorResponse(error)

      expect(response).toEqual({
        success: false,
        error: ErrorCodes.NOTION_API_ERROR,
        message: 'Notion API request failed'
      })
    })

    it('should create response from generic Error with AI message', () => {
      const error = new Error('AI service is down')
      const response = createErrorResponse(error)

      expect(response).toEqual({
        success: false,
        error: ErrorCodes.AI_SERVICE_ERROR,
        message: 'AI service is down'
      })
    })

    it('should create response from generic Error with Workflow message', () => {
      const error = new Error('Workflow execution failed')
      const response = createErrorResponse(error)

      expect(response).toEqual({
        success: false,
        error: ErrorCodes.WORKFLOW_ERROR,
        message: 'Workflow execution failed'
      })
    })

    it('should create response from generic Error with validation message', () => {
      const error = new Error('validation error occurred')
      const response = createErrorResponse(error)

      expect(response).toEqual({
        success: false,
        error: ErrorCodes.VALIDATION_ERROR,
        message: 'validation error occurred'
      })
    })

    it('should create response from generic Error with not found message', () => {
      const error = new Error('resource not found')
      const response = createErrorResponse(error)

      expect(response).toEqual({
        success: false,
        error: ErrorCodes.NOT_FOUND,
        message: 'resource not found'
      })
    })

    it('should create response from unknown error', () => {
      const error = 'string error'
      const response = createErrorResponse(error, mockContext as Context)

      expect(response).toEqual({
        success: false,
        error: ErrorCodes.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
        details: 'string error',
        timestamp: expect.any(String),
        path: '/test'
      })
    })

    it('should create response without context', () => {
      const error = new AppError(ErrorCodes.BAD_REQUEST, 'Invalid input', 400)
      const response = createErrorResponse(error)

      expect(response).toEqual({
        success: false,
        error: ErrorCodes.BAD_REQUEST,
        message: 'Invalid input'
      })
    })
  })

  describe('getStatusCode', () => {
    it('should return status code from AppError', () => {
      const error = new AppError(ErrorCodes.NOT_FOUND, 'Not found', 404)
      expect(getStatusCode(error)).toBe(404)
    })

    it('should return status code from HTTPException', () => {
      const error = new HTTPException(403)
      expect(getStatusCode(error)).toBe(403)
    })

    it('should return 400 for validation errors', () => {
      const error = new Error('validation failed')
      expect(getStatusCode(error)).toBe(400)
    })

    it('should return 401 for unauthorized errors', () => {
      const error = new Error('unauthorized access')
      expect(getStatusCode(error)).toBe(401)
    })

    it('should return 403 for forbidden errors', () => {
      const error = new Error('forbidden operation')
      expect(getStatusCode(error)).toBe(403)
    })

    it('should return 404 for not found errors', () => {
      const error = new Error('resource not found')
      expect(getStatusCode(error)).toBe(404)
    })

    it('should return 409 for conflict errors', () => {
      const error = new Error('conflict detected')
      expect(getStatusCode(error)).toBe(409)
    })

    it('should return 500 for generic errors', () => {
      const error = new Error('generic error')
      expect(getStatusCode(error)).toBe(500)
    })

    it('should return 500 for unknown errors', () => {
      expect(getStatusCode('string error')).toBe(500)
    })
  })

  describe('logError', () => {
    it('should log error in production format', () => {
      mockContext.env!.ENVIRONMENT = 'production'
      const error = new AppError(ErrorCodes.VALIDATION_ERROR, 'Test error', 400)
      
      logError(error, mockContext as Context, { additional: 'info' })

      expect(consoleErrorSpy).toHaveBeenCalled()
      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0])
      
      expect(loggedData).toMatchObject({
        timestamp: expect.any(String),
        path: '/test',
        method: 'GET',
        query: { param: 'value' },
        error: {
          name: 'AppError',
          message: 'Test error',
          code: ErrorCodes.VALIDATION_ERROR,
          statusCode: 400
        },
        additional: 'info'
      })
    })

    it('should log error in development format', () => {
      mockContext.env!.ENVIRONMENT = 'development'
      const error = new Error('Development error')
      
      logError(error, mockContext as Context)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', expect.any(Object))
    })

    it('should log error without context', () => {
      const error = new Error('No context error')
      
      logError(error)

      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should handle non-Error objects', () => {
      logError('string error', mockContext as Context)

      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('getErrorMessage', () => {
    it('should return message from Error object', () => {
      const error = new Error('Test error message')
      expect(getErrorMessage(error)).toBe('Test error message')
    })

    it('should return string error as is', () => {
      expect(getErrorMessage('String error')).toBe('String error')
    })

    it('should extract message from object with message property', () => {
      const error = { message: 'Object error message' }
      expect(getErrorMessage(error)).toBe('Object error message')
    })

    it('should return default message for unknown error types', () => {
      expect(getErrorMessage(null)).toBe('An unexpected error occurred')
      expect(getErrorMessage(undefined)).toBe('An unexpected error occurred')
      expect(getErrorMessage(123)).toBe('An unexpected error occurred')
      expect(getErrorMessage({})).toBe('An unexpected error occurred')
    })
  })

  describe('handleAsync', () => {
    it('should return result when function succeeds', async () => {
      const successFn = vi.fn().mockResolvedValue('success')
      
      const [result, error] = await handleAsync(successFn)

      expect(result).toBe('success')
      expect(error).toBeNull()
    })

    it('should return AppError when function throws AppError', async () => {
      const appError = new AppError(ErrorCodes.NOT_FOUND, 'Not found', 404)
      const failFn = vi.fn().mockRejectedValue(appError)
      
      const [result, error] = await handleAsync(failFn)

      expect(result).toBeNull()
      expect(error).toBe(appError)
    })

    it('should wrap generic Error in AppError', async () => {
      const genericError = new Error('Generic error')
      const failFn = vi.fn().mockRejectedValue(genericError)
      
      const [result, error] = await handleAsync(failFn, 'Custom error message')

      expect(result).toBeNull()
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe(ErrorCodes.INTERNAL_ERROR)
      expect((error as AppError).message).toBe('Custom error message')
      expect((error as AppError).details).toBe(genericError)
    })

    it('should use default error message when not provided', async () => {
      const genericError = new Error('Original error')
      const failFn = vi.fn().mockRejectedValue(genericError)
      
      const [result, error] = await handleAsync(failFn)

      expect(result).toBeNull()
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).message).toBe('Original error')
    })
  })

  describe('isRetryableError', () => {
    it('should return true for retryable AppError codes', () => {
      const serviceError = new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Service down', 503)
      const timeoutError = new AppError(ErrorCodes.TIMEOUT, 'Request timeout', 408)
      const externalError = new AppError(ErrorCodes.EXTERNAL_API_ERROR, 'API error', 500)

      expect(isRetryableError(serviceError)).toBe(true)
      expect(isRetryableError(timeoutError)).toBe(true)
      expect(isRetryableError(externalError)).toBe(true)
    })

    it('should return false for non-retryable AppError codes', () => {
      const validationError = new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid input', 400)
      const notFoundError = new AppError(ErrorCodes.NOT_FOUND, 'Not found', 404)

      expect(isRetryableError(validationError)).toBe(false)
      expect(isRetryableError(notFoundError)).toBe(false)
    })

    it('should return true for retryable Error messages', () => {
      const timeoutError = new Error('Request timeout occurred')
      const unavailableError = new Error('Service temporarily unavailable')
      const rateLimitError = new Error('rate limit exceeded')

      expect(isRetryableError(timeoutError)).toBe(true)
      expect(isRetryableError(unavailableError)).toBe(true)
      expect(isRetryableError(rateLimitError)).toBe(true)
    })

    it('should return false for non-retryable Error messages', () => {
      const genericError = new Error('Generic error')
      const validationError = new Error('Invalid input')

      expect(isRetryableError(genericError)).toBe(false)
      expect(isRetryableError(validationError)).toBe(false)
    })

    it('should return false for non-Error objects', () => {
      expect(isRetryableError('string error')).toBe(false)
      expect(isRetryableError(null)).toBe(false)
      expect(isRetryableError(undefined)).toBe(false)
      expect(isRetryableError({})).toBe(false)
    })
  })
})