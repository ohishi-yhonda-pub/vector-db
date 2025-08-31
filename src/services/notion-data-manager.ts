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
  notionVectorRelations
} from '../db/schema'
import { eq } from 'drizzle-orm'
import type { NotionPage as NotionAPIPage, NotionBlock as NotionAPIBlock } from '../schemas/notion.schema'

export class NotionDataManager {
  constructor(private env: Env) {}

  private get db() {
    return getDb(this.env)
  }

  // Save page to database
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

  // Save blocks to database
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

    // Batch insert
    for (const block of newBlocks) {
      await this.db.insert(notionBlocks)
        .values(block)
        .onConflictDoUpdate({
          target: notionBlocks.id,
          set: block
        })
    }
  }

  // Save page properties to database
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

  // Save vector relation
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

  // Get page from database
  async getPage(pageId: string): Promise<NotionPage | null> {
    const result = await this.db.select()
      .from(notionPages)
      .where(eq(notionPages.id, pageId))
      .limit(1)

    return result[0] || null
  }

  // Get all pages from cache
  async getAllPages(options: {
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

  // Get blocks from database
  async getBlocks(pageId: string): Promise<NotionBlock[]> {
    return await this.db.select()
      .from(notionBlocks)
      .where(eq(notionBlocks.pageId, pageId))
      .orderBy(notionBlocks.orderIndex)
  }

  // Extract plain text from block
  private extractPlainTextFromBlock(block: NotionAPIBlock): string {
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

  // Check if block has rich_text
  private hasRichText(block: NotionAPIBlock): boolean {
    const richTextTypes = [
      'paragraph', 'heading_1', 'heading_2', 'heading_3',
      'bulleted_list_item', 'numbered_list_item', 'to_do',
      'toggle', 'quote', 'callout', 'code'
    ]
    return richTextTypes.includes(block.type)
  }

  // Get rich_text content from block
  private getRichTextFromBlock(block: NotionAPIBlock): any[] | null {
    const blockContent = (block as any)[block.type]
    return blockContent && blockContent.rich_text ? blockContent.rich_text : null
  }

  // Extract plain text from property
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

  // Extract page title
  extractPageTitle(properties: Record<string, any>): string {
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