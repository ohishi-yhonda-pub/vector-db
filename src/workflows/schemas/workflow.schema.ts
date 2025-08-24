import { z } from 'zod'

// Batch Embeddings schemas
export const batchEmbeddingParamsSchema = z.object({
  texts: z.array(z.string().min(1)),
  model: z.string().default('@cf/baai/bge-base-en-v1.5'),
  batchSize: z.number().int().min(1).max(100).default(10),
  saveToVectorize: z.boolean().default(false)
})

export const batchEmbeddingResultSchema = z.object({
  text: z.string(),
  embedding: z.array(z.number()).nullable(),
  error: z.string().nullable()
})

// File Processing schemas
export const fileProcessingParamsSchema = z.object({
  fileData: z.string().min(1),
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  fileSize: z.number().int().positive(),
  namespace: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional()
})

// Notion Sync schemas
export const notionSyncParamsSchema = z.object({
  pageId: z.string().min(1),
  notionToken: z.string().min(1),
  includeBlocks: z.boolean().default(true),
  includeProperties: z.boolean().default(true),
  namespace: z.string().default('notion')
})

// Vector Operations schemas
export const vectorOperationParamsSchema = z.object({
  type: z.enum(['create', 'delete']),
  // For create operations
  text: z.string().optional(),
  model: z.string().optional(),
  namespace: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  // For delete operations
  vectorIds: z.array(z.string()).optional()
})

export type BatchEmbeddingParams = z.infer<typeof batchEmbeddingParamsSchema>
export type FileProcessingParams = z.infer<typeof fileProcessingParamsSchema>
export type NotionSyncParams = z.infer<typeof notionSyncParamsSchema>
export type VectorOperationParams = z.infer<typeof vectorOperationParamsSchema>