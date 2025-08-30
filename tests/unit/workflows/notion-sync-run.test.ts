import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupWorkflowTest } from '../test-helpers'

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

describe('NotionSyncWorkflow - Run Method Tests', () => {
  let workflow: NotionSyncWorkflow
  let testSetup: ReturnType<typeof setupWorkflowTest>

  beforeEach(() => {
    vi.clearAllMocks()
    testSetup = setupWorkflowTest()
    
    // Reset mock implementations
    mockVectorManager.createVectorAsync.mockResolvedValue({ jobId: 'vec-123' })
    mockNotionServiceInstance.savePage.mockResolvedValue(undefined)
    mockNotionServiceInstance.saveVectorRelation.mockResolvedValue(undefined)
    mockNotionServiceInstance.savePageProperties.mockResolvedValue(undefined)
    mockNotionServiceInstance.saveBlocks.mockResolvedValue(undefined)
    
    // Add additional properties to mockEnv
    testSetup.mockEnv.DEFAULT_EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'
    testSetup.mockEnv.VECTOR_CACHE = {
      idFromName: vi.fn().mockReturnValue('vector-manager-id'),
      get: vi.fn().mockReturnValue(mockVectorManager)
    }

    // Override mockStep behavior for this specific test
    testSetup.mockStep.do = vi.fn().mockImplementation(async (name: string, fn: () => any) => {
      try {
        return await fn()
      } catch (error) {
        if (name === 'fetch-and-save-page') {
          throw error // Re-throw to trigger error handling
        }
        throw error
      }
    })

    workflow = new NotionSyncWorkflow(testSetup.mockCtx, testSetup.mockEnv)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should successfully sync a page with all features enabled', async () => {
    const params = {
      pageId: 'page-123',
      notionToken: 'test-token',
      includeBlocks: true,
      includeProperties: true,
      namespace: 'test-namespace'
    }

    const mockPage = {
      id: 'page-123',
      url: 'https://notion.so/page-123',
      properties: {
        Title: {
          type: 'title',
          title: [{ plain_text: 'Test Page Title' }]
        },
        Description: {
          type: 'rich_text',
          rich_text: [{ plain_text: 'Test Description' }]
        },
        Status: {
          type: 'select',
          select: { name: 'Active' }
        }
      }
    }

    const mockBlocks = [
      {
        id: 'block-1',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ plain_text: 'This is a long enough paragraph to be vectorized' }]
        }
      },
      {
        id: 'block-2',
        type: 'heading_1',
        heading_1: {
          rich_text: [{ plain_text: 'This is a heading with enough content' }]
        }
      }
    ]

    mockNotionServiceInstance.fetchPageFromNotion.mockResolvedValueOnce(mockPage)
    mockNotionServiceInstance.fetchBlocksFromNotion.mockResolvedValueOnce(mockBlocks)

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, testSetup.mockStep)

    expect(result.success).toBe(true)
    expect(result.pageId).toBe('page-123')
    expect(result.blocksProcessed).toBe(2)
    expect(result.propertiesProcessed).toBe(3)
    expect(result.vectorsCreated).toBeGreaterThan(0)
    
    // Verify the workflow steps were called
    expect(testSetup.mockStep.do).toHaveBeenCalledWith('fetch-and-save-page', expect.any(Function))
    expect(testSetup.mockStep.do).toHaveBeenCalledWith('vectorize-page-title', expect.any(Function))
    expect(testSetup.mockStep.do).toHaveBeenCalledWith('process-properties', expect.any(Function))
    expect(testSetup.mockStep.do).toHaveBeenCalledWith('process-blocks', expect.any(Function))
    expect(testSetup.mockStep.do).toHaveBeenCalledWith('complete-sync-job', expect.any(Function))
  })

  it('should handle page not found', async () => {
    const params = {
      pageId: 'non-existent',
      notionToken: 'test-token',
      includeBlocks: true,
      includeProperties: true
    }

    mockNotionServiceInstance.fetchPageFromNotion.mockResolvedValueOnce(null)

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, testSetup.mockStep)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Page non-existent not found')
    expect(testSetup.mockStep.do).toHaveBeenCalledWith('record-error', expect.any(Function))
  })

  it('should handle API errors', async () => {
    const params = {
      pageId: 'page-123',
      notionToken: 'test-token',
      includeBlocks: true,
      includeProperties: true
    }

    mockNotionServiceInstance.fetchPageFromNotion.mockRejectedValueOnce(new Error('Notion API Error'))

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, testSetup.mockStep)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Notion API Error')
    expect(testSetup.mockStep.do).toHaveBeenCalledWith('record-error', expect.any(Function))
  })

  it('should handle non-Error exceptions', async () => {
    const params = {
      pageId: 'page-123',
      notionToken: 'test-token',
      includeBlocks: true,
      includeProperties: true
    }

    mockNotionServiceInstance.fetchPageFromNotion.mockImplementationOnce(() => {
      throw 'String error'
    })

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, testSetup.mockStep)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Sync failed')
  })

  it('should skip blocks when includeBlocks is false', async () => {
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
          title: [{ plain_text: 'Test Page' }]
        }
      }
    }

    mockNotionServiceInstance.fetchPageFromNotion.mockResolvedValueOnce(mockPage)

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, testSetup.mockStep)

    expect(result.success).toBe(true)
    expect(result.blocksProcessed).toBe(0)
    expect(mockNotionServiceInstance.fetchBlocksFromNotion).not.toHaveBeenCalled()
  })

  it('should skip properties when includeProperties is false', async () => {
    const params = {
      pageId: 'page-123',
      notionToken: 'test-token',
      includeBlocks: false,
      includeProperties: false
    }

    const mockPage = {
      id: 'page-123',
      url: 'https://notion.so/page-123',
      properties: {
        Title: {
          type: 'title',
          title: [{ plain_text: 'Test Page' }]
        }
      }
    }

    mockNotionServiceInstance.fetchPageFromNotion.mockResolvedValueOnce(mockPage)

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, testSetup.mockStep)

    expect(result.success).toBe(true)
    expect(result.propertiesProcessed).toBe(0)
    expect(testSetup.mockStep.do).not.toHaveBeenCalledWith('process-properties', expect.any(Function))
  })

  it('should handle pages without title property', async () => {
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
        Name: {
          type: 'rich_text',
          rich_text: [{ plain_text: 'Not a title' }]
        }
      }
    }

    mockNotionServiceInstance.fetchPageFromNotion.mockResolvedValueOnce(mockPage)

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, testSetup.mockStep)

    expect(result.success).toBe(true)
    expect(result.vectorsCreated).toBe(1) // Only the rich_text property
  })

  it('should handle empty title text', async () => {
    const params = {
      pageId: 'page-123',
      notionToken: 'test-token',
      includeBlocks: false,
      includeProperties: false
    }

    const mockPage = {
      id: 'page-123',
      url: 'https://notion.so/page-123',
      properties: {
        Title: {
          type: 'title',
          title: [] // Empty title array
        }
      }
    }

    mockNotionServiceInstance.fetchPageFromNotion.mockResolvedValueOnce(mockPage)

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, testSetup.mockStep)

    expect(result.success).toBe(true)
    expect(result.vectorsCreated).toBe(0) // No vectors created for empty title
  })

  it('should handle blocks fetch failure', async () => {
    const params = {
      pageId: 'page-123',
      notionToken: 'test-token',
      includeBlocks: true,
      includeProperties: true
    }

    const mockPage = {
      id: 'page-123',
      url: 'https://notion.so/page-123',
      properties: {
        Title: {
          type: 'title',
          title: [{ plain_text: 'Test' }]
        }
      }
    }

    mockNotionServiceInstance.fetchPageFromNotion.mockResolvedValueOnce(mockPage)
    mockNotionServiceInstance.fetchBlocksFromNotion.mockRejectedValueOnce(new Error('Blocks fetch failed'))

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, testSetup.mockStep)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Blocks fetch failed')
    expect(result.blocksProcessed).toBe(0)
  })

  it('should use default namespaces when not provided', async () => {
    const params = {
      pageId: 'page-123',
      notionToken: 'test-token',
      includeBlocks: true,
      includeProperties: true
      // No namespace provided
    }

    const mockPage = {
      id: 'page-123',
      url: 'https://notion.so/page-123',
      properties: {
        Title: {
          type: 'title',
          title: [{ plain_text: 'Test' }]
        }
      }
    }

    const mockBlocks = [
      {
        id: 'block-1',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ plain_text: 'Long enough content to be vectorized here' }]
        }
      }
    ]

    mockNotionServiceInstance.fetchPageFromNotion.mockResolvedValueOnce(mockPage)
    mockNotionServiceInstance.fetchBlocksFromNotion.mockResolvedValueOnce(mockBlocks)

    const event = { payload: params, timestamp: new Date() }
    await workflow.run(event as any, testSetup.mockStep)

    // Check that the default namespaces were used
    expect(mockVectorManager.createVectorAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'notion-pages', // Default namespace for title
      expect.any(Object)
    )
  })

  it('should handle properties with null values', async () => {
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
        Status: {
          type: 'select',
          select: null // Null value
        },
        Tags: {
          type: 'multi_select',
          multi_select: null // Null value
        }
      }
    }

    mockNotionServiceInstance.fetchPageFromNotion.mockResolvedValueOnce(mockPage)

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, testSetup.mockStep)

    expect(result.success).toBe(true)
    expect(result.propertiesProcessed).toBe(3)
    expect(result.vectorsCreated).toBe(2) // Title + empty string values still create vectors
  })

  it('should filter short blocks from vectorization', async () => {
    const params = {
      pageId: 'page-123',
      notionToken: 'test-token',
      includeBlocks: true,
      includeProperties: false
    }

    const mockPage = {
      id: 'page-123',
      url: 'https://notion.so/page-123',
      properties: {
        Title: {
          type: 'title',
          title: [{ plain_text: 'Test' }]
        }
      }
    }

    const mockBlocks = [
      {
        id: 'block-1',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ plain_text: 'Short' }] // Less than 10 chars
        }
      },
      {
        id: 'block-2',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ plain_text: 'This is a longer block with sufficient content' }]
        }
      },
      {
        id: 'block-3',
        type: 'divider',
        divider: {} // No text content
      }
    ]

    mockNotionServiceInstance.fetchPageFromNotion.mockResolvedValueOnce(mockPage)
    mockNotionServiceInstance.fetchBlocksFromNotion.mockResolvedValueOnce(mockBlocks)

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, testSetup.mockStep)

    expect(result.success).toBe(true)
    expect(result.blocksProcessed).toBe(3) // All blocks processed
    expect(result.vectorsCreated).toBe(2) // Title + 1 long block
  })

  it('should handle multi_select with empty array', async () => {
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
        Tags: {
          type: 'multi_select',
          multi_select: [] // Empty array
        }
      }
    }

    mockNotionServiceInstance.fetchPageFromNotion.mockResolvedValueOnce(mockPage)

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, testSetup.mockStep)

    expect(result.success).toBe(true)
    expect(result.propertiesProcessed).toBe(2)
    expect(result.vectorsCreated).toBe(2) // Title + empty multi_select still creates vector
  })

  it('should handle select with empty name', async () => {
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
        Status: {
          type: 'select',
          select: { name: '' } // Empty name
        }
      }
    }

    mockNotionServiceInstance.fetchPageFromNotion.mockResolvedValueOnce(mockPage)

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, testSetup.mockStep)

    expect(result.success).toBe(true)
    expect(result.propertiesProcessed).toBe(2)
    expect(result.vectorsCreated).toBe(2) // Title + empty select still creates vector
  })

  it('should handle save operations failures gracefully', async () => {
    const params = {
      pageId: 'page-123',
      notionToken: 'test-token',
      includeBlocks: false,
      includeProperties: false
    }

    const mockPage = {
      id: 'page-123',
      url: 'https://notion.so/page-123',
      properties: {
        Title: {
          type: 'title',
          title: [{ plain_text: 'Test' }]
        }
      }
    }

    mockNotionServiceInstance.fetchPageFromNotion.mockResolvedValueOnce(mockPage)
    mockNotionServiceInstance.savePage.mockRejectedValueOnce(new Error('Save failed'))

    const event = { payload: params, timestamp: new Date() }
    const result = await workflow.run(event as any, testSetup.mockStep)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Save failed')
  })
})