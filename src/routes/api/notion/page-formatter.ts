import type { NotionPage } from '../../../db/schema'

export interface FormattedPage {
  id: string
  title: string
  url: string
  last_edited_time: string
  created_time: string
  archived: boolean
  parent: {
    type: string
    database_id?: string
    page_id?: string
    workspace?: boolean
  }
}

export class PageFormatter {
  /**
   * Extract title from Notion properties
   */
  static extractTitle(properties: Record<string, any>): string {
    if (!properties) return 'Untitled'
    
    const titleProperty = properties.title
    if (!titleProperty?.title || !Array.isArray(titleProperty.title) || titleProperty.title.length === 0) {
      return 'Untitled'
    }
    
    const title = titleProperty.title
      .map((t: any) => t.plain_text || '')
      .join('')
    
    return title || 'Untitled'
  }

  /**
   * Parse parent object from string or object
   */
  static parseParent(parent: string | Record<string, unknown>): Record<string, unknown> {
    if (typeof parent === 'string') {
      try {
        return JSON.parse(parent)
      } catch {
        return { type: 'unknown' }
      }
    }
    return parent
  }

  /**
   * Parse properties from string or object
   */
  static parseProperties(properties: string | Record<string, any>): Record<string, any> {
    if (typeof properties === 'string') {
      try {
        return JSON.parse(properties)
      } catch {
        return {}
      }
    }
    return properties
  }

  /**
   * Format cached page from database
   */
  static formatCachedPage(page: NotionPage): FormattedPage {
    const parent = this.parseParent(page.parent)
    const properties = this.parseProperties(page.properties)
    const title = this.extractTitle(properties)
    
    return {
      id: page.id,
      title,
      url: page.url,
      last_edited_time: page.lastEditedTime,
      created_time: page.createdTime,
      archived: page.archived,
      parent: {
        type: String(parent.type || ''),
        database_id: parent.database_id ? String(parent.database_id) : undefined,
        page_id: parent.page_id ? String(parent.page_id) : undefined,
        workspace: parent.workspace !== undefined ? Boolean(parent.workspace) : undefined
      }
    }
  }

  /**
   * Format page from Notion API
   */
  static formatApiPage(page: Record<string, unknown>): FormattedPage {
    const parent = page.parent as Record<string, unknown> || {}
    const properties = page.properties as Record<string, any> || {}
    const title = this.extractTitle(properties)
    
    return {
      id: String(page.id || ''),
      title,
      url: String(page.url || ''),
      last_edited_time: String(page.last_edited_time || ''),
      created_time: String(page.created_time || ''),
      archived: Boolean(page.archived),
      parent: {
        type: String(parent.type || ''),
        database_id: parent.database_id ? String(parent.database_id) : undefined,
        page_id: parent.page_id ? String(parent.page_id) : undefined,
        workspace: parent.workspace !== undefined ? Boolean(parent.workspace) : undefined
      }
    }
  }

  /**
   * Format page based on source
   */
  static formatPage(page: NotionPage | Record<string, unknown>, fromCache: boolean): FormattedPage {
    if (fromCache && 'createdTime' in page) {
      return this.formatCachedPage(page as NotionPage)
    } else {
      return this.formatApiPage(page as Record<string, unknown>)
    }
  }

  /**
   * Format multiple pages
   */
  static formatPages(
    pages: Array<NotionPage | Record<string, unknown>>,
    fromCache: boolean
  ): FormattedPage[] {
    return pages.map(page => this.formatPage(page, fromCache))
  }
}