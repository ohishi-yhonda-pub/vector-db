import { z } from '@hono/zod-openapi'

// Embedding結果のスキーマ（デフォルト値付き）
export const EmbeddingResultSchema = z.object({
  success: z.boolean().default(false),
  embedding: z.array(z.number()).optional().default([]),
  model: z.string().optional().default('unknown'),
  error: z.string().optional(),
  vectorId: z.string().optional().default('')
})

// 型をエクスポート
export type EmbeddingResult = z.infer<typeof EmbeddingResultSchema>