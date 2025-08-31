/**
 * 共通バリデーションユーティリティ
 */

import { z, ZodError, ZodSchema } from 'zod'
import { Context } from 'hono'
import { AppError, ErrorCodes } from './error-handler'

/**
 * バリデーションエラーの詳細
 */
export interface ValidationErrorDetail {
  field: string
  message: string
  code?: string
  received?: any
}

/**
 * Zodエラーを読みやすい形式に変換
 */
export function formatZodError(error: ZodError): ValidationErrorDetail[] {
  if (!error || !error.issues) {
    return []
  }
  return error.issues.map(err => {
    const detail: ValidationErrorDetail = {
      field: err.path.join('.'),
      message: err.message,
      code: err.code
    }
    
    // received値を取得（union_ctxやその他のコンテキストから）
    if ('received' in err) {
      detail.received = (err as any).received
    } else if (err.code === 'invalid_type' && 'received' in (err as any)) {
      detail.received = (err as any).received
    } else if (err.code === 'invalid_union' && (err as any).unionErrors) {
      // Union型のエラーの場合、最初のエラーからreceivedを取得
      const firstError = (err as any).unionErrors[0]?.issues?.[0]
      if (firstError && 'received' in firstError) {
        detail.received = firstError.received
      }
    }
    
    return detail
  })
}

/**
 * バリデーションエラーをAppErrorに変換
 */
export function createValidationError(
  error: ZodError | ValidationErrorDetail[],
  message: string = 'Validation failed'
): AppError {
  const details = error instanceof ZodError 
    ? formatZodError(error)
    : error

  return new AppError(
    ErrorCodes.VALIDATION_ERROR,
    message,
    400,
    { errors: details }
  )
}

/**
 * スキーマでバリデーション実行（エイリアス）
 */
function validateBase<T>(
  schema: ZodSchema<T>,
  data: unknown,
  options?: { 
    errorMessage?: string
    throwOnError?: boolean 
  }
): { success: true; data: T } | { success: false; error: AppError } {
  return validateInternal(schema, data, options)
}

/**
 * リクエストボディをバリデーション
 */
export async function validateBody<T>(
  c: Context,
  schema: ZodSchema<T>
): Promise<T> {
  try {
    const body = await c.req.json()
    const result = validateInternal(schema, body, { throwOnError: true })
    return result.data as T
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new AppError(
        ErrorCodes.BAD_REQUEST,
        'Invalid JSON in request body',
        400
      )
    }
    throw error
  }
}

/**
 * コンテキストベースのバリデーション（テスト互換性用）
 */
export async function validateWithContext<T>(
  c: Context,
  schema: ZodSchema<T>,
  errorMessage?: string
): Promise<T> {
  const body = await c.req.json()
  const result = validateInternal(schema, body, { 
    throwOnError: true, 
    errorMessage 
  })
  return result.data as T
}

/**
 * クエリパラメータをバリデーション（オーバーロード）
 */
export function validateQuery<T>(
  c: Context,
  schema: ZodSchema<T>,
  errorMessage?: string
): T;
export function validateQuery<T>(
  schema: ZodSchema<T>
): (c: Context) => T;
export function validateQuery<T>(
  cOrSchema: Context | ZodSchema<T>,
  schemaOrErrorMessage?: ZodSchema<T> | string,
  errorMessage?: string
): T | ((c: Context) => T) {
  if (schemaOrErrorMessage && typeof schemaOrErrorMessage !== 'string') {
    // 第一引数がContextの場合
    const c = cOrSchema as Context
    const query = c.req.query()
    const result = validateInternal(schemaOrErrorMessage, query, { 
      throwOnError: true,
      errorMessage 
    })
    return result.data as T
  } else {
    // 第一引数がSchemaの場合（カリー化）
    const schemaArg = cOrSchema as ZodSchema<T>
    return (c: Context) => {
      const query = c.req.query()
      const result = validateInternal(schemaArg, query, { throwOnError: true })
      return result.data as T
    }
  }
}

// 内部用のvalidate関数（シンプル化）
function validateInternal<T>(
  schema: ZodSchema<T>,
  data: unknown,
  options?: { 
    errorMessage?: string
    throwOnError?: boolean 
  }
): { success: true; data: T } | { success: false; error: AppError } {
  try {
    const result = schema.parse(data)
    return { success: true, data: result }
  } catch (error) {
    if (error instanceof ZodError) {
      const appError = createValidationError(error, options?.errorMessage)
      if (options?.throwOnError) {
        throw appError
      }
      return { success: false, error: appError }
    }
    // Re-throw other errors (including async parse errors)
    throw error
  }
}

/**
 * パスパラメータをバリデーション（オーバーロード）
 */
export function validateParams<T>(
  c: Context,
  schema: ZodSchema<T>
): T;
export function validateParams<T>(
  schema: ZodSchema<T>
): (c: Context) => T;
export function validateParams<T>(
  cOrSchema: Context | ZodSchema<T>,
  schema?: ZodSchema<T>
): T | ((c: Context) => T) {
  if (schema) {
    // 第一引数がContextの場合
    const c = cOrSchema as Context
    const params = c.req.param()
    const result = validateInternal(schema, params, { throwOnError: true })
    return result.data as T
  } else {
    // 第一引数がSchemaの場合（カリー化）
    const schemaArg = cOrSchema as ZodSchema<T>
    return (c: Context) => {
      const params = c.req.param()
      const result = validateInternal(schemaArg, params, { throwOnError: true })
      return result.data as T
    }
  }
}

/**
 * 共通バリデーションスキーマ
 */
export const CommonSchemas = {
  // UUID v4
  uuid: z.string().uuid(),
  
  // ID (英数字とハイフン、アンダースコア)
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Invalid ID format'),
  
  // Email
  email: z.string().email(),
  
  // URL
  url: z.string().url(),
  
  // 日付文字列 (ISO 8601)
  dateString: z.string().datetime(),
  
  // ページネーション（pageSize版）
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10)
  }),
  
  // ソート
  sort: z.object({
    sortBy: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('desc')
  }),
  
  // ソートオーダー
  sortOrder: z.enum(['asc', 'desc']),
  
  // 日付範囲
  dateRange: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional()
  }),
  
  // 検索クエリ
  searchQuery: z.object({
    q: z.string().trim(),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    offset: z.coerce.number().int().min(0).default(0)
  }),
  
  // 配列（空でない）
  nonEmptyArray: <T extends z.ZodTypeAny>(schema: T) => 
    z.array(schema).min(1, 'Array must contain at least one item'),
  
  // 文字列（空でない）
  nonEmptyString: z.string().min(1, 'String cannot be empty').trim(),
  
  // 数値範囲
  numberInRange: (min: number, max: number) =>
    z.number().min(min).max(max)
}

/**
 * カスタムバリデータ
 */
export const CustomValidators = {
  /**
   * ベクトルIDのバリデーション
   */
  vectorId: z.string().regex(
    /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
    'Vector ID must start with alphanumeric and contain only alphanumeric, hyphen, or underscore'
  ),
  
  /**
   * ベクトル値のバリデーション（次元数チェック付き）
   */
  vectorValues: (dimensions?: number) => {
    const baseSchema = z.array(z.number().finite())
    
    if (dimensions) {
      return baseSchema.length(dimensions, `Vector must have exactly ${dimensions} dimensions`)
    }
    
    return baseSchema.min(1, 'Vector must have at least one dimension')
  },
  
  /**
   * メタデータのバリデーション
   */
  metadata: z.record(z.string(), z.unknown()).refine(
    (data) => {
      // メタデータのサイズ制限（例: 10KB）
      const jsonStr = JSON.stringify(data)
      return jsonStr.length <= 10240
    },
    { message: 'Metadata size exceeds 10KB limit' }
  ),
  
  /**
   * ファイルタイプのバリデーション
   */
  fileType: (allowedTypes: string[]) =>
    z.string().refine(
      (type) => allowedTypes.includes(type.toLowerCase()),
      { message: `File type must be one of: ${allowedTypes.join(', ')}` }
    ),
  
  /**
   * ファイルサイズのバリデーション（バイト単位）
   */
  fileSize: (maxSize: number) =>
    z.number().positive().max(maxSize, `File size must not exceed ${maxSize} bytes`),
  
  /**
   * Notion Page IDのバリデーション
   */
  notionPageId: z.string().regex(
    /^[a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12}$/i,
    'Invalid Notion page ID format'
  ),
  
  /**
   * 環境変数の存在チェック
   */
  requiredEnvVar: (varName: string) =>
    z.string().min(1, `Environment variable ${varName} is required`),
  
  /**
   * 強力なパスワードの検証
   */
  isStrongPassword: (password: string): boolean => {
    // 最低8文字、大文字、小文字、数字、特殊文字を含む
    return password.length >= 8 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[^A-Za-z0-9]/.test(password)
  },
  
  /**
   * 電話番号の検証
   */
  isValidPhoneNumber: (phone: string): boolean => {
    // 国際電話番号形式またはハイフン区切り
    return /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,3}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,4}$/.test(phone)
  },
  
  /**
   * URLスラッグの検証
   */
  isValidSlug: (slug: string): boolean => {
    return /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(slug)
  },
  
  /**
   * Base64文字列の検証
   */
  isBase64: (str: string): boolean => {
    try {
      return /^[A-Za-z0-9+/]*={0,2}$/.test(str) && str.length % 4 === 0
    } catch {
      return false
    }
  },
  
  /**
   * 16進数カラーコードの検証
   */
  isHexColor: (color: string): boolean => {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)
  },
  
  /**
   * 英数字の検証
   */
  isAlphanumeric: (str: string): boolean => {
    return /^[a-zA-Z0-9]+$/.test(str)
  },
  
  /**
   * JWTトークンの検証
   */
  isJWT: (token: string): boolean => {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    
    try {
      parts.forEach(part => {
        // Base64urlの検証
        if (!/^[A-Za-z0-9_-]+$/.test(part)) {
          throw new Error('Invalid JWT part')
        }
      })
      return true
    } catch {
      return false
    }
  }
}

/**
 * 複数のスキーマを組み合わせる
 */
export function combineSchemas<T extends Record<string, ZodSchema>>(
  schemas: T
): z.ZodObject<{ [K in keyof T]: T[K] extends ZodSchema<infer U> ? z.ZodType<U> : never }> {
  const combined: any = {}
  for (const [key, schema] of Object.entries(schemas)) {
    combined[key] = schema
  }
  return z.object(combined)
}

/**
 * オプショナルなフィールドを持つスキーマを作成
 */
export function createOptionalSchema<T extends z.ZodRawShape>(
  shape: T,
  requiredFields: (keyof T)[] = []
): z.ZodObject<T> {
  const newShape: any = {}
  
  for (const [key, value] of Object.entries(shape)) {
    if (requiredFields && requiredFields.includes(key as keyof T)) {
      newShape[key] = value
    } else {
      newShape[key] = (value as any).optional()
    }
  }
  
  return z.object(newShape as T)
}

/**
 * 条件付きバリデーション
 */
export function conditionalValidation<T, U>(
  condition: (data: any) => boolean,
  trueSchema: ZodSchema<T>,
  falseSchema: ZodSchema<U>
): ZodSchema<T | U> {
  return z.any().transform((data, ctx) => {
    if (condition(data)) {
      const result = trueSchema.safeParse(data)
      if (!result.success) {
        result.error.issues.forEach(err => ctx.addIssue(err))
        return z.NEVER
      }
      return result.data
    } else {
      const result = falseSchema.safeParse(data)
      if (!result.success) {
        result.error.issues.forEach(err => ctx.addIssue(err))
        return z.NEVER
      }
      return result.data
    }
  }) as ZodSchema<T | U>
}

// テスト用にvalidate関数をエイリアスとしてエクスポート
export { validateWithContext as validate }

// テスト用にvalidateBase関数をエクスポート（内部テスト用）
export { validateBase }