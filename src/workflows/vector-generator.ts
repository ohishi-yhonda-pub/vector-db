/**
 * ベクトル生成ワークフロー
 * FileProcessingWorkflowから分離したベクトル生成機能
 */

import { WorkflowStep } from 'cloudflare:workers'
import { BaseWorkflow } from '../base/workflow'
import { AppError, ErrorCodes } from '../utils/error-handler'
import { TextChunk } from './types'
import { EmbeddingResult } from '../schemas/embedding-result.schema'

/**
 * ベクトル生成パラメータ
 */
export interface VectorGenerationParams {
  chunks: TextChunk[]
  namespace?: string
  metadata?: Record<string, any>
  model?: string
  batchSize?: number
}

/**
 * ベクトル生成結果
 */
export interface VectorGenerationResult {
  vectorIds: string[]
  totalVectors: number
  failedChunks: number
  metadata?: Record<string, any>
}

/**
 * ベクトル生成ワークフロー
 */
export class VectorGenerator extends BaseWorkflow<VectorGenerationParams, VectorGenerationResult> {
  private readonly DEFAULT_BATCH_SIZE = 5
  private readonly MAX_BATCH_SIZE = 10
  private readonly MAX_RETRIES = 3

  /**
   * ワークフロー実行
   */
  protected async execute(
    params: VectorGenerationParams,
    step: WorkflowStep
  ): Promise<VectorGenerationResult> {
    this.logger.info('Starting vector generation', {
      chunks: params.chunks?.length || 0,
      namespace: params.namespace,
      model: params.model
    })

    if (!params.chunks || params.chunks.length === 0) {
      this.logger.warn('No chunks to process')
      return {
        vectorIds: [],
        totalVectors: 0,
        failedChunks: 0
      }
    }

    // バッチサイズを決定
    const batchSize = this.determineBatchSize(params.batchSize)

    // チャンクをバッチに分割
    const batches = this.createBatches(params.chunks, batchSize)
    this.logger.info(`Processing ${batches.length} batches`)

    // 各バッチを処理
    const results = await this.processBatches(batches, params, step)

    // 結果を集約
    return this.aggregateResults(results)
  }

  /**
   * バッチサイズを決定
   */
  private determineBatchSize(requestedSize?: number): number {
    if (!requestedSize) {
      return this.DEFAULT_BATCH_SIZE
    }
    
    if (requestedSize > this.MAX_BATCH_SIZE) {
      this.logger.warn(`Batch size too large, using maximum: ${this.MAX_BATCH_SIZE}`)
      return this.MAX_BATCH_SIZE
    }
    
    if (requestedSize < 1) {
      this.logger.warn('Invalid batch size, using default')
      return this.DEFAULT_BATCH_SIZE
    }
    
    return requestedSize
  }

  /**
   * チャンクをバッチに分割
   */
  private createBatches(chunks: TextChunk[], batchSize: number): TextChunk[][] {
    const batches: TextChunk[][] = []
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      batches.push(chunks.slice(i, i + batchSize))
    }
    
    return batches
  }

  /**
   * バッチを処理
   */
  private async processBatches(
    batches: TextChunk[][],
    params: VectorGenerationParams,
    step: WorkflowStep
  ): Promise<Array<{ vectorIds: string[], failed: number }>> {
    const results: Array<{ vectorIds: string[], failed: number }> = []

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      const batchName = `batch-${i + 1}-of-${batches.length}`
      
      this.reportProgress(i + 1, batches.length, `Processing ${batchName}`)

      const result = await this.executeStep(
        step,
        batchName,
        () => this.processBatch(batch, params),
        { 
          retry: true,
          critical: false // バッチの失敗は全体の失敗にしない
        }
      )

      if (result.success && result.data) {
        results.push(result.data)
      } else {
        this.logger.warn(`Batch ${batchName} failed: ${result.error}`)
        results.push({ vectorIds: [], failed: batch.length })
      }
    }

    return results
  }

  /**
   * 単一バッチを処理
   */
  private async processBatch(
    batch: TextChunk[],
    params: VectorGenerationParams
  ): Promise<{ vectorIds: string[], failed: number }> {
    const vectorIds: string[] = []
    let failedCount = 0

    // バッチ内の各チャンクを並列処理
    const promises = batch.map(chunk => 
      this.generateVectorForChunk(chunk, params)
    )

    const results = await Promise.allSettled(promises)

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        vectorIds.push(result.value)
      } else {
        failedCount++
        if (result.status === 'rejected') {
          this.logger.error('Chunk vector generation failed', result.reason)
        }
      }
    }

    return { vectorIds, failed: failedCount }
  }

  /**
   * 単一チャンクのベクトルを生成
   */
  private async generateVectorForChunk(
    chunk: TextChunk,
    params: VectorGenerationParams
  ): Promise<string> {
    // エンベディングを生成
    const embedding = await this.generateEmbedding(chunk.text, params.model)
    
    if (!embedding.success || !embedding.embedding) {
      throw new Error(`Failed to generate embedding: ${embedding.error}`)
    }

    // ベクトルを保存
    const vectorId = await this.saveVector({
      id: chunk.id,
      values: embedding.embedding,
      namespace: params.namespace || 'default',
      metadata: {
        ...chunk.metadata,
        ...params.metadata,
        chunkIndex: chunk.index,
        textPreview: chunk.text.substring(0, 100)
      }
    })

    return vectorId
  }

  /**
   * エンベディングを生成
   */
  private async generateEmbedding(
    text: string,
    model?: string
  ): Promise<EmbeddingResult> {
    try {
      const embeddingModel = model || this.env.DEFAULT_EMBEDDING_MODEL
      
      const response = await this.env.AI.run(
        embeddingModel as keyof AiModels,
        {
          text: text
        }
      )

      // レスポンスの形式を統一
      if (Array.isArray(response)) {
        return {
          success: true,
          embedding: response,
          model: embeddingModel
        }
      }

      if (response?.data && Array.isArray(response.data)) {
        return {
          success: true,
          embedding: response.data,
          model: embeddingModel
        }
      }

      if (response?.values && Array.isArray(response.values)) {
        return {
          success: true,
          embedding: response.values,
          model: embeddingModel
        }
      }

      throw new Error('Unexpected embedding response format')
    } catch (error) {
      this.logger.error('Embedding generation failed', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        embedding: [],
        model: model || this.env.DEFAULT_EMBEDDING_MODEL
      }
    }
  }

  /**
   * ベクトルを保存
   */
  private async saveVector(vector: {
    id: string
    values: number[]
    namespace: string
    metadata?: Record<string, any>
  }): Promise<string> {
    try {
      // VectorizeIndexに保存
      await this.env.VECTORIZE_INDEX.insert([vector])
      
      this.logger.debug('Vector saved', {
        id: vector.id,
        namespace: vector.namespace
      })
      
      return vector.id
    } catch (error) {
      this.logger.error('Failed to save vector', error, {
        vectorId: vector.id
      })
      throw new AppError(
        ErrorCodes.VECTORIZE_ERROR,
        `Failed to save vector: ${vector.id}`,
        500,
        error
      )
    }
  }

  /**
   * 結果を集約
   */
  private aggregateResults(
    results: Array<{ vectorIds: string[], failed: number }>
  ): VectorGenerationResult {
    const vectorIds: string[] = []
    let failedChunks = 0

    for (const result of results) {
      vectorIds.push(...result.vectorIds)
      failedChunks += result.failed
    }

    const successRate = vectorIds.length > 0 
      ? Math.round((vectorIds.length / (vectorIds.length + failedChunks)) * 100)
      : 0

    this.logger.info('Vector generation completed', {
      totalVectors: vectorIds.length,
      failedChunks,
      successRate: `${successRate}%`
    })

    return {
      vectorIds,
      totalVectors: vectorIds.length,
      failedChunks,
      metadata: {
        successRate,
        processedAt: new Date().toISOString()
      }
    }
  }
}