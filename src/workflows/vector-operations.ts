import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import { z } from 'zod'

// Zodスキーマで型を定義
const CreateOperationParamsSchema = z.object({
  type: z.literal('create'),
  embedding: z.array(z.number()),  // テキストではなく、生成済みのembeddingを受け取る
  vectorId: z.string().optional(),  // オプションでIDを指定可能
  namespace: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional()
})

const DeleteOperationParamsSchema = z.object({
  type: z.literal('delete'),
  vectorIds: z.array(z.string())
})

export const VectorOperationParamsSchema = z.discriminatedUnion('type', [
  CreateOperationParamsSchema,
  DeleteOperationParamsSchema
])

export type VectorOperationParams = z.infer<typeof VectorOperationParamsSchema>

export interface VectorOperationResult {
  type: 'create' | 'delete'
  success: boolean
  // For create operations
  vectorId?: string
  dimensions?: number
  // For delete operations
  deletedCount?: number
  // Common
  error?: string
  completedAt: string
}

export class VectorOperationsWorkflow extends WorkflowEntrypoint<Env, VectorOperationParams> {
  async run(event: WorkflowEvent<VectorOperationParams>, step: WorkflowStep): Promise<VectorOperationResult> {
    // Zodでパラメータを検証
    const params = VectorOperationParamsSchema.parse(event.payload)

    if (params.type === 'create') {
      return await this.handleCreateOperation(params, step)
    } else {
      return await this.handleDeleteOperation(params, step)
    }
  }

  private async handleCreateOperation(
    params: z.infer<typeof CreateOperationParamsSchema>,
    step: WorkflowStep
  ): Promise<VectorOperationResult> {
    try {
      // Step 1: Create vector ID (既に指定されていない場合)
      const vectorId = await step.do('create-vector-id', async () => {
        return params.vectorId || `vec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      })

      // Step 2: Save to Vectorize (既に生成済みのembeddingを保存)
      await step.do('save-to-vectorize', async () => {
        const vector: VectorizeVector = {
          id: vectorId,
          values: params.embedding,
          namespace: params.namespace || 'default',
          metadata: {
            ...params.metadata,
            dimensions: params.embedding.length.toString(),
            createdAt: new Date().toISOString()
          }
        }

        await this.env.VECTORIZE_INDEX.insert([vector])
      })

      return {
        type: 'create',
        success: true,
        vectorId,
        dimensions: params.embedding.length,
        completedAt: new Date().toISOString()
      }
    } catch (error) {
      return {
        type: 'create',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date().toISOString()
      }
    }
  }

  private async handleDeleteOperation(
    params: z.infer<typeof DeleteOperationParamsSchema>,
    step: WorkflowStep
  ): Promise<VectorOperationResult> {
    try {
      // Delete vectors from Vectorize
      const result = await step.do('delete-from-vectorize', async () => {
        return await this.env.VECTORIZE_INDEX.deleteByIds(params.vectorIds)
      })

      return {
        type: 'delete',
        success: true,
        deletedCount: result.count,
        completedAt: new Date().toISOString()
      }
    } catch (error) {
      return {
        type: 'delete',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date().toISOString()
      }
    }
  }
}