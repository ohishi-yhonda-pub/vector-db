import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers'
import { z } from 'zod'

// 入力パラメータのスキーマ
export const embeddingParamsSchema = z.object({
  text: z.string(),
  model: z.string().optional().default('@cf/baai/bge-base-en-v1.5')
})

export type EmbeddingParams = z.infer<typeof embeddingParamsSchema>

// 結果の型
export interface EmbeddingResult {
  success: boolean
  embedding?: number[]
  model: string
  dimensions?: number
  error?: string
  completedAt: string
}

/**
 * EmbeddingsWorkflow - テキストから埋め込みベクトルを生成するワークフロー
 * このワークフローはEmbedding生成のみを担当し、Vectorizeへの保存は行わない
 */
export class EmbeddingsWorkflow extends WorkflowEntrypoint<Env, EmbeddingParams> {
  async run(event: WorkflowEvent<EmbeddingParams>, step: WorkflowStep): Promise<EmbeddingResult> {
    // パラメータのバリデーション
    const params = embeddingParamsSchema.parse(event.payload)
    const { text, model } = params

    try {
      // Embedding生成ステップ
      const embeddingData = await step.do('generate-embedding', async () => {
        const aiResult = await this.env.AI.run(model as keyof AiModels, { text })

        if (!('data' in aiResult) || !aiResult.data || aiResult.data.length === 0) {
          throw new Error('Failed to generate embedding')
        }

        return {
          embedding: aiResult.data[0],
          dimensions: aiResult.data[0].length
        }
      })

      return {
        success: true,
        embedding: embeddingData.embedding,
        model,
        dimensions: embeddingData.dimensions,
        completedAt: new Date().toISOString()
      }
    } catch (error) {
      return {
        success: false,
        model,
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date().toISOString()
      }
    }
  }
}