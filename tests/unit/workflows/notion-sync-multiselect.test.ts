import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// First, set up all mocks before any imports
const mockNotionServiceInstance = {
  fetchPageFromNotion: vi.fn(),
  savePage: vi.fn(),
  saveVectorRelation: vi.fn(),
  savePageProperties: vi.fn(),
  fetchBlocksFromNotion: vi.fn(),
  saveBlocks: vi.fn()
}

const mockDb = {
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue({})
  })
}

const mockVectorManager = {
  createVectorAsync: vi.fn()
}

// Mock all modules before importing
vi.mock('cloudflare:workers', () => ({
  WorkflowEntrypoint: class {
    constructor(public ctx: any, public env: any) {}
  },
  WorkflowStep: {},
  WorkflowEvent: {}
}))

vi.mock('../../../src/services/notion.service', () => ({
  NotionService: class {
    constructor() {
      return mockNotionServiceInstance
    }
  }
}))

vi.mock('../../../src/db', () => ({
  getDb: vi.fn(() => mockDb)
}))

vi.mock('../../../src/db/schema', () => ({
  notionSyncJobs: 'notionSyncJobs'
}))

// Now import after all mocks are set up
import { NotionSyncWorkflow } from '../../../src/workflows/notion-sync'

describe('NotionSyncWorkflow - Multi-Select Coverage', () => {
  let workflow: NotionSyncWorkflow
  let mockEnv: any
  let mockStep: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Reset mock implementations
    mockVectorManager.createVectorAsync.mockResolvedValue({ jobId: 'vec-123' })
    mockNotionServiceInstance.savePage.mockResolvedValue(undefined)
    mockNotionServiceInstance.saveVectorRelation.mockResolvedValue(undefined)
    mockNotionServiceInstance.savePageProperties.mockResolvedValue(undefined)
    mockNotionServiceInstance.saveBlocks.mockResolvedValue(undefined)
    
    mockEnv = {
      DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
      VECTOR_CACHE: {
        idFromName: vi.fn().mockReturnValue('vector-manager-id'),
        get: vi.fn().mockReturnValue(mockVectorManager)
      }
    }

    mockStep = {
      do: vi.fn().mockImplementation(async (name: string, fn: () => any) => {
        try {
          return await fn()
        } catch (error) {
          if (name === 'fetch-and-save-page') {
            throw error
          }
          throw error
        }
      })
    }

    workflow = new NotionSyncWorkflow({} as any, mockEnv)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should vectorize multi_select property with multiple values', async () => {
    const params = {
      pageId: 'page-123',
      notionToken: 'test-token',
      includeBlocks: false,
      includeProperties: true,
      namespace: 'test-namespace'
    }

    const mockPage = {
      id: 'page-123',
      url: 'https://notion.so/page-123',
      properties: {
        Title: {
          type: 'title',
          title: [{ plain_text: 'Test Page' }]
        },
        Tags: {
          type: 'multi_select',
          multi_select: [
            { name: 'Frontend' },
            { name: 'React' },
            { name: 'TypeScript' }
          ]
        }
      }
    }

    mockNotionServiceInstance.fetchPageFromNotion.mockResolvedValueOnce(mockPage)

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, mockStep)

    expect(result.success).toBe(true)
    expect(result.propertiesProcessed).toBe(2) // Title and Tags
    expect(result.vectorsCreated).toBe(3) // Title vector + Title property vector + Tags vector
    
    // Verify the multi_select was vectorized with joined values
    expect(mockVectorManager.createVectorAsync).toHaveBeenCalledWith(
      expect.stringContaining('Tags: Frontend, React, TypeScript'),
      expect.any(String),
      expect.any(String),
      expect.any(Object)
    )
  })

  it('should handle multi_select with single value', async () => {
    const params = {
      pageId: 'page-123',
      notionToken: 'test-token',
      includeBlocks: false,
      includeProperties: true
    }

    const mockPage = {
      id: 'page-123',
      url: 'https://notion.so/page-123',
      properties: {
        Title: {
          type: 'title',
          title: [{ plain_text: 'Test' }]
        },
        Category: {
          type: 'multi_select',
          multi_select: [
            { name: 'Development' }
          ]
        }
      }
    }

    mockNotionServiceInstance.fetchPageFromNotion.mockResolvedValueOnce(mockPage)

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, mockStep)

    expect(result.success).toBe(true)
    expect(result.propertiesProcessed).toBe(2)
    expect(result.vectorsCreated).toBe(3) // Title vector + Title property vector + Category vector
    
    // Verify single value is properly handled
    expect(mockVectorManager.createVectorAsync).toHaveBeenCalledWith(
      expect.stringContaining('Category: Development'),
      expect.any(String),
      expect.any(String),
      expect.any(Object)
    )
  })

  it('should handle multi_select with special characters in names', async () => {
    const params = {
      pageId: 'page-123',
      notionToken: 'test-token',
      includeBlocks: false,
      includeProperties: true
    }

    const mockPage = {
      id: 'page-123',
      url: 'https://notion.so/page-123',
      properties: {
        Title: {
          type: 'title',
          title: [{ plain_text: 'Test' }]
        },
        Labels: {
          type: 'multi_select',
          multi_select: [
            { name: 'Work-In-Progress' },
            { name: 'High Priority!' },
            { name: '🚀 Launch' }
          ]
        }
      }
    }

    mockNotionServiceInstance.fetchPageFromNotion.mockResolvedValueOnce(mockPage)

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, mockStep)

    expect(result.success).toBe(true)
    expect(result.vectorsCreated).toBe(3) // Title vector + Title property vector + Labels vector
    
    // Verify special characters are preserved
    expect(mockVectorManager.createVectorAsync).toHaveBeenCalledWith(
      expect.stringContaining('Labels: Work-In-Progress, High Priority!, 🚀 Launch'),
      expect.any(String),
      expect.any(String),
      expect.any(Object)
    )
  })

  it('should vectorize multiple properties including multi_select', async () => {
    const params = {
      pageId: 'page-123',
      notionToken: 'test-token',
      includeBlocks: false,
      includeProperties: true
    }

    const mockPage = {
      id: 'page-123',
      url: 'https://notion.so/page-123',
      properties: {
        Title: {
          type: 'title',
          title: [{ plain_text: 'Project Alpha' }]
        },
        Description: {
          type: 'rich_text',
          rich_text: [{ plain_text: 'Main project description' }]
        },
        Status: {
          type: 'select',
          select: { name: 'In Progress' }
        },
        Tags: {
          type: 'multi_select',
          multi_select: [
            { name: 'Backend' },
            { name: 'API' }
          ]
        },
        Priority: {
          type: 'multi_select',
          multi_select: [
            { name: 'High' },
            { name: 'Urgent' }
          ]
        }
      }
    }

    mockNotionServiceInstance.fetchPageFromNotion.mockResolvedValueOnce(mockPage)

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, mockStep)

    expect(result.success).toBe(true)
    expect(result.propertiesProcessed).toBe(5) // All properties
    expect(result.vectorsCreated).toBe(6) // Title vector + 5 property vectors
    
    // Verify both multi_select properties were vectorized
    expect(mockVectorManager.createVectorAsync).toHaveBeenCalledWith(
      expect.stringContaining('Tags: Backend, API'),
      expect.any(String),
      expect.any(String),
      expect.any(Object)
    )
    
    expect(mockVectorManager.createVectorAsync).toHaveBeenCalledWith(
      expect.stringContaining('Priority: High, Urgent'),
      expect.any(String),
      expect.any(String),
      expect.any(Object)
    )
  })
})