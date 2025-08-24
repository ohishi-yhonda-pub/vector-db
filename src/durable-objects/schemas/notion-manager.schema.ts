import { z } from 'zod'

// メタデータスキーマ
export const jobMetadataSchema = z.object({
  includeBlocks: z.boolean().optional(),
  includeProperties: z.boolean().optional(),
  namespace: z.string().optional(),
  vectorsCreated: z.number().int().min(0).default(0),
  blocksProcessed: z.number().int().min(0).optional(),
  propertiesProcessed: z.number().int().min(0).optional()
}).passthrough()

// クリーンアップパラメータスキーマ
export const cleanupJobsParamsSchema = z.object({
  olderThanHours: z.number().positive().default(24)
})

// リストページオプションスキーマ
export const listPagesOptionsSchema = z.object({
  fromCache: z.boolean().default(false),
  archived: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(100)
})