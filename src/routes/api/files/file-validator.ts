import { z } from '@hono/zod-openapi'
import type { ErrorResponse } from '../../../schemas/error.schema'

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export const SUPPORTED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
] as const

export type SupportedFileType = typeof SUPPORTED_FILE_TYPES[number]

// メタデータのバリデーションスキーマ
export const MetadataSchema = z.string().nullable().optional().transform((val, ctx) => {
  if (!val) return {}
  try {
    return JSON.parse(val)
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'メタデータのバリデーションに失敗しました'
    })
    return z.NEVER
  }
})

export class FileValidator {
  static validateFile(file: unknown): file is File {
    return file instanceof File
  }

  static validateFileSize(file: File): { valid: boolean; error?: ErrorResponse } {
    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: {
          success: false,
          error: 'Payload Too Large',
          message: 'ファイルサイズは10MB以下にしてください'
        }
      }
    }
    return { valid: true }
  }

  static validateFileType(file: File): { valid: boolean; error?: ErrorResponse } {
    const fileType = file.type as SupportedFileType
    if (!SUPPORTED_FILE_TYPES.includes(fileType)) {
      return {
        valid: false,
        error: {
          success: false,
          error: 'Unsupported Media Type',
          message: `サポートされていないファイル形式です: ${file.type}`
        }
      }
    }
    return { valid: true }
  }

  static validateMetadata(metadataStr: string | null): { 
    valid: boolean; 
    data?: any; 
    error?: ErrorResponse 
  } {
    const parseResult = MetadataSchema.safeParse(metadataStr)
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]
      return {
        valid: false,
        error: {
          success: false,
          error: 'Bad Request',
          message: firstError.message
        }
      }
    }
    return { valid: true, data: parseResult.data }
  }
}