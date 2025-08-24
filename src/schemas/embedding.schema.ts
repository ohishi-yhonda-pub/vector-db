import { z } from '@hono/zod-openapi'

// 埋め込み生成スキーマ
export const GenerateEmbeddingSchema = z.object({
  text: z.string().min(1).openapi({
    example: 'This is a sample text to generate embeddings',
    description: '埋め込みを生成するテキスト'
  }),
  model: z.string().optional().openapi({
    example: '@cf/baai/bge-base-en-v1.5',
    description: '使用するモデル名'
  })
})

export const GenerateEmbeddingResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    jobId: z.string(),
    workflowId: z.string(),
    status: z.string()
  }),
  message: z.string()
})

// バッチ埋め込み生成スキーマ
export const BatchEmbeddingSchema = z.object({
  texts: z.array(z.string()).min(1).openapi({
    example: ['Text 1', 'Text 2', 'Text 3'],
    description: '埋め込みを生成するテキストの配列'
  }),
  model: z.string().optional(),
  batchSize: z.number().int().min(1).max(100).optional(),
  saveToVectorize: z.boolean().optional()
})

export const BatchEmbeddingResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    jobId: z.string(),
    workflowId: z.string(),
    status: z.string(),
    textsCount: z.number()
  }),
  message: z.string()
})

// スケジュールバッチ埋め込みスキーマ
export const ScheduleBatchEmbeddingSchema = BatchEmbeddingSchema.extend({
  delayMs: z.number().int().min(0).optional()
})

export const ScheduleBatchResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    jobId: z.string(),
    workflowId: z.string().optional(),
    status: z.string(),
    textsCount: z.number()
  }),
  message: z.string()
})

// モデル情報スキーマ
export const ModelInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
  dimensions: z.number(),
  maxTokens: z.number(),
  recommended: z.boolean()
})

export const ListModelsResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(ModelInfoSchema)
})

// 型定義のエクスポート
export type GenerateEmbedding = z.infer<typeof GenerateEmbeddingSchema>
export type GenerateEmbeddingResponse = z.infer<typeof GenerateEmbeddingResponseSchema>
export type BatchEmbedding = z.infer<typeof BatchEmbeddingSchema>
export type BatchEmbeddingResponse = z.infer<typeof BatchEmbeddingResponseSchema>
export type ScheduleBatchEmbedding = z.infer<typeof ScheduleBatchEmbeddingSchema>
export type ScheduleBatchResponse = z.infer<typeof ScheduleBatchResponseSchema>
export type ModelInfo = z.infer<typeof ModelInfoSchema>
export type ListModelsResponse = z.infer<typeof ListModelsResponseSchema>