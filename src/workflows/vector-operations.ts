import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import { z } from 'zod'

// Zodスキーマで型を定義
const CreateOperationParamsSchema = z.object({
  type: z.literal('create'),
  text: z.string(),
  model: z.string().optional(),
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
      // Step 1: Generate embedding
      const embedding = await step.do('generate-embedding', async () => {
        const model = params.model || this.env.DEFAULT_EMBEDDING_MODEL
        // BaseAiTextEmbeddingsModelsの型を使用
        const aiResult = await this.env.AI.run(model as keyof AiModels, { text: params.text })

        if (!('data' in aiResult) || !aiResult.data || aiResult.data.length === 0) {
          throw new Error('Failed to generate embedding')
        }

        return {
          embedding: aiResult.data[0],
          model
        }
      })

      // Step 2: Create vector ID
      const vectorId = await step.do('create-vector-id', async () => {
        return `vec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      })

      // Step 3: Save to Vectorize
      await step.do('save-to-vectorize', async () => {
        const vector: VectorizeVector = {
          id: vectorId,
          values: embedding.embedding,
          namespace: params.namespace || 'default',
          metadata: {
            ...params.metadata,
            model: embedding.model,
            dimensions: embedding.embedding.length.toString(),
            ...(params.text && { text: params.text }),
            createdAt: new Date().toISOString()
          }
        }

        await this.env.VECTORIZE_INDEX.insert([vector])
      })

      return {
        type: 'create',
        success: true,
        vectorId,
        dimensions: embedding.embedding.length,
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