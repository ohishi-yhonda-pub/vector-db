import { z } from '@hono/zod-openapi'
import { VectorMetadataSchema } from './vector.schema'

// サポートするファイルタイプ
export const SupportedFileTypes = z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'])

// ファイルアップロードのフォームデータスキーマ
export const FileUploadSchema = z.object({
  file: z.instanceof(File).refine(
    (file) => file.size <= 10 * 1024 * 1024, // 10MB max
    { message: 'ファイルサイズは10MB以下にしてください' }
  ),
  namespace: z.string().optional(),
  metadata: z.string().optional() // JSON string として受け取る
})

// ファイル処理レスポンススキーマ
export const FileProcessingResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    jobId: z.string(),
    workflowId: z.string(),
    status: z.string(),
    fileInfo: z.object({
      name: z.string(),
      type: z.string(),
      size: z.number()
    }),
    message: z.string()
  })
})

// ファイル処理結果スキーマ
export const FileProcessingResultSchema = z.object({
  type: z.enum(['pdf', 'image']),
  success: z.boolean(),
  content: z.object({
    text: z.string().optional(),
    description: z.string().optional(),
    extractedPages: z.number().optional(),
    metadata: z.record(z.string(), z.any()).optional()
  }),
  vectorIds: z.array(z.string()),
  error: z.string().optional()
})

export type SupportedFileType = z.infer<typeof SupportedFileTypes>
export type FileUpload = z.infer<typeof FileUploadSchema>
export type FileProcessingResponse = z.infer<typeof FileProcessingResponseSchema>
export type FileProcessingResult = z.infer<typeof FileProcessingResultSchema>