import { Agent } from 'agents'

interface BatchJob {
  texts: string[]
  model?: string
  options?: {
    batchSize?: number
    saveToVectorize?: boolean
    delayMs?: number
  }
  status: 'pending' | 'completed' | 'failed'
  createdAt: string
  completedAt?: string
  failedAt?: string
  result?: BatchJobResult
  error?: string
}

interface BatchJobResult {
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

interface AIEmbeddingsState {
  jobs: Record<string, BatchJob>
}

export class AIEmbeddings extends Agent<Env, AIEmbeddingsState> {
  initialState: AIEmbeddingsState = {
    jobs: {}
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }


  async generateEmbedding(text: string, model?: string): Promise<{ jobId: string; workflowId: string; status: string }> {
    // BatchEmbeddingsWorkflowを使用して単一のテキストを非同期処理
    const jobId = `single_${Date.now()}`
    const workflow = await this.env.BATCH_EMBEDDINGS_WORKFLOW.create({
      id: jobId,
      params: {
        texts: [text], // 単一のテキストを配列として渡す
        model: model || this.env.DEFAULT_EMBEDDING_MODEL,
        batchSize: 1,
        saveToVectorize: false
      }
    })
    
    // ジョブの状態を保存
    const job: BatchJob = {
      texts: [text],
      model,
      options: { batchSize: 1, saveToVectorize: false },
      status: 'pending',
      createdAt: new Date().toISOString()
    }
    
    this.setState({
      jobs: {
        ...this.state.jobs,
        [jobId]: job
      }
    })
    
    // 非同期で結果を返す
    return { jobId, workflowId: workflow.id, status: 'processing' }
  }

  // Agentのスケジューリング機能を使用したバッチ処理
  async scheduleBatchEmbeddings(texts: string[], model?: string, options?: {
    batchSize?: number
    saveToVectorize?: boolean
    delayMs?: number
  }) {
    const jobId = `batch_${Date.now()}`
    
    // Workflowを使用してバッチ処理を実行
    const workflow = await this.env.BATCH_EMBEDDINGS_WORKFLOW.create({
      id: jobId,
      params: {
        texts,
        model: model || this.env.DEFAULT_EMBEDDING_MODEL,
        batchSize: options?.batchSize || 10,
        saveToVectorize: options?.saveToVectorize || false
      }
    })
    
    // ジョブの状態を保存
    const job: BatchJob = {
      texts,
      model,
      options,
      status: 'pending',
      createdAt: new Date().toISOString()
    }
    
    this.setState({
      jobs: {
        ...this.state.jobs,
        [jobId]: job
      }
    })
    
    return { jobId, workflowId: workflow.id, status: 'scheduled', textsCount: texts.length }
  }


  async getJobStatus(jobId: string): Promise<BatchJob | undefined> {
    return this.state.jobs[jobId]
  }

  async getWorkflowStatus(workflowId: string) {
    const workflow = await this.env.BATCH_EMBEDDINGS_WORKFLOW.get(workflowId)
    const status = await workflow.status()
    return status
  }

  async generateBatchEmbeddings(texts: string[], model?: string, options?: {
    batchSize?: number
    saveToVectorize?: boolean
  }): Promise<{ jobId: string; workflowId: string; status: string; textsCount: number }> {
    // 常にWorkflowを使用（非同期）
    const jobId = `batch_${Date.now()}`
    const workflow = await this.env.BATCH_EMBEDDINGS_WORKFLOW.create({
      id: jobId,
      params: {
        texts,
        model: model || this.env.DEFAULT_EMBEDDING_MODEL,
        batchSize: options?.batchSize || 10,
        saveToVectorize: options?.saveToVectorize || false
      }
    })
    
    // ジョブの状態を保存
    const job: BatchJob = {
      texts,
      model,
      options,
      status: 'pending',
      createdAt: new Date().toISOString()
    }
    
    this.setState({
      jobs: {
        ...this.state.jobs,
        [jobId]: job
      }
    })
    
    // 非同期で結果を返す
    return { jobId, workflowId: workflow.id, status: 'processing', textsCount: texts.length }
  }


  async getAvailableModels(): Promise<Array<{
    name: string
    description: string
    dimensions: number
    maxTokens: number
    recommended: boolean
  }>> {
    return [
      {
        name: '@cf/baai/bge-base-en-v1.5',
        description: 'BAAI General Embedding - English v1.5',
        dimensions: 768,
        maxTokens: 512,
        recommended: true
      },
      {
        name: '@cf/baai/bge-small-en-v1.5',
        description: 'BAAI General Embedding Small - English v1.5',
        dimensions: 384,
        maxTokens: 512,
        recommended: false
      },
      {
        name: '@cf/baai/bge-large-en-v1.5',
        description: 'BAAI General Embedding Large - English v1.5',
        dimensions: 1024,
        maxTokens: 512,
        recommended: false
      }
    ]
  }
}