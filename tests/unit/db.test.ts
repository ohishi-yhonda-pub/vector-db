import { describe, it, expect, vi } from 'vitest'
import { getDb } from '../../src/db'
import * as dbExports from '../../src/db'

// Mock drizzle
vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn((db, options) => ({ 
    _db: db, 
    _schema: options?.schema,
    // Mock drizzle instance
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }))
}))

describe('Database Helper', () => {
  it('should export getDb function', () => {
    expect(getDb).toBeDefined()
    expect(typeof getDb).toBe('function')
  })

  it('should create drizzle instance with env.DB and schema', () => {
    const mockEnv = {
      DB: { 
        prepare: vi.fn(),
        batch: vi.fn(),
        exec: vi.fn(),
        dump: vi.fn()
      }
    } as any

    const db = getDb(mockEnv)
    
    expect(db).toBeDefined()
    expect((db as any)._db).toBe(mockEnv.DB)
    expect((db as any)._schema).toBeDefined()
  })

  it('should re-export all schema items', () => {
    // Check that schema exports are available
    expect(dbExports.notionPages).toBeDefined()
    expect(dbExports.notionBlocks).toBeDefined()
    expect(dbExports.notionPageProperties).toBeDefined()
    expect(dbExports.notionVectorRelations).toBeDefined()
    expect(dbExports.notionSyncJobs).toBeDefined()
  })

  it('should re-export type definitions', () => {
    // Since these are TypeScript types, we can't test them directly
    // But we can test that the module exports exist
    expect(dbExports).toHaveProperty('getDb')
    expect(dbExports).toHaveProperty('notionPages')
    expect(dbExports).toHaveProperty('notionBlocks')
    expect(dbExports).toHaveProperty('notionPageProperties')
    expect(dbExports).toHaveProperty('notionVectorRelations')
    expect(dbExports).toHaveProperty('notionSyncJobs')
  })

  it('should create different drizzle instances for different environments', () => {
    const env1 = {
      DB: { 
        prepare: vi.fn(),
        batch: vi.fn(),
        exec: vi.fn(),
        dump: vi.fn()
      }
    } as any

    const env2 = {
      DB: { 
        prepare: vi.fn(),
        batch: vi.fn(),
        exec: vi.fn(),
        dump: vi.fn()
      }
    } as any

    const db1 = getDb(env1)
    const db2 = getDb(env2)
    
    expect(db1).not.toBe(db2)
    expect((db1 as any)._db).toBe(env1.DB)
    expect((db2 as any)._db).toBe(env2.DB)
  })
})