import { z } from 'zod'

// FindSimilarオプションのスキーマ
export const findSimilarOptionsSchema = z.object({
  topK: z.number().int().min(1).max(100).default(10),
  excludeSelf: z.boolean().default(false),
  namespace: z.string().optional(),
  returnMetadata: z.boolean().default(true),
  filter: z.record(z.string(), z.any()).optional()
})

// クリーンアップオプションのスキーマ
export const cleanupJobsParamsSchema = z.object({
  olderThanHours: z.number().positive().default(24)
})

// メタデータスキーマ
export const jobMetadataSchema = z.object({
  vectorsCreated: z.number().int().min(0).optional()
}).passthrough()