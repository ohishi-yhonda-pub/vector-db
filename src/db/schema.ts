/**
 * Drizzle schema for D1 database
 */

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const vectors = sqliteTable('vectors', {
  id: text('id').primaryKey(),
  dimensions: integer('dimensions').notNull(),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  vectorId: text('vector_id'),
  status: text('status').notNull(), // 'started', 'running', 'completed', 'failed'
  input: text('input', { mode: 'json' }),
  output: text('output', { mode: 'json' }),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export type Vector = typeof vectors.$inferSelect
export type NewVector = typeof vectors.$inferInsert
export type Workflow = typeof workflows.$inferSelect
export type NewWorkflow = typeof workflows.$inferInsert