import { vi } from 'vitest'

/**
 * Create a mock Durable Object namespace
 * @param mockObject - The mock durable object to return
 * @param idPrefix - Prefix for the mock ID (default: 'mock')
 */
export function createMockDurableObjectNamespace(mockObject: any, idPrefix = 'mock') {
  return {
    idFromName: vi.fn(() => `${idPrefix}-id`),
    get: vi.fn(() => mockObject)
  }
}

/**
 * Create a mock Vector Manager Durable Object
 */
export function createMockVectorManager() {
  return {
    // Vector CRUD operations
    getVector: vi.fn(),
    createVector: vi.fn(),
    createVectorAsync: vi.fn(),
    deleteVector: vi.fn(),
    deleteVectorsAsync: vi.fn(),
    deleteAllVectors: vi.fn(),
    bulkDeleteVectors: vi.fn(),
    removeDeletedVectors: vi.fn(), // Used in bulk-delete.test.ts
    
    // Vector list and search
    listVectors: vi.fn(),
    searchVectors: vi.fn(),
    findSimilar: vi.fn(),
    
    // Statistics and status
    getStatistics: vi.fn(),
    getTotalVectorCount: vi.fn(),
    
    // Job management
    getFileProcessingJobs: vi.fn(),
    getJobStatus: vi.fn(), // Used in status.test.ts
    getAllJobs: vi.fn() // Used in status.test.ts
  }
}

/**
 * Create a mock Notion Manager Durable Object
 */
export function createMockNotionManager() {
  return {
    listPages: vi.fn(),
    retrievePage: vi.fn(),
    retrievePageBlocks: vi.fn(),
    createSyncJob: vi.fn(),
    createBulkSyncJob: vi.fn(),
    getPageSyncStatus: vi.fn()
  }
}

/**
 * Create a mock Vectorize Index
 */
export function createMockVectorizeIndex() {
  return {
    insert: vi.fn(),
    upsert: vi.fn(),
    query: vi.fn(),
    getByIds: vi.fn(),
    deleteByIds: vi.fn(),
    describe: vi.fn()
  }
}