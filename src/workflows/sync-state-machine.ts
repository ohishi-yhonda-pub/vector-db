/**
 * Notion同期ステートマシン
 * 同期プロセスの状態管理と進行制御
 */

import { WorkflowStep } from 'cloudflare:workers'
import { AppError, ErrorCodes } from '../utils/error-handler'

export type SyncState = 'initializing' | 'fetching_page' | 'processing_properties' | 'processing_blocks' | 'creating_vectors' | 'completing' | 'failed'

export interface SyncContext {
  pageId: string
  includeBlocks: boolean
  includeProperties: boolean
  namespace?: string
  vectorsCreated: number
  propertiesProcessed: number
  blocksProcessed: number
  errors: string[]
}

export interface SyncStepResult {
  state: SyncState
  success: boolean
  data?: any
  error?: string
  vectorsCreated?: number
  propertiesProcessed?: number
  blocksProcessed?: number
}

/**
 * 同期ステートマシン
 * Workflowの各ステップの実行順序と状態を管理
 */
export class SyncStateMachine {
  private currentState: SyncState = 'initializing'
  private context: SyncContext

  constructor(context: SyncContext) {
    this.context = { ...context }
  }

  /**
   * 現在の状態を取得
   */
  getCurrentState(): SyncState {
    return this.currentState
  }

  /**
   * 状態を更新
   */
  setState(state: SyncState): void {
    console.log(`[SyncStateMachine] State transition: ${this.currentState} -> ${state}`)
    this.currentState = state
  }

  /**
   * コンテキストを更新
   */
  updateContext(updates: Partial<SyncContext>): void {
    this.context = { ...this.context, ...updates }
  }

  /**
   * 初期化ステップ
   */
  async initialize(step: WorkflowStep): Promise<SyncStepResult> {
    this.setState('initializing')
    
    try {
      const result = await step.do('initialize', async () => {
        // バリデーションとセットアップ
        if (!this.context.pageId) {
          throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            'Page ID is required',
            400
          )
        }

        console.log(`[SyncStateMachine] Initializing sync for page: ${this.context.pageId}`)
        console.log(`[SyncStateMachine] Include blocks: ${this.context.includeBlocks}`)
        console.log(`[SyncStateMachine] Include properties: ${this.context.includeProperties}`)
        console.log(`[SyncStateMachine] Namespace: ${this.context.namespace || 'default'}`)

        return {
          initialized: true,
          timestamp: new Date().toISOString()
        }
      })

      return {
        state: 'fetching_page',
        success: true,
        data: result
      }
    } catch (error: any) {
      this.setState('failed')
      return {
        state: 'failed',
        success: false,
        error: error.message
      }
    }
  }

  /**
   * ページ取得ステップ
   */
  async fetchPage(step: WorkflowStep, fetchFn: () => Promise<any>): Promise<SyncStepResult> {
    this.setState('fetching_page')
    
    try {
      const pageData = await step.do('fetch-page', fetchFn)
      
      if (!pageData) {
        throw new AppError(
          ErrorCodes.NOT_FOUND,
          `Page not found: ${this.context.pageId}`,
          404
        )
      }

      console.log(`[SyncStateMachine] Page fetched successfully: ${pageData.id}`)
      
      return {
        state: 'processing_properties',
        success: true,
        data: pageData
      }
    } catch (error: any) {
      this.setState('failed')
      return {
        state: 'failed',
        success: false,
        error: error.message
      }
    }
  }

  /**
   * プロパティ処理ステップ
   */
  async processProperties(step: WorkflowStep, processFn: () => Promise<any>): Promise<SyncStepResult> {
    if (!this.context.includeProperties) {
      console.log('[SyncStateMachine] Skipping properties processing')
      return {
        state: 'processing_blocks',
        success: true,
        propertiesProcessed: 0
      }
    }

    this.setState('processing_properties')
    
    try {
      const result = await step.do('process-properties', processFn)
      
      const propertiesProcessed = result?.propertiesProcessed || 0
      const vectorsCreated = result?.vectorsCreated || 0
      
      this.updateContext({ 
        propertiesProcessed: this.context.propertiesProcessed + propertiesProcessed,
        vectorsCreated: this.context.vectorsCreated + vectorsCreated
      })

      console.log(`[SyncStateMachine] Properties processed: ${propertiesProcessed}`)
      console.log(`[SyncStateMachine] Vectors from properties: ${vectorsCreated}`)
      
      return {
        state: 'processing_blocks',
        success: true,
        data: result,
        propertiesProcessed,
        vectorsCreated
      }
    } catch (error: any) {
      this.setState('failed')
      return {
        state: 'failed',
        success: false,
        error: error.message
      }
    }
  }

  /**
   * ブロック処理ステップ
   */
  async processBlocks(step: WorkflowStep, processFn: () => Promise<any>): Promise<SyncStepResult> {
    if (!this.context.includeBlocks) {
      console.log('[SyncStateMachine] Skipping blocks processing')
      return {
        state: 'completing',
        success: true,
        blocksProcessed: 0
      }
    }

    this.setState('processing_blocks')
    
    try {
      const result = await step.do('process-blocks', processFn)
      
      const blocksProcessed = result?.blocksProcessed || 0
      const vectorsCreated = result?.vectorsCreated || 0
      
      this.updateContext({ 
        blocksProcessed: this.context.blocksProcessed + blocksProcessed,
        vectorsCreated: this.context.vectorsCreated + vectorsCreated
      })

      console.log(`[SyncStateMachine] Blocks processed: ${blocksProcessed}`)
      console.log(`[SyncStateMachine] Vectors from blocks: ${vectorsCreated}`)
      
      return {
        state: 'completing',
        success: true,
        data: result,
        blocksProcessed,
        vectorsCreated
      }
    } catch (error: any) {
      this.setState('failed')
      return {
        state: 'failed',
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 完了ステップ
   */
  async complete(step: WorkflowStep): Promise<SyncStepResult> {
    this.setState('completing')
    
    try {
      const summary = await step.do('complete', async () => {
        const totalVectors = this.context.vectorsCreated
        const totalProperties = this.context.propertiesProcessed
        const totalBlocks = this.context.blocksProcessed

        console.log(`[SyncStateMachine] Sync completed for page: ${this.context.pageId}`)
        console.log(`[SyncStateMachine] Total vectors created: ${totalVectors}`)
        console.log(`[SyncStateMachine] Properties processed: ${totalProperties}`)
        console.log(`[SyncStateMachine] Blocks processed: ${totalBlocks}`)

        return {
          pageId: this.context.pageId,
          vectorsCreated: totalVectors,
          propertiesProcessed: totalProperties,
          blocksProcessed: totalBlocks,
          namespace: this.context.namespace,
          completedAt: new Date().toISOString()
        }
      })

      return {
        state: 'completing',
        success: true,
        data: summary,
        vectorsCreated: this.context.vectorsCreated,
        propertiesProcessed: this.context.propertiesProcessed,
        blocksProcessed: this.context.blocksProcessed
      }
    } catch (error: any) {
      this.setState('failed')
      return {
        state: 'failed',
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 現在のコンテキストを取得
   */
  getContext(): SyncContext {
    return { ...this.context }
  }

  /**
   * エラー情報を追加
   */
  addError(error: string): void {
    this.context.errors.push(error)
  }

  /**
   * 同期の進捗率を計算
   */
  getProgress(): { current: number; total: number; percentage: number } {
    const steps = ['initializing', 'fetching_page', 'processing_properties', 'processing_blocks', 'completing']
    const currentIndex = steps.indexOf(this.currentState)
    const total = steps.length
    const current = currentIndex + 1
    const percentage = Math.round((current / total) * 100)

    return { current, total, percentage }
  }
}