import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { errorMiddleware, notFoundHandler, devErrorMiddleware } from '../../../src/middleware/error'
import { AppError, ErrorCodes } from '../../../src/utils/error-handler'

// error-handlerモジュールをモック
vi.mock('../../../src/utils/error-handler', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    logError: vi.fn(),
    createErrorResponse: vi.fn(),
    getStatusCode: vi.fn()
  }
})

// モック化されたerror-handlerの関数をimport
import { logError, createErrorResponse, getStatusCode } from '../../../src/utils/error-handler'

describe('Error Middleware', () => {
  let mockContext: Partial<Context>
  let mockNext: Next
  let mockEnv: Record<string, string>

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockEnv = {}
    
    mockContext = {
      req: {
        url: 'https://example.com/test',
        method: 'GET',
        path: '/test',
        query: vi.fn().mockReturnValue({}),
        raw: {
          headers: new Headers({
            'Content-Type': 'application/json',
            'User-Agent': 'test-agent'
          })
        }
      } as any,
      env: mockEnv,
      json: vi.fn()
    }
    
    mockNext = vi.fn()
  })

  describe('errorMiddleware', () => {
    it('should continue execution when no error occurs', async () => {
      mockNext.mockResolvedValue(undefined)

      await errorMiddleware(mockContext as Context, mockNext)

      expect(mockNext).toHaveBeenCalled()
      expect(logError).not.toHaveBeenCalled()
    })

    it('should handle AppError correctly', async () => {
      const testError = new AppError(ErrorCodes.VALIDATION_ERROR, 'テストエラー', 400)
      mockNext.mockRejectedValue(testError)
      
      const mockErrorResponse = {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'テストエラー'
      }
      
      ;(createErrorResponse as any).mockReturnValue(mockErrorResponse)
      ;(getStatusCode as any).mockReturnValue(400)

      const result = await errorMiddleware(mockContext as Context, mockNext)

      expect(logError).toHaveBeenCalledWith(testError, mockContext, {
        url: 'https://example.com/test',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'test-agent'
        }
      })
      expect(createErrorResponse).toHaveBeenCalledWith(testError, mockContext)
      expect(getStatusCode).toHaveBeenCalledWith(testError)
      expect(mockContext.json).toHaveBeenCalledWith(mockErrorResponse, 400)
    })

    it('should handle HTTPException correctly', async () => {
      const testError = new HTTPException(500, { message: 'HTTPエラー' })
      mockNext.mockRejectedValue(testError)
      
      const mockErrorResponse = {
        success: false,
        error: 'Internal Server Error',
        message: 'HTTPエラー'
      }
      
      ;(createErrorResponse as any).mockReturnValue(mockErrorResponse)
      ;(getStatusCode as any).mockReturnValue(500)

      await errorMiddleware(mockContext as Context, mockNext)

      expect(logError).toHaveBeenCalledWith(testError, mockContext, expect.any(Object))
      expect(createErrorResponse).toHaveBeenCalledWith(testError, mockContext)
      expect(mockContext.json).toHaveBeenCalledWith(mockErrorResponse, 500)
    })

    it('should handle generic Error correctly', async () => {
      const testError = new Error('一般的なエラー')
      mockNext.mockRejectedValue(testError)
      
      const mockErrorResponse = {
        success: false,
        error: 'Internal Server Error',
        message: '一般的なエラー'
      }
      
      ;(createErrorResponse as any).mockReturnValue(mockErrorResponse)
      ;(getStatusCode as any).mockReturnValue(500)

      await errorMiddleware(mockContext as Context, mockNext)

      expect(logError).toHaveBeenCalledWith(testError, mockContext, expect.any(Object))
      expect(createErrorResponse).toHaveBeenCalledWith(testError, mockContext)
      expect(mockContext.json).toHaveBeenCalledWith(mockErrorResponse, 500)
    })

    it('should handle non-Error exceptions', async () => {
      const testError = 'string error'
      mockNext.mockRejectedValue(testError)
      
      const mockErrorResponse = {
        success: false,
        error: 'Internal Server Error',
        message: 'Unknown error occurred'
      }
      
      ;(createErrorResponse as any).mockReturnValue(mockErrorResponse)
      ;(getStatusCode as any).mockReturnValue(500)

      await errorMiddleware(mockContext as Context, mockNext)

      expect(logError).toHaveBeenCalledWith(testError, mockContext, expect.any(Object))
      expect(createErrorResponse).toHaveBeenCalledWith(testError, mockContext)
      expect(mockContext.json).toHaveBeenCalledWith(mockErrorResponse, 500)
    })

    it('should include request headers in error context', async () => {
      const testError = new Error('ヘッダーテスト')
      mockNext.mockRejectedValue(testError)
      
      ;(createErrorResponse as any).mockReturnValue({})
      ;(getStatusCode as any).mockReturnValue(500)

      await errorMiddleware(mockContext as Context, mockNext)

      expect(logError).toHaveBeenCalledWith(testError, mockContext, {
        url: 'https://example.com/test',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'test-agent'
        }
      })
    })
  })

  describe('notFoundHandler', () => {
    beforeEach(() => {
      mockContext.req!.method = 'POST'
      mockContext.req!.path = '/nonexistent'
    })

    it('should create 404 error for not found routes', () => {
      const mockErrorResponse = {
        success: false,
        error: 'NOT_FOUND',
        message: 'Route not found: POST /nonexistent'
      }
      
      ;(createErrorResponse as any).mockReturnValue(mockErrorResponse)

      const result = notFoundHandler(mockContext as Context)

      expect(createErrorResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: 'Route not found: POST /nonexistent',
          statusCode: 404
        }),
        mockContext
      )
      expect(mockContext.json).toHaveBeenCalledWith(mockErrorResponse, 404)
    })

    it('should handle different HTTP methods correctly', () => {
      mockContext.req!.method = 'DELETE'
      mockContext.req!.path = '/api/users/123'
      
      const mockErrorResponse = {
        success: false,
        error: 'NOT_FOUND',
        message: 'Route not found: DELETE /api/users/123'
      }
      
      ;(createErrorResponse as any).mockReturnValue(mockErrorResponse)

      notFoundHandler(mockContext as Context)

      expect(createErrorResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Route not found: DELETE /api/users/123'
        }),
        mockContext
      )
    })
  })

  describe('devErrorMiddleware', () => {
    beforeEach(() => {
      mockContext.req!.query = vi.fn().mockReturnValue({ param: 'value' })
    })

    it('should continue execution when no error occurs', async () => {
      mockNext.mockResolvedValue(undefined)

      await devErrorMiddleware(mockContext as Context, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should return detailed error in development environment', async () => {
      mockEnv.ENVIRONMENT = 'development'
      const testError = new Error('開発環境テストエラー')
      testError.stack = 'Error: test\n    at line1\n    at line2'
      mockNext.mockRejectedValue(testError)
      
      ;(getStatusCode as any).mockReturnValue(500)

      await devErrorMiddleware(mockContext as Context, mockNext)

      expect(mockContext.json).toHaveBeenCalledWith({
        success: false,
        error: 'Error',
        message: '開発環境テストエラー',
        stack: ['Error: test', '    at line1', '    at line2'],
        timestamp: expect.any(String),
        path: '/test',
        method: 'GET',
        query: { param: 'value' },
        headers: {
          'content-type': 'application/json',
          'user-agent': 'test-agent'
        }
      }, 500)
    })

    it('should forward error in production environment', async () => {
      mockEnv.ENVIRONMENT = 'production'
      const testError = new Error('本番環境エラー')
      mockNext.mockRejectedValue(testError)

      await expect(devErrorMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow('本番環境エラー')
    })

    it('should forward error when environment not set', async () => {
      // ENVIRONMENT環境変数が設定されていない場合
      const testError = new Error('環境未設定エラー')
      mockNext.mockRejectedValue(testError)

      await expect(devErrorMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow('環境未設定エラー')
    })

    it('should handle non-Error exceptions in development', async () => {
      mockEnv.ENVIRONMENT = 'development'
      const testError = 'string error in dev'
      mockNext.mockRejectedValue(testError)

      await expect(devErrorMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow()
    })

    it('should include timestamp in development error response', async () => {
      mockEnv.ENVIRONMENT = 'development'
      const testError = new Error('タイムスタンプテスト')
      mockNext.mockRejectedValue(testError)
      
      ;(getStatusCode as any).mockReturnValue(400)

      const beforeTime = new Date().toISOString()
      await devErrorMiddleware(mockContext as Context, mockNext)
      const afterTime = new Date().toISOString()

      const callArgs = (mockContext.json as any).mock.calls[0][0]
      expect(callArgs.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(callArgs.timestamp >= beforeTime).toBe(true)
      expect(callArgs.timestamp <= afterTime).toBe(true)
    })
  })
})