/**
 * バリデーションミドルウェア
 */

import { Context, Next } from 'hono'
import { ZodSchema, ZodError } from 'zod'
import { 
  validateBody, 
  validateQuery, 
  validateParams,
  createValidationError 
} from '../utils/validation'
import { AppError, ErrorCodes } from '../utils/error-handler'

/**
 * リクエストボディバリデーションミドルウェア
 */
export function bodyValidator<T>(schema: ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    try {
      const data = await validateBody(c, schema)
      c.set('validatedBody', data)
      await next()
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      throw createValidationError(
        error instanceof ZodError ? error : [],
        'Request body validation failed'
      )
    }
  }
}

/**
 * クエリパラメータバリデーションミドルウェア
 */
export function queryValidator<T>(schema: ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    try {
      const data = validateQuery(c, schema)
      c.set('validatedQuery', data)
      await next()
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      throw createValidationError(
        error instanceof ZodError ? error : [],
        'Query parameters validation failed'
      )
    }
  }
}

/**
 * パスパラメータバリデーションミドルウェア
 */
export function paramsValidator<T>(schema: ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    try {
      const data = validateParams(c, schema)
      c.set('validatedParams', data)
      await next()
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      throw createValidationError(
        error instanceof ZodError ? error : [],
        'Path parameters validation failed'
      )
    }
  }
}

/**
 * 複合バリデーションミドルウェア
 */
export function validator<T extends {
  body?: ZodSchema
  query?: ZodSchema
  params?: ZodSchema
}>(schemas: T) {
  return async (c: Context, next: Next) => {
    const errors: Array<{ type: string; error: ZodError }> = []
    const validated: Record<string, any> = {}

    // ボディバリデーション
    if (schemas.body) {
      try {
        validated.body = await validateBody(c, schemas.body)
      } catch (error) {
        if (error instanceof ZodError) {
          errors.push({ type: 'body', error })
        } else {
          throw error
        }
      }
    }

    // クエリバリデーション
    if (schemas.query) {
      try {
        validated.query = validateQuery(c, schemas.query)
      } catch (error) {
        if (error instanceof ZodError) {
          errors.push({ type: 'query', error })
        } else {
          throw error
        }
      }
    }

    // パラメータバリデーション
    if (schemas.params) {
      try {
        validated.params = validateParams(c, schemas.params)
      } catch (error) {
        if (error instanceof ZodError) {
          errors.push({ type: 'params', error })
        } else {
          throw error
        }
      }
    }

    // エラーがある場合
    if (errors.length > 0) {
      const allErrors = errors.flatMap(({ type, error }) => 
        (error.issues || error.errors || []).map((e: any) => ({
          field: `${type}.${e.path.join('.')}`,
          message: e.message,
          code: e.code,
          received: (e as any).received
        }))
      )
      
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR,
        'Request validation failed',
        400,
        { errors: allErrors }
      )
    }

    // バリデーション済みデータをコンテキストに設定
    c.set('validated', validated)
    await next()
  }
}

/**
 * コンテンツタイプバリデーションミドルウェア
 */
export function contentTypeValidator(
  allowedTypes: string[] = ['application/json']
) {
  return async (c: Context, next: Next) => {
    const contentType = c.req.header('Content-Type')
    
    if (!contentType) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        'Content-Type header is required',
        400
      )
    }

    const baseType = contentType.split(';')[0].trim().toLowerCase()
    
    if (!allowedTypes.includes(baseType)) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        `Unsupported Content-Type: ${baseType}. Allowed types: ${allowedTypes.join(', ')}`,
        415
      )
    }

    await next()
  }
}

/**
 * ファイルアップロードバリデーションミドルウェア
 */
export function fileValidator(options: {
  maxSize?: number
  allowedTypes?: string[]
  required?: boolean
}) {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB
    allowedTypes = [],
    required = true
  } = options

  return async (c: Context, next: Next) => {
    const contentType = c.req.header('Content-Type')
    
    if (!contentType?.includes('multipart/form-data')) {
      if (required) {
        throw new AppError(
          ErrorCodes.BAD_REQUEST,
          'File upload requires multipart/form-data',
          400
        )
      }
      await next()
      return
    }

    const contentLength = c.req.header('Content-Length')
    
    if (contentLength && parseInt(contentLength) > maxSize) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        `File size exceeds maximum allowed size of ${maxSize} bytes`,
        413
      )
    }

    // ファイルタイプの検証は実際のファイル処理時に行う
    c.set('fileValidation', {
      maxSize,
      allowedTypes
    })

    await next()
  }
}