import { Agent } from 'agents'
import { findSimilarOptionsSchema, cleanupJobsParamsSchema } from './schemas/vector-manager.schema'

interface SearchHistoryEntry {
  timestamp: string
  queryVector: number[]
  resultCount: number
  topScore: number
}

interface VectorJob {
  id: string
  type: 'create' | 'delete'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  createdAt: string
  completedAt?: string
  failedAt?: string
  error?: string
  // For create jobs
  text?: string
  model?: string
  namespace?: string
  metadata?: Record<string, any>
  vectorId?: string
  // For delete jobs
  vectorIds?: string[]
  deletedCount?: number
}

interface FileProcessingJob {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  createdAt: string
  completedAt?: string
  failedAt?: string
  error?: string
  // File info
  fileName: string
  fileType: string
  fileSize: number
  namespace?: string
  metadata?: Record<string, any>
  // Results
  vectorIds?: string[]
  extractedText?: string
  description?: string
}

interface VectorManagerState {
  searchHistory: SearchHistoryEntry[]
  vectorJobs: Record<string, VectorJob>
  fileProcessingJobs: Record<string, FileProcessingJob>
}

export class VectorManager extends Agent<Env, VectorManagerState> {
  private vectorizeIndex: VectorizeIndex

  initialState: VectorManagerState = {
    searchHistory: [],
    vectorJobs: {},
    fileProcessingJobs: {}
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.vectorizeIndex = env.VECTORIZE_INDEX
  }

  // Agentの状態管理を使用した検索履歴の保存
  async trackSearch(query: number[], results: VectorizeMatches) {
    const searchHistory = [...this.state.searchHistory]
    searchHistory.push({
      timestamp: new Date().toISOString(),
      queryVector: query.slice(0, 10), // 最初の10次元のみ保存
      resultCount: results.matches.length,
      topScore: results.matches[0]?.score || 0
    })
    
    // 最新100件のみ保持
    if (searchHistory.length > 100) {
      searchHistory.shift()
    }
    
    this.setState({
      ...this.state,
      searchHistory
    })
  }

  async getSearchHistory(): Promise<SearchHistoryEntry[]> {
    return this.state.searchHistory
  }

  // RPC methods
  async insertVectors(vectors: VectorizeVector[]): Promise<void> {
    await this.vectorizeIndex.insert(vectors)
  }

  async queryVectors(vector: number[], options?: VectorizeQueryOptions): Promise<VectorizeMatches> {
    const results = await this.vectorizeIndex.query(vector, options)
    
    // 検索履歴を非同期で保存
    this.ctx.waitUntil(this.trackSearch(vector, results))
    
    return results
  }

  async getVectorsByIds(ids: string[]): Promise<VectorizeVector[]> {
    return await this.vectorizeIndex.getByIds(ids)
  }

  async deleteVectorsByIds(ids: string[]): Promise<{ count: number }> {
    return await this.vectorizeIndex.deleteByIds(ids)
  }

  async upsertVectors(vectors: VectorizeVector[]): Promise<void> {
    await this.vectorizeIndex.upsert(vectors)
  }

  async findSimilar(
    vectorId: string,
    options?: VectorizeQueryOptions & { excludeSelf?: boolean }
  ): Promise<VectorizeMatches> {
    const vectors = await this.vectorizeIndex.getByIds([vectorId])
    if (!vectors || vectors.length === 0) {
      throw new Error(`Vector ${vectorId} not found`)
    }

    // zodでオプションをパースしてデフォルト値を設定
    const parsedOptions = findSimilarOptionsSchema.parse(options || {})
    
    const queryOptions: VectorizeQueryOptions = {
      topK: parsedOptions.excludeSelf ? parsedOptions.topK + 1 : parsedOptions.topK,
      namespace: parsedOptions.namespace || vectors[0].namespace,
      returnMetadata: parsedOptions.returnMetadata,
      filter: parsedOptions.filter as VectorizeVectorMetadataFilter | undefined
    }

    const results = await this.vectorizeIndex.query(vectors[0].values, queryOptions)

    if (parsedOptions.excludeSelf) {
      results.matches = results.matches
        .filter((match: VectorizeMatch) => match.id !== vectorId)
        .slice(0, parsedOptions.topK)
    }

    return results
  }

  async batchQuery(
    queries: Array<{
      vector: number[]
      options?: VectorizeQueryOptions
    }>
  ): Promise<VectorizeMatches[]> {
    return await Promise.all(
      queries.map(query => 
        this.vectorizeIndex.query(query.vector, query.options)
      )
    )
  }

  // 非同期ベクトル作成（Workflow使用）
  async createVectorAsync(
    text: string,
    model?: string,
    namespace?: string,
    metadata?: Record<string, any>
  ): Promise<{ jobId: string; workflowId: string; status: string }> {
    const jobId = `vec_create_${Date.now()}`
    
    // Workflowを作成
    const workflow = await this.env.VECTOR_OPERATIONS_WORKFLOW.create({
      id: jobId,
      params: {
        type: 'create',
        text,
        model,
        namespace,
        metadata
      }
    })
    
    // ジョブを作成
    const job: VectorJob = {
      id: jobId,
      type: 'create',
      status: 'pending',
      createdAt: new Date().toISOString(),
      text,
      model,
      namespace,
      metadata
    }
    
    this.setState({
      ...this.state,
      vectorJobs: {
        ...this.state.vectorJobs,
        [jobId]: job
      }
    })
    
    return { jobId, workflowId: workflow.id, status: 'processing' }
  }

  // 非同期ベクトル削除（Workflow使用）
  async deleteVectorsAsync(
    vectorIds: string[]
  ): Promise<{ jobId: string; workflowId: string; status: string }> {
    const jobId = `vec_delete_${Date.now()}`
    
    // Workflowを作成
    const workflow = await this.env.VECTOR_OPERATIONS_WORKFLOW.create({
      id: jobId,
      params: {
        type: 'delete',
        vectorIds
      }
    })
    
    // ジョブを作成
    const job: VectorJob = {
      id: jobId,
      type: 'delete',
      status: 'pending',
      createdAt: new Date().toISOString(),
      vectorIds
    }
    
    this.setState({
      ...this.state,
      vectorJobs: {
        ...this.state.vectorJobs,
        [jobId]: job
      }
    })
    
    return { jobId, workflowId: workflow.id, status: 'processing' }
  }

  // Workflowステータスの取得
  async getWorkflowStatus(workflowId: string) {
    const workflow = await this.env.VECTOR_OPERATIONS_WORKFLOW.get(workflowId)
    const status = await workflow.status()
    return status
  }

  // ジョブステータスの更新
  private updateJobStatus(jobId: string, status: VectorJob['status'], updates?: Partial<VectorJob>): void {
    const job = this.state.vectorJobs[jobId]
    if (!job) return
    
    this.setState({
      ...this.state,
      vectorJobs: {
        ...this.state.vectorJobs,
        [jobId]: {
          ...job,
          status,
          ...updates
        }
      }
    })
  }

  // ジョブステータスの取得
  async getJobStatus(jobId: string): Promise<VectorJob | undefined> {
    return this.state.vectorJobs[jobId]
  }

  // すべてのジョブの取得
  async getAllJobs(): Promise<VectorJob[]> {
    return Object.values(this.state.vectorJobs)
  }

  // 古いジョブのクリーンアップ
  async cleanupOldJobs(olderThanHours: number = 24): Promise<number> {
    // パラメータをバリデーション
    const params = cleanupJobsParamsSchema.parse({ olderThanHours })
    const cutoffTime = new Date(Date.now() - params.olderThanHours * 60 * 60 * 1000).toISOString()
    const jobs = this.state.vectorJobs
    const toDelete: string[] = []
    
    for (const [jobId, job] of Object.entries(jobs)) {
      if (job.createdAt < cutoffTime && (job.status === 'completed' || job.status === 'failed')) {
        toDelete.push(jobId)
      }
    }
    
    if (toDelete.length === 0) {
      return 0
    }
    
    const newJobs = { ...jobs }
    toDelete.forEach(jobId => delete newJobs[jobId])
    
    this.setState({
      ...this.state,
      vectorJobs: newJobs
    })
    
    return toDelete.length
  }

  // ファイル処理の非同期実行（Workflow使用）
  async processFileAsync(
    fileData: string,
    fileName: string,
    fileType: string,
    fileSize: number,
    namespace?: string,
    metadata?: Record<string, any>
  ): Promise<{ jobId: string; workflowId: string; status: string }> {
    const jobId = `file_process_${Date.now()}`
    
    // Workflowを作成
    const workflow = await this.env.FILE_PROCESSING_WORKFLOW.create({
      id: jobId,
      params: {
        fileData,
        fileName,
        fileType,
        fileSize,
        namespace,
        metadata
      }
    })
    
    // ジョブを作成
    const job: FileProcessingJob = {
      id: jobId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      fileName,
      fileType,
      fileSize,
      namespace,
      metadata
    }
    
    this.setState({
      ...this.state,
      fileProcessingJobs: {
        ...this.state.fileProcessingJobs,
        [jobId]: job
      }
    })
    
    return { jobId, workflowId: workflow.id, status: 'processing' }
  }

  // ファイル処理ジョブのステータス取得
  async getFileProcessingJob(jobId: string): Promise<FileProcessingJob | undefined> {
    return this.state.fileProcessingJobs[jobId]
  }

  // すべてのファイル処理ジョブの取得
  async getAllFileProcessingJobs(): Promise<FileProcessingJob[]> {
    return Object.values(this.state.fileProcessingJobs)
  }

  // ファイル処理ワークフローのステータス取得
  async getFileProcessingWorkflowStatus(workflowId: string) {
    const workflow = await this.env.FILE_PROCESSING_WORKFLOW.get(workflowId)
    const status = await workflow.status()
    return status
  }

  // ファイル処理ジョブのステータス更新
  private updateFileProcessingJobStatus(
    jobId: string, 
    status: FileProcessingJob['status'], 
    updates?: Partial<FileProcessingJob>
  ): void {
    const job = this.state.fileProcessingJobs[jobId]
    if (!job) return
    
    this.setState({
      ...this.state,
      fileProcessingJobs: {
        ...this.state.fileProcessingJobs,
        [jobId]: {
          ...job,
          status,
          ...updates
        }
      }
    })
  }

  // 古いファイル処理ジョブのクリーンアップ
  async cleanupOldFileProcessingJobs(olderThanHours: number = 24): Promise<number> {
    // パラメータをバリデーション
    const params = cleanupJobsParamsSchema.parse({ olderThanHours })
    const cutoffTime = new Date(Date.now() - params.olderThanHours * 60 * 60 * 1000).toISOString()
    const jobs = this.state.fileProcessingJobs
    const toDelete: string[] = []
    
    for (const [jobId, job] of Object.entries(jobs)) {
      if (job.createdAt < cutoffTime && (job.status === 'completed' || job.status === 'failed')) {
        toDelete.push(jobId)
      }
    }
    
    if (toDelete.length === 0) {
      return 0
    }
    
    const newJobs = { ...jobs }
    toDelete.forEach(jobId => delete newJobs[jobId])
    
    this.setState({
      ...this.state,
      fileProcessingJobs: newJobs
    })
    
    return toDelete.length
  }

  // ベクトル一覧の取得
  async listVectors(options: {
    namespace?: string
    limit?: number
    cursor?: string
  }): Promise<{
    vectors: VectorizeVector[]
    count: number
    nextCursor?: string
  }> {
    // 実際の実装では、Vectorizeから適切にリストを取得する
    // 今はダミーデータを返す
    return {
      vectors: [],
      count: 0,
      nextCursor: undefined
    }
  }
}