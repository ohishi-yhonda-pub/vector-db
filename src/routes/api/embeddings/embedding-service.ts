/**
 * 埋め込みサービス共通処理
 */

import { AIEmbeddings } from '../../../durable-objects/ai-embeddings'
import { AppError, ErrorCodes } from '../../../utils/error-handler'
import { createLogger, Logger } from '../../../middleware/logging'

/**
 * 埋め込み生成結果
 */
export interface EmbeddingResult {
  workflowId: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  embedding?: number[]
  model?: string
  error?: string
  startedAt?: string
  completedAt?: string
}

/**
 * バッチ埋め込み生成結果
 */
export interface BatchEmbeddingResult {
  batchId: string
  workflowIds: string[]
  textsCount: number
  status: 'queued' | 'processing' | 'completed' | 'failed'
  processedCount?: number
  failedCount?: number
  startedAt?: string
  completedAt?: string
}

/**
 * 埋め込みジョブ情報
 */
export interface EmbeddingJob {
  id: string
  type: 'single' | 'batch'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  model: string
  createdAt: string
  completedAt?: string
  result?: any
  error?: string
}

/**
 * 埋め込みサービスクラス
 */
export class EmbeddingService {
  private logger: Logger
  private aiEmbeddings: DurableObjectStub<AIEmbeddings>

  constructor(private env: Env) {
    this.logger = createLogger('EmbeddingService', env)
    
    // Durable Objectの初期化
    const aiEmbeddingsId = env.AI_EMBEDDINGS.idFromName('default')
    this.aiEmbeddings = env.AI_EMBEDDINGS.get(aiEmbeddingsId)
  }

  /**
   * 単一テキストの埋め込み生成
   */
  async generateEmbedding(
    text: string,
    model?: string
  ): Promise<EmbeddingResult> {
    try {
      this.logger.info('Generating embedding', {
        textLength: text.length,
        model: model || this.env.DEFAULT_EMBEDDING_MODEL
      })

      const result = await this.aiEmbeddings.generateEmbedding(
        text,
        model || this.env.DEFAULT_EMBEDDING_MODEL
      )

      this.logger.info('Embedding generation initiated', {
        workflowId: result.workflowId
      })

      return result
    } catch (error) {
      this.logger.error('Failed to generate embedding', error)
      throw new AppError(
        ErrorCodes.EMBEDDING_GENERATION_ERROR,
        `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        error
      )
    }
  }

  /**
   * バッチテキストの埋め込み生成
   */
  async generateBatchEmbeddings(
    texts: string[],
    model?: string,
    options: {
      batchSize?: number
      saveToVectorize?: boolean
      namespace?: string
      metadata?: Record<string, any>
    } = {}
  ): Promise<BatchEmbeddingResult> {
    try {
      // 入力検証
      if (!texts || texts.length === 0) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          'No texts provided for batch embedding',
          400
        )
      }

      if (texts.length > 100) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          'Batch size exceeds maximum limit of 100',
          400
        )
      }

      this.logger.info('Generating batch embeddings', {
        textsCount: texts.length,
        model: model || this.env.DEFAULT_EMBEDDING_MODEL,
        batchSize: options.batchSize || 10
      })

      const result = await this.aiEmbeddings.generateBatchEmbeddings(
        texts,
        model || this.env.DEFAULT_EMBEDDING_MODEL,
        {
          batchSize: options.batchSize || 10,
          saveToVectorize: options.saveToVectorize || false,
          namespace: options.namespace,
          metadata: options.metadata
        }
      )

      this.logger.info('Batch embedding generation initiated', {
        batchId: result.batchId,
        workflowCount: result.workflowIds.length
      })

      return result
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      
      this.logger.error('Failed to generate batch embeddings', error)
      throw new AppError(
        ErrorCodes.EMBEDDING_GENERATION_ERROR,
        `Failed to generate batch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        error
      )
    }
  }

  /**
   * 埋め込み生成ステータスの取得
   */
  async getEmbeddingStatus(workflowId: string): Promise<EmbeddingResult> {
    try {
      const status = await this.aiEmbeddings.getEmbeddingStatus(workflowId)
      
      if (!status) {
        throw new AppError(
          ErrorCodes.WORKFLOW_NOT_FOUND,
          `Workflow not found: ${workflowId}`,
          404
        )
      }

      return status
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      
      this.logger.error('Failed to get embedding status', error, { workflowId })
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to get embedding status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        error
      )
    }
  }

  /**
   * スケジュール済み埋め込みジョブの作成
   */
  async scheduleEmbedding(
    text: string,
    scheduleAt: Date,
    model?: string,
    options: {
      namespace?: string
      metadata?: Record<string, any>
      priority?: number
    } = {}
  ): Promise<EmbeddingJob> {
    try {
      this.logger.info('Scheduling embedding', {
        textLength: text.length,
        scheduleAt: scheduleAt.toISOString(),
        model: model || this.env.DEFAULT_EMBEDDING_MODEL
      })

      const job = await this.aiEmbeddings.scheduleEmbedding(
        text,
        scheduleAt,
        model || this.env.DEFAULT_EMBEDDING_MODEL,
        options
      )

      this.logger.info('Embedding scheduled', {
        jobId: job.id,
        scheduleAt: scheduleAt.toISOString()
      })

      return job
    } catch (error) {
      this.logger.error('Failed to schedule embedding', error)
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to schedule embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        error
      )
    }
  }

  /**
   * 利用可能なモデルの取得
   */
  async getAvailableModels(): Promise<{
    models: Array<{
      id: string
      name: string
      dimensions: number
      maxTokens: number
      supported: boolean
    }>
    defaultModel: string
  }> {
    try {
      const models = await this.aiEmbeddings.getAvailableModels()
      
      return {
        models,
        defaultModel: this.env.DEFAULT_EMBEDDING_MODEL
      }
    } catch (error) {
      this.logger.error('Failed to get available models', error)
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to get available models: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        error
      )
    }
  }

  /**
   * 埋め込みジョブのキャンセル
   */
  async cancelEmbedding(workflowId: string): Promise<boolean> {
    try {
      this.logger.info('Cancelling embedding', { workflowId })
      
      const result = await this.aiEmbeddings.cancelEmbedding(workflowId)
      
      if (result) {
        this.logger.info('Embedding cancelled', { workflowId })
      } else {
        this.logger.warn('Failed to cancel embedding', { workflowId })
      }
      
      return result
    } catch (error) {
      this.logger.error('Failed to cancel embedding', error, { workflowId })
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to cancel embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        error
      )
    }
  }

  /**
   * 埋め込み統計情報の取得
   */
  async getEmbeddingStats(): Promise<{
    totalGenerated: number
    totalFailed: number
    averageProcessingTime: number
    modelsUsed: Record<string, number>
    lastGeneratedAt?: string
  }> {
    try {
      return await this.aiEmbeddings.getStatistics()
    } catch (error) {
      this.logger.error('Failed to get embedding statistics', error)
      
      // エラーの場合はデフォルト値を返す
      return {
        totalGenerated: 0,
        totalFailed: 0,
        averageProcessingTime: 0,
        modelsUsed: {}
      }
    }
  }
}