import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers'
import { batchEmbeddingParamsSchema, type BatchEmbeddingParams } from './schemas/workflow.schema'

export interface BatchEmbeddingResult {
  embeddings: Array<{
    text: string
    embedding: number[] | null
    error: string | null
  }>
  failed: Array<{
    text: string
    embedding: null
    error: string
  }>
  model: string
  totalCount: number
  successCount: number
  failedCount: number
}

export class BatchEmbeddingsWorkflow extends WorkflowEntrypoint<Env, BatchEmbeddingParams> {
  // 単一のテキストに対して埋め込みを生成するメソッド
  private async generateSingleEmbedding(text: string, model: string = '@cf/baai/bge-base-en-v1.5'): Promise<{
    text: string
    embedding: number[] | null
    error: string | null
  }> {
    try {
      const result = await this.env.AI.run(model as keyof AiModels, { text })
      if ('data' in result && result.data && result.data.length > 0) {
        return {
          text,
          embedding: result.data[0],
          error: null
        }
      } else {
        return {
          text,
          embedding: null,
          error: 'Failed to generate embedding'
        }
      }
    } catch (error) {
      return {
        text,
        embedding: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async run(event: WorkflowEvent<BatchEmbeddingParams>, step: WorkflowStep): Promise<BatchEmbeddingResult> {
    // パラメータをバリデーション
    const params = batchEmbeddingParamsSchema.parse(event.payload)
    const { texts, model, batchSize, saveToVectorize } = params

    // テキストをバッチに分割
    const batches: string[][] = []
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize))
    }

    // 各バッチを順次処理（Workflowのステップとして）
    const allResults: Array<{
      text: string
      embedding: number[] | null
      error: string | null
    }> = []

    for (let i = 0; i < batches.length; i++) {
      const batchResults = await step.do(`process-batch-${i}`, async () => {
        const batch = batches[i]
        // バッチ内のテキストを並列処理
        const embeddings = await Promise.all(
          batch.map(text => this.generateSingleEmbedding(text, model))
        )

        return embeddings
      })

      allResults.push(...batchResults)

      // バッチ間で少し待機（レート制限対策）
      if (i < batches.length - 1) {
        await step.sleep('batch-delay', 100) // 100ms待機
      }
    }

    // 成功と失敗を分離
    const successful = allResults.filter(r => r.embedding !== null)
    const failed = allResults.filter(r => r.embedding === null) as Array<{
      text: string
      embedding: null
      error: string
    }>

    // Vectorizeに保存
    if (saveToVectorize && successful.length > 0) {
      await step.do('save-to-vectorize', async () => {
        const vectors = successful.map((result, index) => ({
          id: `workflow_${Date.now()}_${index}`,
          values: result.embedding!,
          namespace: 'batch-embeddings',
          metadata: {
            text: result.text,
            model: model,
            timestamp: new Date().toISOString()
          }
        }))

        await this.env.VECTORIZE_INDEX.insert(vectors)
        return { savedCount: vectors.length }
      })
    }

    return {
      embeddings: successful,
      failed: failed,
      model: model,
      totalCount: texts.length,
      successCount: successful.length,
      failedCount: failed.length
    }
  }
}