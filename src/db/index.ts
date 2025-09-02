/**
 * Database connection and client
 */

import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export function createDbClient(d1: D1Database) {
  return drizzle(d1, { schema })
}

export * from './schema'
export type DbClient = ReturnType<typeof createDbClient>