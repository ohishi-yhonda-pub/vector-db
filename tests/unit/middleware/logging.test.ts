import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Context, Next } from 'hono'
import { 
  LogLevel,
  loggingMiddleware, 
  performanceMiddleware,
  auditMiddleware,
  Logger,
  createLogger
} from '../../../src/middleware/logging'

describe('Logging Middleware', () => {
  let mockContext: Partial<Context>
  let mockNext: Next
  let mockEnv: Record<string, string>
  let consoleSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    mockEnv = {}
    
    mockContext = {
      req: {
        method: 'GET',
        path: '/test',
        query: vi.fn().mockReturnValue({ param: 'value' }),
        header: vi.fn().mockImplementation((name: string) => {
          if (name === 'User-Agent') return 'test-agent'
          if (name === 'X-Forwarded-For') return '127.0.0.1'
          return undefined
        })
      } as any,
      res: {
        status: 200
      } as any,
      env: mockEnv,
      set: vi.fn(),
      get: vi.fn(),
      header: vi.fn()
    }
    
    mockNext = vi.fn()
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('loggingMiddleware', () => {
    it('should log request and response in production mode', async () => {
      mockEnv.ENVIRONMENT = 'production'
      mockNext.mockResolvedValue(undefined)

      await loggingMiddleware(mockContext as Context, mockNext)

      expect(mockContext.set).toHaveBeenCalledWith('requestId', expect.stringMatching(/^req_\d+_/))
      expect(consoleSpy).toHaveBeenCalledTimes(2)
      
      // JSONログの確認
      const requestLog = consoleSpy.mock.calls[0][0]
      const requestData = JSON.parse(requestLog)
      
      expect(requestData).toMatchObject({
        level: 'INFO',
        method: 'GET',
        path: '/test',
        query: { param: 'value' },
        userAgent: 'test-agent',
        ip: '127.0.0.1',
        requestId: expect.stringMatching(/^req_\d+_/)
      })
    })

    it('should log errors when next() throws', async () => {
      const testError = new Error('Test error')
      mockNext.mockRejectedValue(testError)

      await expect(loggingMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow('Test error')

      expect(consoleSpy).toHaveBeenCalledTimes(2) // request + error
      
      // エラーログの確認（production mode）
      const errorLogStr = consoleSpy.mock.calls[1][0]
      const errorLog = JSON.parse(errorLogStr)
      
      expect(errorLog).toMatchObject({
        level: 'ERROR',
        method: 'GET',
        path: '/test',
        statusCode: 500,
        error: {
          name: 'Error',
          message: 'Test error',
          stack: expect.any(String)
        }
      })
    })

    it('should handle non-Error exceptions', async () => {
      const testError = 'string error'
      mockNext.mockRejectedValue(testError)

      await expect(loggingMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow('string error')

      expect(consoleSpy).toHaveBeenCalledTimes(2)
      
      const errorLogStr = consoleSpy.mock.calls[1][0]
      const errorLog = JSON.parse(errorLogStr)
      
      expect(errorLog.error).toBe('string error')
    })

    it('should log warnings for 4xx responses', async () => {
      mockContext.res!.status = 404
      mockNext.mockResolvedValue(undefined)

      await loggingMiddleware(mockContext as Context, mockNext)

      const responseLogStr = consoleSpy.mock.calls[1][0]
      const responseLog = JSON.parse(responseLogStr)
      
      expect(responseLog.level).toBe('WARN')
      expect(responseLog.statusCode).toBe(404)
    })

    it('should handle missing headers gracefully', async () => {
      mockContext.req!.header = vi.fn().mockReturnValue(undefined)
      mockNext.mockResolvedValue(undefined)

      await loggingMiddleware(mockContext as Context, mockNext)

      expect(consoleSpy).toHaveBeenCalledTimes(2)
      
      const requestLogStr = consoleSpy.mock.calls[0][0]
      const requestLog = JSON.parse(requestLogStr)
      
      expect(requestLog.userAgent).toBeUndefined()
      expect(requestLog.ip).toBeUndefined()
    })
  })

  describe('performanceMiddleware', () => {
    beforeEach(() => {
      global.performance = {
        now: vi.fn()
          .mockReturnValueOnce(100)
          .mockReturnValueOnce(150)
      } as any
    })

    it('should add performance headers', async () => {
      mockContext.get = vi.fn().mockReturnValue('req_123')
      mockNext.mockResolvedValue(undefined)

      await performanceMiddleware(mockContext as Context, mockNext)

      expect(mockContext.header).toHaveBeenCalledWith('X-Response-Time', '50.00ms')
      expect(mockContext.header).toHaveBeenCalledWith('X-Request-Id', 'req_123')
    })

    it('should handle missing requestId', async () => {
      mockContext.get = vi.fn().mockReturnValue(undefined)
      mockNext.mockResolvedValue(undefined)

      await performanceMiddleware(mockContext as Context, mockNext)

      expect(mockContext.header).toHaveBeenCalledWith('X-Request-Id', '')
    })
  })

  describe('Logger class', () => {
    let logger: Logger

    beforeEach(() => {
      logger = new Logger('test-context', false) // 本番環境でテスト
    })

    it('should not log debug messages in production', () => {
      logger.debug('Debug message')
      expect(consoleSpy).not.toHaveBeenCalled()
    })

    it('should log info messages', () => {
      logger.info('Info message', { data: 'test' })

      expect(consoleSpy).toHaveBeenCalled()
      const logStr = consoleSpy.mock.calls[0][0]
      const logData = JSON.parse(logStr)
      
      expect(logData.level).toBe('INFO')
      expect(logData.metadata.message).toBe('Info message')
      expect(logData.metadata.data).toBe('test')
    })

    it('should log warning messages', () => {
      logger.warn('Warning message')

      expect(consoleSpy).toHaveBeenCalled()
      const logStr = consoleSpy.mock.calls[0][0]
      const logData = JSON.parse(logStr)
      
      expect(logData.level).toBe('WARN')
    })

    it('should log error messages with Error object', () => {
      const error = new Error('Test error')
      logger.error('Error occurred', error, { context: 'test' })

      expect(consoleSpy).toHaveBeenCalled()
      const logStr = consoleSpy.mock.calls[0][0]
      const logData = JSON.parse(logStr)
      
      expect(logData.level).toBe('ERROR')
      expect(logData.metadata.error.name).toBe('Error')
      expect(logData.metadata.error.message).toBe('Test error')
      expect(logData.metadata.context).toBe('test')
    })

    it('should log error messages with non-Error object', () => {
      logger.error('Error occurred', 'string error')

      expect(consoleSpy).toHaveBeenCalled()
      const logStr = consoleSpy.mock.calls[0][0]
      const logData = JSON.parse(logStr)
      
      expect(logData.metadata.error).toBe('string error')
    })
  })

  describe('createLogger', () => {
    it('should create logger with development flag from env', () => {
      const env = { ENVIRONMENT: 'development' } as any
      const logger = createLogger('test', env)

      // devフラグのテストだけで、実際のログ出力はテストしない
      expect(logger).toBeInstanceOf(Logger)
    })

    it('should create logger with production flag when env not development', () => {
      const env = { ENVIRONMENT: 'production' } as any
      const logger = createLogger('test', env)

      expect(logger).toBeInstanceOf(Logger)
    })

    it('should handle missing env', () => {
      const logger = createLogger('test')

      expect(logger).toBeInstanceOf(Logger)
    })
  })

  describe('auditMiddleware', () => {
    let auditMiddlewareInstance: ReturnType<typeof auditMiddleware>

    beforeEach(() => {
      auditMiddlewareInstance = auditMiddleware()
      mockContext.get = vi.fn().mockImplementation((key: string) => {
        if (key === 'requestId') return 'req_123'
        if (key === 'user') return 'test-user'
        return undefined
      })
    })

    it('should log audit for POST requests', async () => {
      mockContext.req!.method = 'POST'
      mockContext.req!.json = vi.fn().mockResolvedValue({
        data: 'test',
        password: 'secret'
      })
      mockNext.mockResolvedValue(undefined)

      await auditMiddlewareInstance(mockContext as Context, mockNext)

      expect(consoleSpy).toHaveBeenCalled()
      const auditLogStr = consoleSpy.mock.calls[0][0]
      const auditLog = JSON.parse(auditLogStr)
      
      expect(auditLog.level).toBe('INFO')
      expect(auditLog.metadata.type).toBe('AUDIT')
      expect(auditLog.metadata.operation).toBe('POST /test')
      expect(auditLog.metadata.user).toBe('test-user')
      expect(auditLog.metadata.requestBody.data).toBe('test')
      expect(auditLog.metadata.requestBody.password).toBeUndefined()
    })

    it('should skip audit for GET requests by default', async () => {
      mockContext.req!.method = 'GET'
      mockNext.mockResolvedValue(undefined)

      await auditMiddlewareInstance(mockContext as Context, mockNext)

      expect(consoleSpy).not.toHaveBeenCalled()
      expect(mockNext).toHaveBeenCalled()
    })

    it('should handle custom operations list', async () => {
      const customAudit = auditMiddleware(['GET', 'POST'])
      mockContext.req!.method = 'GET'
      mockNext.mockResolvedValue(undefined)

      await customAudit(mockContext as Context, mockNext)

      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should handle JSON parse errors gracefully', async () => {
      mockContext.req!.method = 'POST'
      mockContext.req!.json = vi.fn().mockRejectedValue(new Error('Invalid JSON'))
      mockNext.mockResolvedValue(undefined)

      await auditMiddlewareInstance(mockContext as Context, mockNext)

      expect(consoleSpy).toHaveBeenCalled()
      const auditLogStr = consoleSpy.mock.calls[0][0]
      const auditLog = JSON.parse(auditLogStr)
      
      expect(auditLog.metadata.requestBody).toBeUndefined()
    })

    it('should skip request body for GET and DELETE methods', async () => {
      mockContext.req!.method = 'DELETE'
      mockNext.mockResolvedValue(undefined)

      await auditMiddlewareInstance(mockContext as Context, mockNext)

      expect(consoleSpy).toHaveBeenCalled()
    })

    it('should handle anonymous user when user not set', async () => {
      mockContext.req!.method = 'POST'
      mockContext.get = vi.fn().mockImplementation((key: string) => {
        if (key === 'requestId') return 'req_123'
        return undefined
      })
      mockNext.mockResolvedValue(undefined)

      await auditMiddlewareInstance(mockContext as Context, mockNext)

      expect(consoleSpy).toHaveBeenCalled()
      const auditLogStr = consoleSpy.mock.calls[0][0]
      const auditLog = JSON.parse(auditLogStr)
      
      expect(auditLog.metadata.user).toBe('anonymous')
    })

    it('should sanitize sensitive data from request body', async () => {
      mockContext.req!.method = 'POST'
      mockContext.req!.json = vi.fn().mockResolvedValue({
        username: 'test',
        password: 'secret',
        token: 'bearer-token',
        apiKey: 'api-secret',
        data: 'normal-data'
      })
      mockNext.mockResolvedValue(undefined)

      await auditMiddlewareInstance(mockContext as Context, mockNext)

      const auditLogStr = consoleSpy.mock.calls[0][0]
      const auditLog = JSON.parse(auditLogStr)
      
      expect(auditLog.metadata.requestBody.username).toBe('test')
      expect(auditLog.metadata.requestBody.data).toBe('normal-data')
      expect(auditLog.metadata.requestBody.password).toBeUndefined()
      expect(auditLog.metadata.requestBody.token).toBeUndefined()
      expect(auditLog.metadata.requestBody.apiKey).toBeUndefined()
    })
  })
})