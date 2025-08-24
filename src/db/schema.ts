import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// Notionページ情報を保存するテーブル
export const notionPages = sqliteTable('notion_pages', {
  id: text('id').primaryKey(), // Notion page ID
  object: text('object').notNull(), // Always "page"
  createdTime: text('created_time').notNull(),
  lastEditedTime: text('last_edited_time').notNull(),
  createdById: text('created_by_id').notNull(),
  lastEditedById: text('last_edited_by_id').notNull(),
  cover: text('cover'), // JSON
  icon: text('icon'), // JSON
  parent: text('parent').notNull(), // JSON
  archived: integer('archived', { mode: 'boolean' }).notNull(),
  inTrash: integer('in_trash', { mode: 'boolean' }).notNull(),
  properties: text('properties').notNull(), // JSON
  url: text('url').notNull(),
  publicUrl: text('public_url'),
  syncedAt: text('synced_at').notNull().default(sql`CURRENT_TIMESTAMP`)
})

// Notionブロック情報を保存するテーブル
export const notionBlocks = sqliteTable('notion_blocks', {
  id: text('id').primaryKey(), // Block ID
  pageId: text('page_id').notNull().references(() => notionPages.id), /* istanbul ignore next */
  object: text('object').notNull(), // Always "block"
  type: text('type').notNull(), // Block type
  createdTime: text('created_time').notNull(),
  lastEditedTime: text('last_edited_time').notNull(),
  createdById: text('created_by_id').notNull(),
  lastEditedById: text('last_edited_by_id').notNull(),
  hasChildren: integer('has_children', { mode: 'boolean' }).notNull(),
  archived: integer('archived', { mode: 'boolean' }).notNull(),
  inTrash: integer('in_trash', { mode: 'boolean' }).notNull(),
  parentId: text('parent_id'),
  parentType: text('parent_type').notNull(), // page_id, block_id, etc.
  content: text('content').notNull(), // JSON containing block type specific data
  plainText: text('plain_text'), // Extracted plain text for search
  orderIndex: integer('order_index').notNull(), // Block order within parent
  syncedAt: text('synced_at').notNull().default(sql`CURRENT_TIMESTAMP`)
})

// ページプロパティを保存するテーブル
export const notionPageProperties = sqliteTable('notion_page_properties', {
  id: text('id').primaryKey(), // {pageId}_{propertyId}
  pageId: text('page_id').notNull().references(() => notionPages.id), /* istanbul ignore next */
  propertyId: text('property_id').notNull(),
  propertyName: text('property_name').notNull(),
  propertyType: text('property_type').notNull(), // title, rich_text, number, etc.
  propertyValue: text('property_value').notNull(), // JSON
  plainTextValue: text('plain_text_value'), // Extracted plain text for search
  numberValue: real('number_value'), // For number properties
  syncedAt: text('synced_at').notNull().default(sql`CURRENT_TIMESTAMP`)
})

// Notionページとベクトルの関連を保存するテーブル
export const notionVectorRelations = sqliteTable('notion_vector_relations', {
  id: text('id').primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  /* istanbul ignore next */
  notionPageId: text('notion_page_id').notNull().references(() => notionPages.id),
  /**  istanbul ignore next **/

  notionBlockId: text('notion_block_id').references(() => notionBlocks.id),
  vectorId: text('vector_id').notNull(),
  vectorNamespace: text('vector_namespace').notNull(),
  contentType: text('content_type').notNull(), // page_title, block_content, property_value, etc.
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
})

// 同期ジョブの履歴を保存するテーブル
export const notionSyncJobs = sqliteTable('notion_sync_jobs', {
  id: text('id').primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  pageId: text('page_id').notNull(),
  jobType: text('job_type').notNull(), // sync_page, sync_blocks, sync_properties
  status: text('status').notNull(), // pending, processing, completed, failed
  startedAt: text('started_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text('completed_at'),
  error: text('error'),
  metadata: text('metadata') // JSON
})

// 型定義
export type NotionPage = typeof notionPages.$inferSelect
export type NewNotionPage = typeof notionPages.$inferInsert
export type NotionBlock = typeof notionBlocks.$inferSelect
export type NewNotionBlock = typeof notionBlocks.$inferInsert
export type NotionPageProperty = typeof notionPageProperties.$inferSelect
export type NewNotionPageProperty = typeof notionPageProperties.$inferInsert
export type NotionVectorRelation = typeof notionVectorRelations.$inferSelect
export type NewNotionVectorRelation = typeof notionVectorRelations.$inferInsert
export type NotionSyncJob = typeof notionSyncJobs.$inferSelect
export type NewNotionSyncJob = typeof notionSyncJobs.$inferInsert