import { Agent } from 'agents'
import { NotionService } from '../services/notion.service'
import { getDb } from '../db'
import type { 
  NotionSyncJob,
  NewNotionSyncJob,
  NotionPage
} from '../db/schema'
import { notionSyncJobs } from '../db/schema'
import { eq } from 'drizzle-orm'
import { jobMetadataSchema, cleanupJobsParamsSchema, listPagesOptionsSchema } from './schemas/notion-manager.schema'

// Notion同期ジョブの状態
interface NotionSyncJobState {
  id: string
  pageId: string
  jobType: 'sync_page' | 'bulk_sync' | 'sync_blocks' | 'sync_properties'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  error?: string
  progress?: {
    currentStep: string
    totalSteps: number
    completedSteps: number
  }
  metadata?: {
    includeBlocks?: boolean
    includeProperties?: boolean
    namespace?: string
    vectorsCreated?: number
    blocksProcessed?: number
    propertiesProcessed?: number
  }
}

// Notion統計情報
interface NotionStats {
  totalPages: number
  totalSyncJobs: number
  completedJobs: number
  failedJobs: number
  totalVectorsCreated: number
  lastSyncAt?: string
}

// NotionManagerの状態
interface NotionManagerState {
  syncJobs: Record<string, NotionSyncJobState>
  stats: NotionStats
  settings: {
    autoSyncEnabled: boolean
    defaultNamespace: string
    maxConcurrentJobs: number
    includeBlocksByDefault: boolean
    includePropertiesByDefault: boolean
  }
}

export class NotionManager extends Agent<Env, NotionManagerState> {
  private notionService?: NotionService

  initialState: NotionManagerState = {
    syncJobs: {},
    stats: {
      totalPages: 0,
      totalSyncJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      totalVectorsCreated: 0
    },
    settings: {
      autoSyncEnabled: false,
      defaultNamespace: 'notion',
      maxConcurrentJobs: 5,
      includeBlocksByDefault: true,
      includePropertiesByDefault: true
    }
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  private getNotionService(): NotionService {
    if (!this.notionService) {
      const notionToken = this.env.NOTION_API_KEY
      if (!notionToken) {
        throw new Error('Notion API token not configured')
      }
      this.notionService = new NotionService(this.env, notionToken)
    }
    return this.notionService
  }

  private get db() {
    return getDb(this.env)
  }

  // ページ同期ジョブを作成
  async createSyncJob(
    pageId: string,
    options: {
      includeBlocks?: boolean
      includeProperties?: boolean
      namespace?: string
    } = {}
  ): Promise<{ jobId: string; workflowId: string; status: string }> {
    const jobId = `notion_sync_${pageId}_${Date.now()}`
    
    // Workflowを作成
    const workflow = await this.env.NOTION_SYNC_WORKFLOW.create({
      id: jobId,
      params: {
        pageId,
        notionToken: this.env.NOTION_API_KEY,
        includeBlocks: options.includeBlocks ?? this.state.settings.includeBlocksByDefault,
        includeProperties: options.includeProperties ?? this.state.settings.includePropertiesByDefault,
        namespace: options.namespace || this.state.settings.defaultNamespace
      }
    })

    // ジョブの状態を作成
    const jobState: NotionSyncJobState = {
      id: jobId,
      pageId,
      jobType: 'sync_page',
      status: 'pending',
      startedAt: new Date().toISOString(),
      progress: {
        currentStep: 'initializing',
        totalSteps: 5,
        completedSteps: 0
      },
      metadata: {
        includeBlocks: options.includeBlocks,
        includeProperties: options.includeProperties,
        namespace: options.namespace
      }
    }

    // 状態を更新
    this.setState({
      ...this.state,
      syncJobs: {
        ...this.state.syncJobs,
        [jobId]: jobState
      },
      stats: {
        ...this.state.stats,
        totalSyncJobs: this.state.stats.totalSyncJobs + 1
      }
    })

    // DBにも記録
    await this.db.insert(notionSyncJobs).values({
      id: jobId,
      pageId,
      jobType: 'sync_page',
      status: 'pending',
      metadata: JSON.stringify(jobState.metadata)
    })

    return { jobId, workflowId: workflow.id, status: 'processing' }
  }

  // バルク同期ジョブを作成
  async createBulkSyncJob(
    pageIds: string[],
    options: {
      includeBlocks?: boolean
      includeProperties?: boolean
      namespace?: string
      maxPages?: number
    } = {}
  ): Promise<{ 
    jobId: string
    syncJobs: Array<{
      pageId: string
      jobId: string
      status: string
    }>
  }> {
    const bulkJobId = `bulk_sync_${Date.now()}`
    const pagesToSync = pageIds.slice(0, options.maxPages || 50)
    const syncJobs = []

    // 各ページに対して個別の同期ジョブを作成
    for (const pageId of pagesToSync) {
      try {
        const result = await this.createSyncJob(pageId, {
          includeBlocks: options.includeBlocks,
          includeProperties: options.includeProperties,
          namespace: options.namespace
        })

        syncJobs.push({
          pageId,
          jobId: result.jobId,
          status: 'processing'
        })
      } catch (error) {
        syncJobs.push({
          pageId,
          jobId: `failed_${Date.now()}`,
          status: 'failed'
        })
      }
    }

    // バルクジョブの状態を記録
    const bulkJobState: NotionSyncJobState = {
      id: bulkJobId,
      pageId: 'bulk',
      jobType: 'bulk_sync',
      status: 'processing',
      startedAt: new Date().toISOString(),
      metadata: {
        includeBlocks: options.includeBlocks,
        includeProperties: options.includeProperties,
        namespace: options.namespace,
        vectorsCreated: 0,
        blocksProcessed: 0,
        propertiesProcessed: 0
      }
    }

    this.setState({
      ...this.state,
      syncJobs: {
        ...this.state.syncJobs,
        [bulkJobId]: bulkJobState
      }
    })

    return { jobId: bulkJobId, syncJobs }
  }

  // ジョブの状態を更新
  async updateJobStatus(
    jobId: string,
    status: NotionSyncJobState['status'],
    updates?: Partial<NotionSyncJobState>
  ): Promise<void> {
    const job = this.state.syncJobs[jobId]
    if (!job) return

    const updatedJob: NotionSyncJobState = {
      ...job,
      status,
      ...updates,
      ...(status === 'completed' && { completedAt: new Date().toISOString() }),
      ...(status === 'failed' && { completedAt: new Date().toISOString() })
    }

    // 状態を更新
    this.setState({
      ...this.state,
      syncJobs: {
        ...this.state.syncJobs,
        [jobId]: updatedJob
      },
      stats: {
        ...this.state.stats,
        completedJobs: status === 'completed' 
          ? this.state.stats.completedJobs + 1 
          : this.state.stats.completedJobs,
        failedJobs: status === 'failed' 
          ? this.state.stats.failedJobs + 1 
          : this.state.stats.failedJobs,
        totalVectorsCreated: updates?.metadata?.vectorsCreated !== undefined
          ? this.state.stats.totalVectorsCreated + updates.metadata.vectorsCreated
          : this.state.stats.totalVectorsCreated,
        lastSyncAt: status === 'completed' ? new Date().toISOString() : this.state.stats.lastSyncAt
      }
    })

    // DBも更新
    await this.db.update(notionSyncJobs)
      .set({
        status: status as any,
        completedAt: updatedJob.completedAt,
        error: updatedJob.error,
        metadata: JSON.stringify(updatedJob.metadata)
      })
      .where(eq(notionSyncJobs.id, jobId))
  }

  // ジョブの状態を取得
  async getJobStatus(jobId: string): Promise<NotionSyncJobState | null> {
    return this.state.syncJobs[jobId] || null
  }

  // すべてのジョブを取得
  async getAllJobs(): Promise<NotionSyncJobState[]> {
    return Object.values(this.state.syncJobs)
  }

  // アクティブなジョブを取得
  async getActiveJobs(): Promise<NotionSyncJobState[]> {
    return Object.values(this.state.syncJobs).filter(
      job => job.status === 'pending' || job.status === 'processing'
    )
  }

  // 統計情報を取得
  async getStats(): Promise<NotionStats> {
    return this.state.stats
  }

  // 設定を更新
  async updateSettings(
    settings: Partial<NotionManagerState['settings']>
  ): Promise<void> {
    this.setState({
      ...this.state,
      settings: {
        ...this.state.settings,
        ...settings
      }
    })
  }

  // 設定を取得
  async getSettings(): Promise<NotionManagerState['settings']> {
    return this.state.settings
  }

  // ページ情報を取得
  async getPage(pageId: string): Promise<NotionPage | Record<string, unknown> | null> {
    const notionService = this.getNotionService()
    
    // まずキャッシュから取得
    let page = await notionService.getPage(pageId)
    
    // キャッシュにない場合はNotion APIから取得
    if (!page) {
      const notionPage = await notionService.fetchPageFromNotion(pageId)
      if (notionPage) {
        await notionService.savePage(notionPage)
        page = await notionService.getPage(pageId)
      }
    }
    
    return page
  }

  // ページ一覧を取得
  async listPages(options: {
    fromCache?: boolean
    archived?: boolean
    limit?: number
  } = {}): Promise<Array<NotionPage | Record<string, unknown>>> {
    const notionService = this.getNotionService()
    
    // オプションをバリデーション
    const parsedOptions = listPagesOptionsSchema.parse(options)
    
    if (parsedOptions.fromCache) {
      return await notionService.getAllPagesFromCache({
        archived: parsedOptions.archived,
        limit: parsedOptions.limit
      })
    }
    
    // Notion APIから検索
    const result = await notionService.searchAllPages({
      page_size: parsedOptions.limit
    })
    
    // キャッシュに保存
    for (const page of result.results) {
      await notionService.savePage(page)
    }
    
    return result.results
  }

  // 古いジョブをクリーンアップ
  async cleanupOldJobs(olderThanHours: number = 24): Promise<number> {
    // パラメータをバリデーション
    const params = cleanupJobsParamsSchema.parse({ olderThanHours })
    const cutoffTime = new Date(Date.now() - params.olderThanHours * 60 * 60 * 1000).toISOString()
    const jobs = this.state.syncJobs
    const toDelete: string[] = []
    
    for (const [jobId, job] of Object.entries(jobs)) {
      if (job.startedAt < cutoffTime && (job.status === 'completed' || job.status === 'failed')) {
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
      syncJobs: newJobs
    })
    
    // DBからも削除
    for (const jobId of toDelete) {
      await this.db.delete(notionSyncJobs).where(eq(notionSyncJobs.id, jobId))
    }
    
    return toDelete.length
  }

  // Workflowの状態を確認
  async getWorkflowStatus(workflowId: string) {
    try {
      const workflow = await this.env.NOTION_SYNC_WORKFLOW.get(workflowId)
      return await workflow.status()
    } catch (error) {
      console.error('Failed to get workflow status:', error)
      return null
    }
  }
}