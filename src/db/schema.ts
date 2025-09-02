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

export type Vector = typeof vectors.$inferSelect
export type NewVector = typeof vectors.$inferInsert