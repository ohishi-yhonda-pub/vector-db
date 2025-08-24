import { z } from '@hono/zod-openapi'

export const VectorMetadataSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  url: z.string().url().optional(),
  timestamp: z.string().datetime().optional(),
}).passthrough()

export const VectorSchema = z.object({
  id: z.string().min(1).openapi({
    example: 'vec_123456',
    description: 'ベクトルの一意識別子'
  }),
  values: z.union([
    z.array(z.number()),
    z.any() // VectorFloatArray (Float32Array)
  ]).openapi({
    example: [0.1, 0.2, 0.3],
    description: 'ベクトルの数値配列またはFloat32Array'
  }),
  namespace: z.string().optional().openapi({
    example: 'default',
    description: 'ベクトルの名前空間'
  }),
  metadata: VectorMetadataSchema.optional().openapi({
    description: 'ベクトルに関連付けられたメタデータ'
  })
})

export const CreateVectorSchema = z.object({
  text: z.string().min(1).openapi({
    example: 'これはサンプルテキストです',
    description: 'ベクトル化するテキスト'
  }),
  model: z.string().optional().openapi({
    example: '@cf/baai/bge-base-en-v1.5',
    description: '使用するモデル名'
  }),
  namespace: z.string().optional().openapi({
    example: 'default',
    description: 'ベクトルの名前空間'
  }),
  metadata: VectorMetadataSchema.optional().openapi({
    description: 'ベクトルに関連付けるメタデータ'
  })
})

export const VectorResponseSchema = z.object({
  success: z.boolean(),
  data: VectorSchema,
  message: z.string().optional()
})

export const VectorListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(VectorSchema),
  count: z.number(),
  message: z.string().optional()
})

export const DeleteVectorResponseSchema = z.object({
  success: z.boolean(),
  deletedCount: z.number(),
  message: z.string().optional()
})

// 非同期操作レスポンススキーマ
export const AsyncVectorOperationResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    jobId: z.string(),
    workflowId: z.string(),
    status: z.string(),
    message: z.string()
  })
})

export type Vector = z.infer<typeof VectorSchema>
export type CreateVector = z.infer<typeof CreateVectorSchema>
export type VectorResponse = z.infer<typeof VectorResponseSchema>
export type VectorListResponse = z.infer<typeof VectorListResponseSchema>
export type DeleteVectorResponse = z.infer<typeof DeleteVectorResponseSchema>
export type VectorMetadata = z.infer<typeof VectorMetadataSchema>
export type AsyncVectorOperationResponse = z.infer<typeof AsyncVectorOperationResponseSchema>