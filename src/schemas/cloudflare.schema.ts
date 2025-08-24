import { z } from '@hono/zod-openapi'

// Vectorize関連のスキーマ
export const VectorizeVectorSchema = z.object({
  id: z.string(),
  values: z.array(z.number()),
  namespace: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional()
})

export const VectorizeMatchSchema = z.object({
  id: z.string(),
  score: z.number(),
  metadata: z.record(z.string(), z.any()).optional()
})

export const VectorizeMatchesSchema = z.object({
  matches: z.array(VectorizeMatchSchema)
})

export const VectorizeQueryOptionsSchema = z.object({
  topK: z.number().optional(),
  namespace: z.string().optional(),
  filter: z.record(z.string(), z.any()).optional(),
  returnMetadata: z.boolean().optional()
})

// AI関連のスキーマ
export const AIEmbeddingRequestSchema = z.object({
  text: z.string(),
  model: z.string().optional()
})

export const AIEmbeddingResponseSchema = z.object({
  embedding: z.array(z.number()),
  model: z.string(),
  dimensions: z.number()
})

export const AIBatchEmbeddingRequestSchema = z.object({
  texts: z.array(z.string()),
  model: z.string().optional()
})

export const AIBatchEmbeddingResponseSchema = z.object({
  embeddings: z.array(z.object({
    text: z.string(),
    embedding: z.array(z.number()).nullable(),
    error: z.string().nullable()
  })),
  failed: z.array(z.object({
    text: z.string(),
    embedding: z.null(),
    error: z.string()
  })),
  model: z.string(),
  totalCount: z.number(),
  successCount: z.number(),
  failedCount: z.number()
})

export const AIModelSchema = z.object({
  name: z.string(),
  description: z.string(),
  dimensions: z.number(),
  maxTokens: z.number(),
  recommended: z.boolean()
})

// 型のエクスポート
export type VectorizeVector = z.infer<typeof VectorizeVectorSchema>
export type VectorizeMatch = z.infer<typeof VectorizeMatchSchema>
export type VectorizeMatches = z.infer<typeof VectorizeMatchesSchema>
export type VectorizeQueryOptions = z.infer<typeof VectorizeQueryOptionsSchema>
export type AIEmbeddingRequest = z.infer<typeof AIEmbeddingRequestSchema>
export type AIEmbeddingResponse = z.infer<typeof AIEmbeddingResponseSchema>
export type AIBatchEmbeddingRequest = z.infer<typeof AIBatchEmbeddingRequestSchema>
export type AIBatchEmbeddingResponse = z.infer<typeof AIBatchEmbeddingResponseSchema>
export type AIModel = z.infer<typeof AIModelSchema>