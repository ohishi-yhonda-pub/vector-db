import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Context, Next } from 'hono'
import { z, ZodError } from 'zod'
import { 
  bodyValidator,
  queryValidator,
  paramsValidator,
  validator,
  contentTypeValidator,
  fileValidator
} from '../../../src/middleware/validation'
import { AppError, ErrorCodes } from '../../../src/utils/error-handler'

// validation utilsをモック
vi.mock('../../../src/utils/validation', () => ({
  validateBody: vi.fn(),
  validateQuery: vi.fn(),
  validateParams: vi.fn(),
  createValidationError: vi.fn()
}))

import { 
  validateBody, 
  validateQuery, 
  validateParams,
  createValidationError 
} from '../../../src/utils/validation'

describe('Validation Middleware', () => {
  let mockContext: Partial<Context>
  let mockNext: Next

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockContext = {
      req: {
        header: vi.fn(),
        json: vi.fn()
      } as any,
      set: vi.fn()
    }
    
    mockNext = vi.fn()
  })

  describe('bodyValidator', () => {
    const testSchema = z.object({
      name: z.string(),
      age: z.number()
    })

    it('should validate body successfully', async () => {
      const validData = { name: 'test', age: 25 }
      const bodyValidatorMiddleware = bodyValidator(testSchema)
      
      ;(validateBody as any).mockResolvedValue(validData)

      await bodyValidatorMiddleware(mockContext as Context, mockNext)

      expect(validateBody).toHaveBeenCalledWith(mockContext, testSchema)
      expect(mockContext.set).toHaveBeenCalledWith('validatedBody', validData)
      expect(mockNext).toHaveBeenCalled()
    })

    it('should handle AppError from validateBody', async () => {
      const appError = new AppError(ErrorCodes.BAD_REQUEST, 'Invalid body', 400)
      const bodyValidatorMiddleware = bodyValidator(testSchema)
      
      ;(validateBody as any).mockRejectedValue(appError)

      await expect(bodyValidatorMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow(appError)

      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should handle ZodError from validateBody', async () => {
      const zodError = new ZodError([])
      const validationError = new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400)
      const bodyValidatorMiddleware = bodyValidator(testSchema)
      
      ;(validateBody as any).mockRejectedValue(zodError)
      ;(createValidationError as any).mockReturnValue(validationError)

      await expect(bodyValidatorMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow(validationError)

      expect(createValidationError).toHaveBeenCalledWith(zodError, 'Request body validation failed')
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should handle non-ZodError from validateBody', async () => {
      const genericError = new Error('Generic error')
      const validationError = new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400)
      const bodyValidatorMiddleware = bodyValidator(testSchema)
      
      ;(validateBody as any).mockRejectedValue(genericError)
      ;(createValidationError as any).mockReturnValue(validationError)

      await expect(bodyValidatorMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow(validationError)

      expect(createValidationError).toHaveBeenCalledWith([], 'Request body validation failed')
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('queryValidator', () => {
    const testSchema = z.object({
      page: z.string(),
      limit: z.string()
    })

    it('should validate query parameters successfully', async () => {
      const validData = { page: '1', limit: '10' }
      const queryValidatorMiddleware = queryValidator(testSchema)
      
      ;(validateQuery as any).mockReturnValue(validData)

      await queryValidatorMiddleware(mockContext as Context, mockNext)

      expect(validateQuery).toHaveBeenCalledWith(mockContext, testSchema)
      expect(mockContext.set).toHaveBeenCalledWith('validatedQuery', validData)
      expect(mockNext).toHaveBeenCalled()
    })

    it('should handle AppError from validateQuery', async () => {
      const appError = new AppError(ErrorCodes.BAD_REQUEST, 'Invalid query', 400)
      const queryValidatorMiddleware = queryValidator(testSchema)
      
      ;(validateQuery as any).mockImplementation(() => { throw appError })

      await expect(queryValidatorMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow(appError)

      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should handle ZodError from validateQuery', async () => {
      const zodError = new ZodError([])
      const validationError = new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400)
      const queryValidatorMiddleware = queryValidator(testSchema)
      
      ;(validateQuery as any).mockImplementation(() => { throw zodError })
      ;(createValidationError as any).mockReturnValue(validationError)

      await expect(queryValidatorMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow(validationError)

      expect(createValidationError).toHaveBeenCalledWith(zodError, 'Query parameters validation failed')
    })
  })

  describe('paramsValidator', () => {
    const testSchema = z.object({
      id: z.string()
    })

    it('should validate path parameters successfully', async () => {
      const validData = { id: '123' }
      const paramsValidatorMiddleware = paramsValidator(testSchema)
      
      ;(validateParams as any).mockReturnValue(validData)

      await paramsValidatorMiddleware(mockContext as Context, mockNext)

      expect(validateParams).toHaveBeenCalledWith(mockContext, testSchema)
      expect(mockContext.set).toHaveBeenCalledWith('validatedParams', validData)
      expect(mockNext).toHaveBeenCalled()
    })

    it('should handle ZodError from validateParams', async () => {
      const zodError = new ZodError([])
      const validationError = new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', 400)
      const paramsValidatorMiddleware = paramsValidator(testSchema)
      
      ;(validateParams as any).mockImplementation(() => { throw zodError })
      ;(createValidationError as any).mockReturnValue(validationError)

      await expect(paramsValidatorMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow(validationError)

      expect(createValidationError).toHaveBeenCalledWith(zodError, 'Path parameters validation failed')
    })
  })

  describe('validator (composite)', () => {
    const schemas = {
      body: z.object({ name: z.string() }),
      query: z.object({ page: z.string() }),
      params: z.object({ id: z.string() })
    }

    it('should validate all schemas successfully', async () => {
      const validatedData = {
        body: { name: 'test' },
        query: { page: '1' },
        params: { id: '123' }
      }
      const validatorMiddleware = validator(schemas)
      
      ;(validateBody as any).mockResolvedValue(validatedData.body)
      ;(validateQuery as any).mockReturnValue(validatedData.query)
      ;(validateParams as any).mockReturnValue(validatedData.params)

      await validatorMiddleware(mockContext as Context, mockNext)

      expect(mockContext.set).toHaveBeenCalledWith('validated', validatedData)
      expect(mockNext).toHaveBeenCalled()
    })

    it('should handle validation errors from multiple sources', async () => {
      const bodyError = new ZodError([{
        code: 'invalid_type' as any,
        expected: 'string',
        received: 'number',
        path: ['name'],
        message: 'Expected string, received number'
      }])
      
      const queryError = new ZodError([{
        code: 'invalid_type' as any,
        expected: 'string', 
        received: 'undefined',
        path: ['page'],
        message: 'Required'
      }])
      
      const validatorMiddleware = validator(schemas)
      
      ;(validateBody as any).mockRejectedValue(bodyError)
      ;(validateQuery as any).mockImplementation(() => { throw queryError })
      ;(validateParams as any).mockReturnValue({ id: '123' })

      await expect(validatorMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow('Request validation failed')

      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should validate only specified schemas', async () => {
      const partialSchemas = { body: schemas.body }
      const validatorMiddleware = validator(partialSchemas)
      
      ;(validateBody as any).mockResolvedValue({ name: 'test' })

      await validatorMiddleware(mockContext as Context, mockNext)

      expect(validateBody).toHaveBeenCalled()
      expect(validateQuery).not.toHaveBeenCalled()
      expect(validateParams).not.toHaveBeenCalled()
      expect(mockNext).toHaveBeenCalled()
    })

    it('should re-throw non-ZodError exceptions', async () => {
      const appError = new AppError(ErrorCodes.INTERNAL_ERROR, 'Server error', 500)
      const validatorMiddleware = validator(schemas)
      
      ;(validateBody as any).mockRejectedValue(appError)

      await expect(validatorMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow(appError)

      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('contentTypeValidator', () => {
    it('should pass with valid content type', async () => {
      const contentTypeMiddleware = contentTypeValidator(['application/json'])
      mockContext.req!.header = vi.fn().mockReturnValue('application/json')

      await contentTypeMiddleware(mockContext as Context, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should pass with content type including charset', async () => {
      const contentTypeMiddleware = contentTypeValidator(['application/json'])
      mockContext.req!.header = vi.fn().mockReturnValue('application/json; charset=utf-8')

      await contentTypeMiddleware(mockContext as Context, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should throw error when content type is missing', async () => {
      const contentTypeMiddleware = contentTypeValidator()
      mockContext.req!.header = vi.fn().mockReturnValue(undefined)

      await expect(contentTypeMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow('Content-Type header is required')

      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should throw error for unsupported content type', async () => {
      const contentTypeMiddleware = contentTypeValidator(['application/json'])
      mockContext.req!.header = vi.fn().mockReturnValue('text/plain')

      await expect(contentTypeMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow('Unsupported Content-Type: text/plain')

      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should work with multiple allowed types', async () => {
      const contentTypeMiddleware = contentTypeValidator(['application/json', 'application/xml'])
      mockContext.req!.header = vi.fn().mockReturnValue('application/xml')

      await contentTypeMiddleware(mockContext as Context, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should be case insensitive', async () => {
      const contentTypeMiddleware = contentTypeValidator(['application/json'])
      mockContext.req!.header = vi.fn().mockReturnValue('APPLICATION/JSON')

      await contentTypeMiddleware(mockContext as Context, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })
  })

  describe('fileValidator', () => {
    it('should pass with valid multipart/form-data', async () => {
      const fileValidatorMiddleware = fileValidator({
        maxSize: 1024,
        allowedTypes: ['image/jpeg'],
        required: true
      })
      
      mockContext.req!.header = vi.fn().mockImplementation((name: string) => {
        if (name === 'Content-Type') return 'multipart/form-data; boundary=test'
        if (name === 'Content-Length') return '500'
        return undefined
      })

      await fileValidatorMiddleware(mockContext as Context, mockNext)

      expect(mockContext.set).toHaveBeenCalledWith('fileValidation', {
        maxSize: 1024,
        allowedTypes: ['image/jpeg']
      })
      expect(mockNext).toHaveBeenCalled()
    })

    it('should throw error when file upload required but not multipart', async () => {
      const fileValidatorMiddleware = fileValidator({ required: true })
      mockContext.req!.header = vi.fn().mockReturnValue('application/json')

      await expect(fileValidatorMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow('File upload requires multipart/form-data')

      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should pass when not required and not multipart', async () => {
      const fileValidatorMiddleware = fileValidator({ required: false })
      mockContext.req!.header = vi.fn().mockReturnValue('application/json')

      await fileValidatorMiddleware(mockContext as Context, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should throw error when file size exceeds maximum', async () => {
      const fileValidatorMiddleware = fileValidator({ maxSize: 1000 })
      
      mockContext.req!.header = vi.fn().mockImplementation((name: string) => {
        if (name === 'Content-Type') return 'multipart/form-data'
        if (name === 'Content-Length') return '2000'
        return undefined
      })

      await expect(fileValidatorMiddleware(mockContext as Context, mockNext))
        .rejects.toThrow('File size exceeds maximum allowed size of 1000 bytes')

      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should pass when no content-length header', async () => {
      const fileValidatorMiddleware = fileValidator({ maxSize: 1000 })
      
      mockContext.req!.header = vi.fn().mockImplementation((name: string) => {
        if (name === 'Content-Type') return 'multipart/form-data'
        return undefined
      })

      await fileValidatorMiddleware(mockContext as Context, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it('should use default options', async () => {
      const fileValidatorMiddleware = fileValidator({})
      
      mockContext.req!.header = vi.fn().mockImplementation((name: string) => {
        if (name === 'Content-Type') return 'multipart/form-data'
        if (name === 'Content-Length') return '1000'
        return undefined
      })

      await fileValidatorMiddleware(mockContext as Context, mockNext)

      expect(mockContext.set).toHaveBeenCalledWith('fileValidation', {
        maxSize: 10 * 1024 * 1024, // 10MB default
        allowedTypes: []
      })
      expect(mockNext).toHaveBeenCalled()
    })
  })

  describe('validator error handling edge cases', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should rethrow AppError from body validation (line 68)', async () => {
      const schema = z.object({
        value: z.string().refine(() => {
          throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Custom validation error', 400)
        })
      })

      const mockContext = {
        req: {
          json: vi.fn().mockResolvedValue({ value: 'test' })
        },
        set: vi.fn()
      } as any

      const middleware = validator({ body: schema })

      await expect(middleware(mockContext, vi.fn())).rejects.toThrow(AppError)
    })

    it('should throw non-ZodError from query validation (line 111)', async () => {
      const schema = z.object({
        value: z.string()
      })

      // Mock validateQuery to throw non-ZodError
      ;(validateQuery as any).mockImplementation(() => {
        throw new Error('Non-ZodError from query')
      })

      const middleware = validator({ query: schema })

      await expect(middleware(mockContext as any, vi.fn())).rejects.toThrow('Non-ZodError from query')
    })

    it('should throw non-ZodError from params validation (lines 121-124)', async () => {
      const schema = z.object({
        id: z.string()
      })

      // Mock validateParams to throw non-ZodError
      ;(validateParams as any).mockImplementation(() => {
        throw new Error('Non-ZodError from params')
      })

      const middleware = validator({ params: schema })

      await expect(middleware(mockContext as any, vi.fn())).rejects.toThrow('Non-ZodError from params')
    })
  })
})