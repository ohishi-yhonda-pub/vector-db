/**
 * Notion API通信層
 * Notion APIとの通信を管理
 */

import { NotionService } from '../services/notion.service'
import type { NotionPage } from '../db/schema'
import { AppError, ErrorCodes } from '../utils/error-handler'

export interface NotionApiConfig {
  apiKey: string
  defaultNamespace?: string
  includeBlocksByDefault?: boolean
  includePropertiesByDefault?: boolean
}

export interface PageSyncOptions {
  includeBlocks?: boolean
  includeProperties?: boolean
  namespace?: string
}

export interface BulkSyncOptions extends PageSyncOptions {
  limit?: number
  startCursor?: string
}

/**
 * Notion APIクライアント
 * Notion APIとの通信を管理し、データ取得を行う
 */
export class NotionApiClient {
  private notionService: NotionService
  private config: NotionApiConfig

  constructor(env: Env, config: NotionApiConfig) {
    if (!config.apiKey) {
      throw new AppError(
        ErrorCodes.CONFIGURATION_ERROR,
        'Notion API key is required',
        500
      )
    }

    this.config = {
      defaultNamespace: 'notion',
      includeBlocksByDefault: true,
      includePropertiesByDefault: true,
      ...config
    }

    this.notionService = new NotionService(env, config.apiKey)
  }

  /**
   * ページ情報を取得
   */
  async fetchPage(pageId: string): Promise<NotionPage | null> {
    try {
      const page = await this.notionService.getPage(pageId)
      return page
    } catch (error: any) {
      if (error.status === 404) {
        return null
      }
      throw new AppError(
        ErrorCodes.EXTERNAL_SERVICE_ERROR,
        `Failed to fetch Notion page: ${error.message}`,
        500,
        { pageId, originalError: error }
      )
    }
  }

  /**
   * ページのブロックを取得
   */
  async fetchBlocks(pageId: string): Promise<any[]> {
    try {
      const blocks = await this.notionService.getBlocks(pageId)
      return blocks || []
    } catch (error: any) {
      throw new AppError(
        ErrorCodes.EXTERNAL_SERVICE_ERROR,
        `Failed to fetch Notion blocks: ${error.message}`,
        500,
        { pageId, originalError: error }
      )
    }
  }

  /**
   * ページのプロパティを取得
   */
  async fetchProperties(pageId: string): Promise<Record<string, any>> {
    try {
      const page = await this.notionService.getPage(pageId)
      return page?.properties || {}
    } catch (error: any) {
      throw new AppError(
        ErrorCodes.EXTERNAL_SERVICE_ERROR,
        `Failed to fetch Notion properties: ${error.message}`,
        500,
        { pageId, originalError: error }
      )
    }
  }

  /**
   * データベースからページ一覧を取得
   */
  async fetchDatabasePages(
    databaseId: string,
    options?: BulkSyncOptions
  ): Promise<{ pages: NotionPage[]; hasMore: boolean; nextCursor?: string }> {
    try {
      const response = await this.notionService.queryDatabase(databaseId, {
        page_size: options?.limit || 100,
        start_cursor: options?.startCursor
      })

      return {
        pages: response.results as NotionPage[],
        hasMore: response.has_more,
        nextCursor: response.next_cursor || undefined
      }
    } catch (error: any) {
      throw new AppError(
        ErrorCodes.EXTERNAL_SERVICE_ERROR,
        `Failed to fetch database pages: ${error.message}`,
        500,
        { databaseId, originalError: error }
      )
    }
  }

  /**
   * ワークスペース内のページを検索
   */
  async searchPages(
    query: string,
    options?: { limit?: number }
  ): Promise<NotionPage[]> {
    try {
      const results = await this.notionService.search({
        query,
        filter: { property: 'object', value: 'page' },
        page_size: options?.limit || 20
      })

      return results.results as NotionPage[]
    } catch (error: any) {
      throw new AppError(
        ErrorCodes.EXTERNAL_SERVICE_ERROR,
        `Failed to search Notion pages: ${error.message}`,
        500,
        { query, originalError: error }
      )
    }
  }

  /**
   * デフォルト設定を取得
   */
  getDefaultOptions(): PageSyncOptions {
    return {
      namespace: this.config.defaultNamespace,
      includeBlocks: this.config.includeBlocksByDefault,
      includeProperties: this.config.includePropertiesByDefault
    }
  }
}