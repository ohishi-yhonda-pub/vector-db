import { NotionAPIClient } from './notion-api-client'
import { NotionDataManager } from './notion-data-manager'
import type { NotionPage as NotionAPIPage, NotionBlock as NotionAPIBlock } from '../schemas/notion.schema'
import type { NotionPage, NotionBlock } from '../db/schema'

export class NotionOrchestrator {
  private apiClient: NotionAPIClient
  private dataManager: NotionDataManager

  constructor(
    private env: Env,
    notionToken: string
  ) {
    this.apiClient = new NotionAPIClient(notionToken)
    this.dataManager = new NotionDataManager(env)
  }

  // Sync a page from Notion
  async syncPage(pageId: string): Promise<{
    page: NotionAPIPage | null
    blocks: NotionAPIBlock[]
  }> {
    // Fetch page from Notion
    const page = await this.apiClient.fetchPage(pageId)
    if (!page) {
      return { page: null, blocks: [] }
    }

    // Save page to database
    await this.dataManager.savePage(page)

    // Fetch and save blocks
    const blocks = await this.apiClient.fetchBlocks(pageId)
    if (blocks.length > 0) {
      await this.dataManager.saveBlocks(pageId, blocks)
    }

    // Save page properties
    if (page.properties) {
      await this.dataManager.savePageProperties(pageId, page.properties)
    }

    return { page, blocks }
  }

  // Sync all pages from Notion
  async syncAllPages(options: {
    start_cursor?: string
    page_size?: number
    filter?: {
      property: string
      value: string
    }
  } = {}): Promise<{
    synced: number
    has_more: boolean
    next_cursor: string | null
  }> {
    const result = await this.apiClient.searchPages(options)
    
    let synced = 0
    for (const page of result.results) {
      try {
        await this.syncPage(page.id)
        synced++
      } catch (error) {
        console.error(`Failed to sync page ${page.id}:`, error)
      }
    }

    return {
      synced,
      has_more: result.has_more,
      next_cursor: result.next_cursor
    }
  }

  // Get page from cache or fetch from Notion
  async getPage(pageId: string, forceRefresh = false): Promise<NotionPage | null> {
    if (!forceRefresh) {
      const cachedPage = await this.dataManager.getPage(pageId)
      if (cachedPage) {
        return cachedPage
      }
    }

    // Fetch from Notion and save
    const { page } = await this.syncPage(pageId)
    if (!page) {
      return null
    }

    return await this.dataManager.getPage(pageId)
  }

  // Get blocks from cache or fetch from Notion
  async getBlocks(pageId: string, forceRefresh = false): Promise<NotionBlock[]> {
    if (!forceRefresh) {
      const cachedBlocks = await this.dataManager.getBlocks(pageId)
      if (cachedBlocks.length > 0) {
        return cachedBlocks
      }
    }

    // Fetch from Notion and save
    await this.syncPage(pageId)
    return await this.dataManager.getBlocks(pageId)
  }

  // Get all pages from cache
  async getAllPagesFromCache(options: {
    archived?: boolean
    limit?: number
  } = {}): Promise<NotionPage[]> {
    return await this.dataManager.getAllPages(options)
  }

  // Create vector relation
  async createVectorRelation(
    notionPageId: string,
    vectorId: string,
    vectorNamespace: string,
    contentType: string,
    notionBlockId?: string
  ): Promise<void> {
    await this.dataManager.saveVectorRelation(
      notionPageId,
      vectorId,
      vectorNamespace,
      contentType,
      notionBlockId
    )
  }

  // Extract page title helper
  extractPageTitle(properties: Record<string, any>): string {
    return this.dataManager.extractPageTitle(properties)
  }
}