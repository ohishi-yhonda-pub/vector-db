/**
 * ベクトルジョブ管理クラス
 * VectorManagerから分離したジョブ管理機能
 */

import { BaseJobManager, Job, JobStatus, JobPriority, CreateJobOptions } from '../base/job-manager'
import { EmbeddingResultSchema, type EmbeddingResult } from '../schemas/embedding-result.schema'
import { cleanupJobsParamsSchema } from './schemas/vector-manager.schema'

/**
 * ベクトルジョブタイプ
 */
export enum VectorJobType {
  CREATE = 'vector:create',
  DELETE = 'vector:delete',
  FILE_PROCESS = 'file:process'
}

/**
 * ベクトルジョブパラメータ
 */
export interface VectorJobParams {
  // For create jobs
  text?: string
  model?: string
  namespace?: string
  metadata?: Record<string, any>
  // For delete jobs
  vectorIds?: string[]
  // For file processing
  fileData?: string
  fileName?: string
  fileType?: string
  fileSize?: number
}

/**
 * ベクトルジョブ結果
 */
export interface VectorJobResult {
  vectorId?: string
  vectorIds?: string[]
  deletedCount?: number
  extractedText?: string
  description?: string
  embedding?: number[]
}

/**
 * ベクトルジョブマネージャー
 */
export class VectorJobManager extends BaseJobManager<VectorJobParams, VectorJobResult> {
  constructor(
    private readonly env: Env,
    private readonly vectorizeIndex: VectorizeIndex
  ) {
    super('vector', env)
  }

  /**
   * ジョブプロセッサーを登録
   */
  protected registerProcessors(): void {
    // ベクトル作成プロセッサー
    this.registerProcessor(VectorJobType.CREATE, async (job) => {
      return await this.processCreateVector(job)
    })

    // ベクトル削除プロセッサー
    this.registerProcessor(VectorJobType.DELETE, async (job) => {
      return await this.processDeleteVectors(job)
    })

    // ファイル処理プロセッサー
    this.registerProcessor(VectorJobType.FILE_PROCESS, async (job) => {
      return await this.processFile(job)
    })
  }

  /**
   * ベクトル作成処理
   */
  private async processCreateVector(
    job: Job<VectorJobParams, VectorJobResult>
  ): Promise<VectorJobResult> {
    const { text, model, namespace, metadata } = job.params

    if (!text) {
      throw new Error('Text is required for vector creation')
    }

    // Step 1: Generate embedding using EmbeddingsWorkflow
    const embeddingWorkflowId = `embed_${job.id}`
    await this.env.EMBEDDINGS_WORKFLOW.create({
      id: embeddingWorkflowId,
      params: {
        text,
        model: model || this.env.DEFAULT_EMBEDDING_MODEL
      }
    })

    // Wait for embedding to complete
    const embeddingResult = await this.waitForWorkflow<EmbeddingResult>(
      this.env.EMBEDDINGS_WORKFLOW,
      embeddingWorkflowId,
      EmbeddingResultSchema
    )

    if (!embeddingResult.success || !embeddingResult.embedding) {
      throw new Error(`Failed to generate embedding: ${embeddingResult.error || 'Unknown error'}`)
    }

    // Step 2: Save vector using VectorOperationsWorkflow
    const vectorWorkflowId = `vec_${job.id}`
    await this.env.VECTOR_OPERATIONS_WORKFLOW.create({
      id: vectorWorkflowId,
      params: {
        type: 'create',
        embedding: embeddingResult.embedding,
        namespace,
        metadata: {
          ...metadata,
          text,
          model: embeddingResult.model
        }
      }
    })

    // Wait for vector operations workflow to complete
    const vectorResult = await this.waitForWorkflow<EmbeddingResult>(
      this.env.VECTOR_OPERATIONS_WORKFLOW,
      vectorWorkflowId,
      EmbeddingResultSchema
    )

    if (!vectorResult.success || !vectorResult.vectorId) {
      throw new Error(`Failed to save vector: ${vectorResult.error || 'Unknown error'}`)
    }

    return {
      vectorId: vectorResult.vectorId,
      embedding: embeddingResult.embedding
    }
  }

  /**
   * ベクトル削除処理
   */
  private async processDeleteVectors(
    job: Job<VectorJobParams, VectorJobResult>
  ): Promise<VectorJobResult> {
    const { vectorIds } = job.params

    if (!vectorIds || vectorIds.length === 0) {
      throw new Error('Vector IDs are required for deletion')
    }

    const result = await this.vectorizeIndex.deleteByIds(vectorIds)
    
    return {
      vectorIds,
      deletedCount: vectorIds.length
    }
  }

  /**
   * ファイル処理
   */
  private async processFile(
    job: Job<VectorJobParams, VectorJobResult>
  ): Promise<VectorJobResult> {
    const { fileData, fileName, fileType, fileSize, namespace, metadata } = job.params

    if (!fileData || !fileName) {
      throw new Error('File data and name are required')
    }

    // Use FILE_PROCESSING_WORKFLOW
    const workflowId = `file_${job.id}`
    await this.env.FILE_PROCESSING_WORKFLOW.create({
      id: workflowId,
      params: {
        fileData,
        fileName,
        fileType,
        fileSize,
        namespace,
        metadata
      }
    })

    // Wait for workflow to complete
    const result = await this.waitForWorkflow<any>(
      this.env.FILE_PROCESSING_WORKFLOW,
      workflowId
    )

    return {
      vectorIds: result.vectorIds,
      extractedText: result.extractedText,
      description: result.description
    }
  }

  /**
   * ワークフロー完了待機
   */
  private async waitForWorkflow<T>(
    workflow: any,
    workflowId: string,
    schema?: any
  ): Promise<T> {
    const instance = await workflow.get(workflowId)
    const maxAttempts = 30 // 30 seconds timeout
    let attempts = 0

    while (attempts < maxAttempts) {
      const statusResult = await instance.status()
      
      this.logger.debug(`Workflow status (${workflowId}):`, {
        attempt: attempts + 1,
        status: statusResult.status
      })

      if (statusResult.status === 'complete' && statusResult.output) {
        return schema ? schema.parse(statusResult.output) : statusResult.output
      } else if (statusResult.status === 'errored') {
        throw new Error(`Workflow failed: ${statusResult.error || 'Unknown error'}`)
      }

      await new Promise(resolve => setTimeout(resolve, 1000))
      attempts++
    }

    throw new Error('Workflow did not complete within timeout')
  }

  /**
   * 古いジョブのクリーンアップ
   */
  async cleanupOldJobs(olderThanHours: number = 24): Promise<number> {
    const params = cleanupJobsParamsSchema.parse({ olderThanHours })
    const cutoffTime = Date.now() - (params.olderThanHours * 60 * 60 * 1000)
    let deletedCount = 0
    
    const completedStatuses = [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]
    
    for (const [id, job] of this.jobs.entries()) {
      // Check if job is completed and created before cutoff time
      if (completedStatuses.includes(job.status)) {
        const createdTime = new Date(job.createdAt).getTime()
        if (createdTime < cutoffTime) {
          this.jobs.delete(id)
          deletedCount++
        }
      }
    }
    
    this.logger.info(`Cleaned up ${deletedCount} old jobs`, { olderThanHours: params.olderThanHours })
    return deletedCount
  }
}