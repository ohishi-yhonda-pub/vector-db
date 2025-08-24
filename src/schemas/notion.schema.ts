import { z } from 'zod'

// Notion User
export const NotionUserSchema = z.object({
  object: z.literal('user'),
  id: z.string()
})

// Notion Parent
export const NotionParentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('database_id'),
    database_id: z.string()
  }),
  z.object({
    type: z.literal('page_id'),
    page_id: z.string()
  }),
  z.object({
    type: z.literal('workspace'),
    workspace: z.literal(true)
  }),
  z.object({
    type: z.literal('block_id'),
    block_id: z.string()
  })
])

// Notion Page
export const NotionPageSchema = z.object({
  object: z.literal('page'),
  id: z.string(),
  created_time: z.string(),
  last_edited_time: z.string(),
  created_by: NotionUserSchema,
  last_edited_by: NotionUserSchema,
  cover: z.any().nullable(),
  icon: z.any().nullable(),
  parent: NotionParentSchema,
  archived: z.boolean(),
  in_trash: z.boolean(),
  properties: z.record(z.string(), z.any()),
  url: z.string(),
  public_url: z.string().nullable().optional()
})

// Notion Block Types
export const NotionBlockTypeSchema = z.enum([
  'paragraph',
  'heading_1',
  'heading_2', 
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
  'toggle',
  'child_page',
  'child_database',
  'embed',
  'image',
  'video',
  'file',
  'pdf',
  'bookmark',
  'callout',
  'quote',
  'equation',
  'divider',
  'table_of_contents',
  'column',
  'column_list',
  'link_preview',
  'synced_block',
  'template',
  'link_to_page',
  'table',
  'table_row',
  'code',
  'unsupported'
])

// Rich Text
export const RichTextSchema = z.object({
  type: z.enum(['text', 'mention', 'equation']),
  text: z.object({
    content: z.string(),
    link: z.object({ url: z.string() }).nullable().optional()
  }).optional(),
  mention: z.any().optional(),
  equation: z.any().optional(),
  annotations: z.object({
    bold: z.boolean(),
    italic: z.boolean(),
    strikethrough: z.boolean(),
    underline: z.boolean(),
    code: z.boolean(),
    color: z.string()
  }).optional(),
  plain_text: z.string(),
  href: z.string().nullable().optional()
})

// Notion Block
export const NotionBlockSchema = z.object({
  object: z.literal('block'),
  id: z.string(),
  parent: z.object({
    type: z.string(),
    page_id: z.string().optional(),
    block_id: z.string().optional()
  }),
  created_time: z.string(),
  last_edited_time: z.string(),
  created_by: NotionUserSchema,
  last_edited_by: NotionUserSchema,
  has_children: z.boolean(),
  archived: z.boolean(),
  in_trash: z.boolean(),
  type: NotionBlockTypeSchema
}).passthrough() // Allow block type specific properties

// API Request Schemas
export const RetrievePageRequestSchema = z.object({
  pageId: z.string()
})

export const RetrievePagePropertyRequestSchema = z.object({
  pageId: z.string(),
  propertyId: z.string()
})

export const SyncNotionPageRequestSchema = z.object({
  pageId: z.string(),
  includeBlocks: z.boolean().default(true),
  includeProperties: z.boolean().default(true),
  namespace: z.string().optional()
})

// Response Schemas
export const NotionPageResponseSchema = z.object({
  success: z.boolean(),
  data: NotionPageSchema.optional(),
  message: z.string().optional()
})

export const NotionBlockListResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    blocks: z.array(NotionBlockSchema),
    has_more: z.boolean(),
    next_cursor: z.string().nullable()
  }).optional(),
  message: z.string().optional()
})

export const NotionSyncResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    jobId: z.string(),
    pageId: z.string(),
    status: z.string(),
    message: z.string()
  }).optional(),
  message: z.string().optional()
})

// Types
export type NotionPage = z.infer<typeof NotionPageSchema>
export type NotionBlock = z.infer<typeof NotionBlockSchema>
export type NotionBlockType = z.infer<typeof NotionBlockTypeSchema>
export type RichText = z.infer<typeof RichTextSchema>
export type RetrievePageRequest = z.infer<typeof RetrievePageRequestSchema>
export type RetrievePagePropertyRequest = z.infer<typeof RetrievePagePropertyRequestSchema>
export type SyncNotionPageRequest = z.infer<typeof SyncNotionPageRequestSchema>
export type NotionPageResponse = z.infer<typeof NotionPageResponseSchema>
export type NotionBlockListResponse = z.infer<typeof NotionBlockListResponseSchema>
export type NotionSyncResponse = z.infer<typeof NotionSyncResponseSchema>