import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Context, Next } from 'hono'
import { apiKeyAuth, notionAuth, bearerAuth, rateLimitAuth, corsAuth } from '../../../src/middleware/auth'
import { AppError, ErrorCodes } from '../../../src/utils/error-handler'

describe('Auth Middleware', () => {
  let mockContext: Partial<Context>
  let mockNext: Next
  let mockEnv: Record<string, string>

  beforeEach(() => {
    mockEnv = {
      API_KEY: 'test-api-key'
    }
    
    mockContext = {
      req: {
        header: vi.fn()
      } as any,
      env: mockEnv,
      set: vi.fn(),
      header: vi.fn()
    }
    
    mockNext = vi.fn()
  })

  describe('apiKeyAuth', () => {
    it('should pass when valid API key is provided', async () => {
      const mockHeader = vi.fn().mockReturnValue('test-api-key')
      mockContext.req!.header = mockHeader

      await apiKeyAuth(mockContext as Context, mockNext)

      expect(mockNext).toHaveBeenCalled()
      expect(mockHeader).toHaveBeenCalledWith('X-API-Key')
    })

    it('should throw error when API key is missing', async () => {
      const mockHeader = vi.fn().mockReturnValue(undefined)
      mockContext.req!.header = mockHeader

      await expect(apiKeyAuth(mockContext as Context, mockNext))
        .rejects.toThrow('API key required')
      
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should throw error when API key is invalid', async () => {
      const mockHeader = vi.fn().mockReturnValue('invalid-key')
      mockContext.req!.header = mockHeader

      await expect(apiKeyAuth(mockContext as Context, mockNext))
        .rejects.toThrow('Invalid API key')
      
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should use custom header name when provided', async () => {
      const mockHeader = vi.fn().mockReturnValue('test-api-key')
      mockContext.req!.header = mockHeader

      await apiKeyAuth(mockContext as Context, mockNext, {
        headerName: 'Authorization'
      })

      expect(mockHeader).toHaveBeenCalledWith('Authorization')
      expect(mockNext).toHaveBeenCalled()
    })

    it('should use custom environment variable when provided', async () => {
      mockEnv.CUSTOM_API_KEY = 'custom-key'
      const mockHeader = vi.fn().mockReturnValue('custom-key')
      mockContext.req!.header = mockHeader

      await apiKeyAuth(mockContext as Context, mockNext, {
        envVarName: 'CUSTOM_API_KEY'
      })

      expect(mockNext).toHaveBeenCalled()
    })

    it('should pass when optional and no key provided', async () => {
      const mockHeader = vi.fn().mockReturnValue(undefined)
      mockContext.req!.header = mockHeader

      await apiKeyAuth(mockContext as Context, mockNext, {
        optional: true
      })

      expect(mockNext).toHaveBeenCalled()
    })

    it('should throw error when environment variable not configured', async () => {
      mockContext.env = {}
      const mockHeader = vi.fn().mockReturnValue('any-key')
      mockContext.req!.header = mockHeader

      await expect(apiKeyAuth(mockContext as Context, mockNext))
        .rejects.toThrow('API key not configured')
      
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('notionAuth', () => {
    it('should pass when Notion API key is configured', async () => {
      mockEnv.NOTION_API_KEY = 'notion-secret-key'
      mockContext.set = vi.fn()

      await notionAuth(mockContext as Context, mockNext)

      expect(mockContext.set).toHaveBeenCalledWith('notionApiKey', 'notion-secret-key')
      expect(mockNext).toHaveBeenCalled()
    })

    it('should throw error when Notion API key is not configured', async () => {
      delete mockEnv.NOTION_API_KEY
      mockContext.env = mockEnv

      await expect(notionAuth(mockContext as Context, mockNext))
        .rejects.toThrow('Notion APIトークンが設定されていません')
      
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('bearerAuth', () => {
    it('should pass when valid Bearer token is provided', async () => {
      const mockHeader = vi.fn().mockReturnValue('Bearer test-token')
      mockContext.req!.header = mockHeader
      mockContext.set = vi.fn()

      await bearerAuth(mockContext as Context, mockNext)

      expect(mockContext.set).toHaveBeenCalledWith('token', 'test-token')
      expect(mockNext).toHaveBeenCalled()
      expect(mockHeader).toHaveBeenCalledWith('Authorization')
    })

    it('should throw error when Authorization header is missing', async () => {
      const mockHeader = vi.fn().mockReturnValue(undefined)
      mockContext.req!.header = mockHeader

      await expect(bearerAuth(mockContext as Context, mockNext))
        .rejects.toThrow('Authorization header required')
      
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should throw error when Bearer format is invalid', async () => {
      const mockHeader = vi.fn().mockReturnValue('InvalidFormat token')
      mockContext.req!.header = mockHeader

      await expect(bearerAuth(mockContext as Context, mockNext))
        .rejects.toThrow('Invalid authorization format')
      
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should validate token when validateToken function provided', async () => {
      const mockHeader = vi.fn().mockReturnValue('Bearer test-token')
      const mockValidateToken = vi.fn().mockResolvedValue(false)
      mockContext.req!.header = mockHeader
      mockContext.set = vi.fn()

      await expect(bearerAuth(mockContext as Context, mockNext, mockValidateToken))
        .rejects.toThrow('Invalid token')
      
      expect(mockValidateToken).toHaveBeenCalledWith('test-token')
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('rateLimitAuth', () => {
    let rateLimitMiddleware: ReturnType<typeof rateLimitAuth>

    beforeEach(() => {
      vi.clearAllMocks()
      rateLimitMiddleware = rateLimitAuth(60000, 5) // 1分で5回制限
      mockContext.header = vi.fn()
    })

    it('should pass when under rate limit', async () => {
      mockContext.req!.header = vi.fn().mockImplementation((name) => {
        if (name === 'X-Forwarded-For') return '127.0.0.1'
        if (name === 'X-Real-IP') return undefined
        return undefined
      })

      await rateLimitMiddleware(mockContext as Context, mockNext)

      expect(mockNext).toHaveBeenCalled()
      expect(mockContext.header).toHaveBeenCalledWith('X-RateLimit-Limit', '5')
      expect(mockContext.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '4')
    })

    it('should extract IP from X-Forwarded-For header', async () => {
      const testIP = '192.168.1.100'
      mockContext.req!.header = vi.fn().mockImplementation((name) => {
        if (name === 'X-Forwarded-For') return testIP
        return undefined
      })

      await rateLimitMiddleware(mockContext as Context, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should extract IP from X-Real-IP header when X-Forwarded-For not available', async () => {
      const testIP = '10.0.0.1'
      mockContext.req!.header = vi.fn().mockImplementation((name) => {
        if (name === 'X-Forwarded-For') return undefined
        if (name === 'X-Real-IP') return testIP
        return undefined
      })

      await rateLimitMiddleware(mockContext as Context, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should use anonymous when no IP headers available', async () => {
      mockContext.req!.header = vi.fn().mockReturnValue(undefined)

      await rateLimitMiddleware(mockContext as Context, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should throw error when rate limit exceeded', async () => {
      mockContext.req!.header = vi.fn().mockReturnValue('127.0.0.1')
      
      // 制限回数を超過させる
      for (let i = 0; i < 5; i++) {
        await rateLimitMiddleware(mockContext as Context, mockNext)
      }
      
      await expect(rateLimitMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow('Rate limit exceeded')
    })
  })

  describe('corsAuth', () => {
    let corsMiddleware: ReturnType<typeof corsAuth>

    beforeEach(() => {
      corsMiddleware = corsAuth()
      mockContext.req = {
        ...mockContext.req,
        method: 'GET',
        header: vi.fn()
      }
      mockContext.header = vi.fn()
    })

    it('should set CORS headers for regular requests', async () => {
      mockContext.req!.header = vi.fn().mockReturnValue('https://example.com')

      await corsMiddleware(mockContext as Context, mockNext)

      expect(mockContext.header).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
      expect(mockNext).toHaveBeenCalled()
    })

    it('should handle OPTIONS preflight requests', async () => {
      mockContext.req!.method = 'OPTIONS'
      mockContext.req!.header = vi.fn().mockReturnValue('https://example.com')

      const result = await corsMiddleware(mockContext as Context, mockNext)

      expect(result).toBeInstanceOf(Response)
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should set custom allowed origins when provided', async () => {
      corsMiddleware = corsAuth({
        origin: ['https://example.com', 'https://test.com']
      })
      mockContext.req!.header = vi.fn().mockReturnValue('https://example.com')

      await corsMiddleware(mockContext as Context, mockNext)

      expect(mockContext.header).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://example.com')
      expect(mockNext).toHaveBeenCalled()
    })

    it('should set credentials header when enabled', async () => {
      corsMiddleware = corsAuth({ credentials: true })
      mockContext.req!.header = vi.fn().mockReturnValue('https://example.com')

      await corsMiddleware(mockContext as Context, mockNext)

      expect(mockContext.header).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true')
      expect(mockNext).toHaveBeenCalled()
    })

    it('should work with function-based origin validation', async () => {
      corsMiddleware = corsAuth({
        origin: (origin: string) => origin.endsWith('.example.com')
      })
      mockContext.req!.header = vi.fn().mockReturnValue('subdomain.example.com')

      await corsMiddleware(mockContext as Context, mockNext)

      expect(mockContext.header).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'subdomain.example.com')
      expect(mockNext).toHaveBeenCalled()
    })

    it('should set Access-Control-Expose-Headers when exposeHeaders are provided', async () => {
      corsMiddleware = corsAuth({
        origin: 'https://example.com',
        exposeHeaders: ['X-Custom-Header', 'X-Another-Header']
      })
      // Mock OPTIONS request to trigger exposeHeaders logic
      mockContext.req!.header = vi.fn().mockImplementation((name) => {
        if (name === 'Origin') return 'https://example.com'
        return undefined
      })
      mockContext.req!.method = 'OPTIONS'

      const result = await corsMiddleware(mockContext as Context, mockNext)

      expect(mockContext.header).toHaveBeenCalledWith('Access-Control-Expose-Headers', 'X-Custom-Header, X-Another-Header')
      expect(result).toBeInstanceOf(Response)
      expect((result as Response).status).toBe(204)
    })
  })
})