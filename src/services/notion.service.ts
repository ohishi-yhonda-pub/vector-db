import { getDb } from '../db'
import type { 
  NotionPage, 
  NotionBlock,
  NewNotionPage,
  NewNotionBlock,
  NewNotionPageProperty,
  NewNotionVectorRelation
} from '../db/schema'
import { 
  notionPages, 
  notionBlocks, 
  notionPageProperties,
  notionVectorRelations,
  notionSyncJobs
} from '../db/schema'
import { eq } from 'drizzle-orm'
import type { NotionPage as NotionAPIPage, NotionBlock as NotionAPIBlock } from '../schemas/notion.schema'

export class NotionService {
  constructor(
    private env: Env,
    private notionToken: string
  ) {}

  private get db() {
    return getDb(this.env)
  }

  // Notion API から ページを取得
  async fetchPageFromNotion(pageId: string): Promise<NotionAPIPage | null> {
    try {
      const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        headers: {
          'Authorization': `Bearer ${this.notionToken}`,
          'Notion-Version': '2022-06-28'
        }
      })

      if (!response.ok) {
        if (response.status === 404) return null
        throw new Error(`Notion API error: ${response.status}`)
      }

      return await response.json() as NotionAPIPage
    } catch (error) {
      console.error('Failed to fetch page from Notion:', error)
      throw error
    }
  }

  // Notion API から ブロックを取得
  async fetchBlocksFromNotion(pageId: string): Promise<NotionAPIBlock[]> {
    const blocks: NotionAPIBlock[] = []
    let cursor: string | null = null

    try {
      do {
        const url = new URL(`https://api.notion.com/v1/blocks/${pageId}/children`)
        if (cursor) url.searchParams.append('start_cursor', cursor)
        url.searchParams.append('page_size', '100')

        const response = await fetch(url.toString(), {
          headers: {
            'Authorization': `Bearer ${this.notionToken}`,
            'Notion-Version': '2022-06-28'
          }
        })

        if (!response.ok) {
          throw new Error(`Notion API error: ${response.status}`)
        }

        const data = await response.json() as {
          results: NotionAPIBlock[]
          has_more: boolean
          next_cursor: string | null
        }

        blocks.push(...data.results)
        cursor = data.has_more ? data.next_cursor : null
      } while (cursor)

      return blocks
    } catch (error) {
      console.error('Failed to fetch blocks from Notion:', error)
      throw error
    }
  }

  // Notion API から プロパティを取得
  async fetchPagePropertyFromNotion(pageId: string, propertyId: string): Promise<any> {
    try {
      const response = await fetch(
        `https://api.notion.com/v1/pages/${pageId}/properties/${propertyId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.notionToken}`,
            'Notion-Version': '2022-06-28'
          }
        }
      )

      if (!response.ok) {
        throw new Error(`Notion API error: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to fetch property from Notion:', error)
      throw error
    }
  }

  // ページをDBに保存
  async savePage(page: NotionAPIPage): Promise<void> {
    const newPage: NewNotionPage = {
      id: page.id,
      object: page.object,
      createdTime: page.created_time,
      lastEditedTime: page.last_edited_time,
      createdById: page.created_by.id,
      lastEditedById: page.last_edited_by.id,
      cover: page.cover ? JSON.stringify(page.cover) : null,
      icon: page.icon ? JSON.stringify(page.icon) : null,
      parent: JSON.stringify(page.parent),
      archived: page.archived,
      inTrash: page.in_trash,
      properties: JSON.stringify(page.properties),
      url: page.url,
      publicUrl: page.public_url || null
    }

    await this.db.insert(notionPages)
      .values(newPage)
      .onConflictDoUpdate({
        target: notionPages.id,
        set: newPage
      })
  }

  // ブロックをDBに保存
  async saveBlocks(pageId: string, blocks: NotionAPIBlock[]): Promise<void> {
    if (blocks.length === 0) return

    const newBlocks: NewNotionBlock[] = blocks.map((block, index) => ({
      id: block.id,
      pageId: pageId,
      object: block.object,
      type: block.type,
      createdTime: block.created_time,
      lastEditedTime: block.last_edited_time,
      createdById: block.created_by.id,
      lastEditedById: block.last_edited_by.id,
      hasChildren: block.has_children,
      archived: block.archived,
      inTrash: block.in_trash,
      parentId: block.parent.block_id || pageId,
      parentType: block.parent.type,
      content: JSON.stringify(block),
      plainText: this.extractPlainTextFromBlock(block),
      orderIndex: index
    }))

    // バッチで挿入
    for (const block of newBlocks) {
      await this.db.insert(notionBlocks)
        .values(block)
        .onConflictDoUpdate({
          target: notionBlocks.id,
          set: block
        })
    }
  }

  // プロパティをDBに保存
  async savePageProperties(pageId: string, properties: Record<string, any>): Promise<void> {
    const propertyEntries = Object.entries(properties)
    
    for (const [propertyName, propertyData] of propertyEntries) {
      const propertyId = propertyData.id
      const propertyType = propertyData.type
      const plainText = this.extractPlainTextFromProperty(propertyData)
      const numberValue = propertyType === 'number' ? propertyData.number : null

      const newProperty: NewNotionPageProperty = {
        id: `${pageId}_${propertyId}`,
        pageId,
        propertyId,
        propertyName,
        propertyType,
        propertyValue: JSON.stringify(propertyData),
        plainTextValue: plainText,
        numberValue
      }

      await this.db.insert(notionPageProperties)
        .values(newProperty)
        .onConflictDoUpdate({
          target: notionPageProperties.id,
          set: newProperty
        })
    }
  }

  // ベクトル関連を保存
  async saveVectorRelation(
    notionPageId: string,
    vectorId: string,
    vectorNamespace: string,
    contentType: string,
    notionBlockId?: string
  ): Promise<void> {
    const newRelation: NewNotionVectorRelation = {
      notionPageId,
      notionBlockId,
      vectorId,
      vectorNamespace,
      contentType
    }

    await this.db.insert(notionVectorRelations).values(newRelation)
  }

  // ページを取得（DBから）
  async getPage(pageId: string): Promise<NotionPage | null> {
    const result = await this.db.select()
      .from(notionPages)
      .where(eq(notionPages.id, pageId))
      .limit(1)

    return result[0] || null
  }

  // すべてのページを取得（DBから）
  async getAllPagesFromCache(options: {
    archived?: boolean
    limit?: number
  } = {}): Promise<NotionPage[]> {
    const conditions = []
    if (options.archived !== undefined) {
      conditions.push(eq(notionPages.archived, options.archived))
    }

    const baseQuery = this.db
      .select()
      .from(notionPages)
      .orderBy(notionPages.lastEditedTime)

    if (conditions.length > 0) {
      const queryWithWhere = baseQuery.where(conditions[0])
      if (options.limit) {
        return await queryWithWhere.limit(options.limit)
      }
      return await queryWithWhere
    }

    if (options.limit) {
      return await baseQuery.limit(options.limit)
    }
    return await baseQuery
  }

  // Notion APIで全ページを検索
  async searchAllPages(options: {
    start_cursor?: string
    page_size?: number
    filter?: {
      property: string
      value: string
    }
  } = {}): Promise<{
    results: NotionAPIPage[]
    has_more: boolean
    next_cursor: string | null
  }> {
    try {
      const searchBody: any = {
        page_size: options.page_size || 100
      }

      if (options.start_cursor) {
        searchBody.start_cursor = options.start_cursor
      }

      if (options.filter) {
        searchBody.filter = {
          property: options.filter.property,
          [options.filter.property]: {
            equals: options.filter.value
          }
        }
      }

      const response = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(searchBody)
      })

      if (!response.ok) {
        throw new Error(`Notion API error: ${response.status}`)
      }

      const data = await response.json() as {
        results: any[]
        has_more: boolean
        next_cursor: string | null
      }
      
      return {
        results: data.results.filter((item) => item.object === 'page'),
        has_more: data.has_more,
        next_cursor: data.next_cursor
      }
    } catch (error) {
      console.error('Failed to search pages from Notion:', error)
      throw error
    }
  }

  // ブロックを取得（DBから）
  async getBlocks(pageId: string): Promise<NotionBlock[]> {
    return await this.db.select()
      .from(notionBlocks)
      .where(eq(notionBlocks.pageId, pageId))
      .orderBy(notionBlocks.orderIndex)
  }

  // ブロックからプレーンテキストを抽出
  private extractPlainTextFromBlock(block: NotionAPIBlock): string {
    // Type-safe access without using any casting
    if (!block.type) return ''
    
    // Handle blocks with rich_text property
    if (this.hasRichText(block)) {
      const richText = this.getRichTextFromBlock(block)
      if (richText) {
        return richText
          .map((rt: any) => rt.plain_text || '')
          .join('')
      }
    }

    // Handle table_row blocks
    if (block.type === 'table_row') {
      const tableRowBlock = block as any
      const content = tableRowBlock.table_row
      if (content && content.cells) {
        return content.cells
          .map((cell: any[]) => 
            cell.map((rt: any) => rt.plain_text || '').join('')
          )
          .join(' ')
      }
    }

    return ''
  }

  // Helper method to check if block has rich_text
  private hasRichText(block: NotionAPIBlock): boolean {
    const richTextTypes = [
      'paragraph', 'heading_1', 'heading_2', 'heading_3',
      'bulleted_list_item', 'numbered_list_item', 'to_do',
      'toggle', 'quote', 'callout', 'code'
    ]
    return richTextTypes.includes(block.type)
  }

  // Helper method to get rich_text content from block
  private getRichTextFromBlock(block: NotionAPIBlock): any[] | null {
    const blockContent = (block as any)[block.type]
    return blockContent && blockContent.rich_text ? blockContent.rich_text : null
  }

  // プロパティからプレーンテキストを抽出
  private extractPlainTextFromProperty(property: any): string {
    if (!property) return ''

    switch (property.type) {
      case 'title':
      case 'rich_text':
        return property[property.type]
          ?.map((rt: any) => rt.plain_text || '')
          .join('') || ''
      
      case 'number':
        return property.number?.toString() || ''
      
      case 'select':
        return property.select?.name || ''
      
      case 'multi_select':
        return property.multi_select
          ?.map((s: any) => s.name)
          .join(', ') || ''
      
      case 'date':
        return property.date?.start || ''
      
      case 'people':
        return property.people
          ?.map((p: any) => p.name || p.id)
          .join(', ') || ''
      
      case 'url':
      case 'email':
      case 'phone_number':
        return property[property.type] || ''
      
      default:
        return ''
    }
  }

  // ページタイトルを抽出
  extractPageTitle(properties: Record<string, any>): string {
    // タイトルプロパティを見つける
    const titleProperty = Object.values(properties).find(
      (prop: any) => prop.type === 'title'
    ) as any

    if (!titleProperty || !titleProperty.title) {
      return 'Untitled'
    }

    return titleProperty.title
      .map((rt: any) => rt.plain_text || '')
      .join('') || 'Untitled'
  }
}