import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock cloudflare:workers
vi.mock('cloudflare:workers', () => ({
  WorkflowEntrypoint: class {
    constructor(public ctx: any, public env: any) {}
  },
  WorkflowStep: {},
  WorkflowEvent: {}
}))

// Mock dependencies
vi.mock('../../../src/services/notion.service')
vi.mock('../../../src/db')
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, any>
  return {
    ...actual,
    eq: vi.fn((field, value) => ({ field, value })),
    sql: vi.fn()
  }
})

// Import after mocking
import { 
  NotionSyncWorkflow,
  TitlePropertySchema,
  RichTextPropertySchema,
  SelectPropertySchema,
  MultiSelectPropertySchema,
  VectorizablePropertySchema
} from '../../../src/workflows/notion-sync'
import { NotionService } from '../../../src/services/notion.service'
import { getDb } from '../../../src/db'
import { notionSyncJobs } from '../../../src/db/schema'

// Mock WorkflowStep
const mockStep = {
  do: vi.fn()
}

// Mock WorkflowEvent
const createMockEvent = (payload: any) => ({
  payload,
  timestamp: new Date()
})

describe('NotionSyncWorkflow', () => {
  let workflow: NotionSyncWorkflow
  let mockEnv: any
  let mockCtx: any
  let mockNotionService: any
  let mockVectorManager: any
  let mockDb: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockVectorManager = {
      createVectorAsync: vi.fn().mockResolvedValue({ jobId: 'vec-job-123' })
    }
    
    mockEnv = {
      NOTION_API_KEY: 'test-notion-key',
      DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
      VECTOR_CACHE: {
        idFromName: vi.fn().mockReturnValue('vector-manager-id'),
        get: vi.fn().mockReturnValue(mockVectorManager)
      }
    }

    mockCtx = {}

    mockNotionService = {
      fetchPageFromNotion: vi.fn(),
      savePage: vi.fn(),
      saveVectorRelation: vi.fn(),
      savePageProperties: vi.fn(),
      fetchPageBlocks: vi.fn(),
      fetchBlocksFromNotion: vi.fn(),
      savePageBlocks: vi.fn(),
      saveBlocks: vi.fn()
    }
    
    mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue({})
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({})
        })
      })
    }
    
    vi.mocked(NotionService).mockImplementation(() => mockNotionService)
    vi.mocked(getDb).mockReturnValue(mockDb)

    workflow = new NotionSyncWorkflow(mockCtx, mockEnv)
  })

  describe('run', () => {
    it('should sync page successfully with title', async () => {
      const params = {
        pageId: 'page-123',
        notionToken: 'test-token',
        includeBlocks: true,
        includeProperties: true,
        namespace: 'notion-test'
      }

      const mockPage = {
        id: 'page-123',
        url: 'https://notion.so/page-123',
        properties: {
          Title: {
            type: 'title',
            title: [{ plain_text: 'Test Page' }]
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
            rich_text: [{ plain_text: 'This is a paragraph' }]
          }
        },
        {
          id: 'block-2',
          type: 'heading_1',
          heading_1: {
            rich_text: [{ plain_text: 'Heading' }]
          }
        }
      ]

      mockNotionService.fetchPageFromNotion.mockResolvedValueOnce(mockPage)
      mockNotionService.fetchBlocksFromNotion.mockResolvedValueOnce(mockBlocks)
      
      // Mock the VectorManager to return expected job IDs
      mockVectorManager.createVectorAsync
        .mockResolvedValueOnce({ jobId: 'vec-job-title' })
        .mockResolvedValueOnce({ jobId: 'vec-job-prop-1' })
        .mockResolvedValueOnce({ jobId: 'vec-job-block-1' })
        .mockResolvedValueOnce({ jobId: 'vec-job-block-2' })

      // Mock the savePage and related methods to return success
      mockNotionService.savePage.mockResolvedValueOnce(undefined)
      mockNotionService.saveVectorRelation.mockResolvedValue(undefined)
      mockNotionService.savePageProperties.mockResolvedValueOnce(['prop-1'])
      mockNotionService.saveBlocks.mockResolvedValueOnce(undefined)

      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'fetch-and-save-page') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'vectorize-page-title') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'process-properties') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'process-blocks') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'complete-sync-job') {
            return await fn()
          }
        })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result).toMatchObject({
        success: true,
        pageId: 'page-123',
        blocksProcessed: 2,
        propertiesProcessed: 2, // Title and Status
        vectorsCreated: 4, // 1 title + 1 property + 2 blocks
        completedAt: expect.any(String)
      })

      expect(mockNotionService.savePage).toHaveBeenCalledWith(mockPage)
      expect(mockVectorManager.createVectorAsync).toHaveBeenCalled()
      expect(mockNotionService.saveVectorRelation).toHaveBeenCalled()
    })

    it('should handle page without title', async () => {
      const params = {
        pageId: 'page-123',
        notionToken: 'test-token'
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

      mockNotionService.fetchPageFromNotion.mockResolvedValueOnce(mockPage)
      
      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'fetch-and-save-page') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'vectorize-page-title') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'process-properties') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'process-blocks') {
            return await fn()
          }
        })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result.vectorsCreated).toBe(1) // Only property vector
    })

    it('should handle empty title', async () => {
      const params = {
        pageId: 'page-123',
        notionToken: 'test-token'
      }

      const mockPage = {
        id: 'page-123',
        url: 'https://notion.so/page-123',
        properties: {
          Title: {
            type: 'title',
            title: []
          }
        }
      }

      mockNotionService.fetchPageFromNotion.mockResolvedValueOnce(mockPage)
      
      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'fetch-and-save-page') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'vectorize-page-title') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'process-properties') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'process-blocks') {
            return await fn()
          }
        })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result.vectorsCreated).toBe(0)
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
        properties: {
          Title: {
            type: 'title',
            title: [{ plain_text: 'Test' }]
          }
        }
      }

      mockNotionService.fetchPageFromNotion.mockResolvedValueOnce(mockPage)
      
      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'fetch-and-save-page') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'vectorize-page-title') {
            return await fn()
          }
        })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result.propertiesProcessed).toBe(0)
      expect(result.blocksProcessed).toBe(0)
      expect(result.vectorsCreated).toBe(1) // Only title
    })

    it('should handle page not found error', async () => {
      const params = {
        pageId: 'non-existent',
        notionToken: 'test-token'
      }

      mockNotionService.fetchPageFromNotion.mockResolvedValueOnce(null)
      
      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'fetch-and-save-page') {
            return await fn() // Execute the callback to test the null check
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'record-error') {
            return await fn()
          }
        })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result).toMatchObject({
        success: false,
        pageId: 'non-existent',
        error: 'Page non-existent not found',
        vectorsCreated: 0
      })
    })

    it('should handle API errors', async () => {
      const params = {
        pageId: 'page-123',
        notionToken: 'test-token'
      }

      mockNotionService.fetchPageFromNotion.mockRejectedValueOnce(new Error('API Error'))
      
      mockStep.do.mockImplementationOnce(async (name: string, fn: () => any) => {
        if (name === 'fetch-and-save-page') {
          throw new Error('API Error')
        }
      })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result).toMatchObject({
        success: false,
        error: 'API Error'
      })
    })

    it('should handle non-Error exceptions', async () => {
      const params = {
        pageId: 'page-123',
        notionToken: 'test-token'
      }

      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'fetch-and-save-page') {
            throw 'String error' // Non-Error exception
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'record-error') {
            return await fn()
          }
        })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result).toMatchObject({
        success: false,
        error: 'Sync failed',
        pageId: 'page-123'
      })
      
      // Verify the error was recorded correctly in the database
      expect(mockDb.insert).toHaveBeenCalled()
      const insertCall = mockDb.insert.mock.calls[0]
      expect(insertCall[0]).toBe(notionSyncJobs)
      const valuesCall = mockDb.insert.mock.results[0].value.values.mock.calls[0]
      expect(valuesCall[0].error).toBe('Unknown error')
    })

    it('should vectorize properties correctly', async () => {
      const params = {
        pageId: 'page-123',
        notionToken: 'test-token',
        includeProperties: true,
        includeBlocks: false
      }

      const mockPage = {
        id: 'page-123',
        properties: {
          Title: {
            type: 'title',
            title: [{ plain_text: 'Test' }]
          },
          Status: {
            type: 'select',
            select: { name: 'Active' }
          },
          Tags: {
            type: 'multi_select',
            multi_select: [{ name: 'Tag1' }, { name: 'Tag2' }]
          },
          Checkbox: {
            type: 'checkbox',
            checkbox: true
          },
          Formula: {
            type: 'formula',
            formula: { type: 'string', string: 'Result' }
          }
        }
      }

      mockNotionService.fetchPageFromNotion.mockResolvedValueOnce(mockPage)
      
      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'fetch-and-save-page') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'vectorize-page-title') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'process-properties') {
            return await fn()
          }
        })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result.propertiesProcessed).toBe(5) // Title, Status, Tags, Checkbox, Formula
      expect(mockNotionService.savePageProperties).toHaveBeenCalled()
    })

    it('should vectorize blocks correctly', async () => {
      const params = {
        pageId: 'page-123',
        notionToken: 'test-token',
        includeBlocks: true,
        includeProperties: false
      }

      const mockPage = {
        id: 'page-123',
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
            rich_text: [{ plain_text: 'Paragraph 1' }, { plain_text: ' continued' }]
          }
        },
        {
          id: 'block-2',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ plain_text: 'List item' }]
          }
        },
        {
          id: 'block-3',
          type: 'code',
          code: {
            rich_text: [{ plain_text: 'console.log("test")' }],
            language: 'javascript'
          }
        },
        {
          id: 'block-4',
          type: 'divider',
          divider: {}
        }
      ]

      mockNotionService.fetchPageFromNotion.mockResolvedValueOnce(mockPage)
      mockNotionService.fetchBlocksFromNotion.mockResolvedValueOnce(mockBlocks)
      
      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'fetch-and-save-page') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'vectorize-page-title') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'process-blocks') {
            return await fn()
          }
        })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result.blocksProcessed).toBe(4) // all blocks are counted
      expect(mockNotionService.saveBlocks).toHaveBeenCalled()
    })

    it('should handle partial failures gracefully', async () => {
      const params = {
        pageId: 'page-123',
        notionToken: 'test-token',
        includeBlocks: true,
        includeProperties: true
      }

      const mockPage = {
        id: 'page-123',
        properties: {
          Title: {
            type: 'title',
            title: [{ plain_text: 'Test' }]
          }
        }
      }

      mockNotionService.fetchPageFromNotion.mockResolvedValueOnce(mockPage)
      mockNotionService.fetchBlocksFromNotion.mockRejectedValueOnce(new Error('Blocks fetch failed'))
      
      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'fetch-and-save-page') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'vectorize-page-title') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'process-properties') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'process-blocks') {
            throw new Error('Blocks fetch failed')
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'record-error') {
            return await fn()
          }
        })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      // Should fail when blocks fetch fails
      expect(result.success).toBe(false)
      expect(result.error).toBe('Blocks fetch failed')
      expect(result.blocksProcessed).toBe(0)
    })

    it('should process table_row blocks correctly', async () => {
      const params = {
        pageId: 'page-123',
        notionToken: 'test-token',
        includeBlocks: true,
        includeProperties: false
      }

      const mockPage = {
        id: 'page-123',
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
          type: 'table_row',
          table_row: {
            cells: [
              [{ plain_text: 'Cell 1' }, { plain_text: ' continued' }],
              [{ plain_text: 'Cell 2' }],
              [{ plain_text: 'Cell 3' }]
            ]
          }
        }
      ]

      mockNotionService.fetchPageFromNotion.mockResolvedValueOnce(mockPage)
      mockNotionService.fetchBlocksFromNotion.mockResolvedValueOnce(mockBlocks)
      
      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'fetch-and-save-page') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'vectorize-page-title') {
            return await fn()
          }
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'process-blocks') {
            return await fn()
          }
        })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result.blocksProcessed).toBe(1)
      expect(result.vectorsCreated).toBe(2) // 1 title + 1 table_row block
    })
  })

  describe('extractPlainTextFromBlock', () => {
    it('should extract text from table_row blocks', () => {
      const workflow = new NotionSyncWorkflow(mockCtx, mockEnv)
      const block = {
        type: 'table_row',
        table_row: {
          cells: [
            [{ plain_text: 'Cell 1' }, { plain_text: ' Part 2' }],
            [{ plain_text: 'Cell 2' }],
            [{ plain_text: 'Cell 3' }]
          ]
        }
      }

      const result = (workflow as any).extractPlainTextFromBlock(block)
      expect(result).toBe('Cell 1 Part 2 Cell 2 Cell 3')
    })

    it('should handle table_row with empty cells', () => {
      const workflow = new NotionSyncWorkflow(mockCtx, mockEnv)
      const block = {
        type: 'table_row',
        table_row: {
          cells: [
            [],
            [{ plain_text: 'Cell 2' }],
            []
          ]
        }
      }

      const result = (workflow as any).extractPlainTextFromBlock(block)
      expect(result).toBe(' Cell 2 ')
    })

    it('should handle rich text without plain_text', () => {
      const workflow = new NotionSyncWorkflow(mockCtx, mockEnv)
      const block = {
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { plain_text: 'Text 1' },
            { annotations: { bold: true } }, // No plain_text field
            { plain_text: 'Text 2' }
          ]
        }
      }

      const result = (workflow as any).extractPlainTextFromBlock(block)
      expect(result).toBe('Text 1Text 2')
    })

    it('should handle code blocks', () => {
      const workflow = new NotionSyncWorkflow(mockCtx, mockEnv)
      const block = {
        type: 'code',
        code: {
          rich_text: [{ plain_text: 'console.log("Hello")' }],
          language: 'javascript'
        }
      }

      const result = (workflow as any).extractPlainTextFromBlock(block)
      expect(result).toBe('console.log("Hello")')
    })

    it('should return empty string for blocks without content', () => {
      const workflow = new NotionSyncWorkflow(mockCtx, mockEnv)
      const block = {
        type: 'divider',
        divider: {}
      }

      const result = (workflow as any).extractPlainTextFromBlock(block)
      expect(result).toBe('')
    })

    it('should return empty string for unsupported block types', () => {
      const workflow = new NotionSyncWorkflow(mockCtx, mockEnv)
      const block = {
        type: 'unsupported_type',
        unsupported_type: {
          some_field: 'value'
        }
      }

      const result = (workflow as any).extractPlainTextFromBlock(block)
      expect(result).toBe('')
    })

    it('should handle block without content property', () => {
      const workflow = new NotionSyncWorkflow(mockCtx, mockEnv)
      const block = {
        type: 'missing_content',
        id: 'block-id'
      }

      const result = (workflow as any).extractPlainTextFromBlock(block)
      expect(result).toBe('')
    })

    it('should handle malformed rich text block', () => {
      const workflow = new NotionSyncWorkflow(mockCtx, mockEnv)
      const block = {
        type: 'paragraph',
        paragraph: {
          rich_text: 'not an array' // Invalid structure
        }
      }

      const result = (workflow as any).extractPlainTextFromBlock(block)
      expect(result).toBe('')
    })

    it('should handle malformed code block', () => {
      const workflow = new NotionSyncWorkflow(mockCtx, mockEnv)
      const block = {
        type: 'code',
        code: {
          rich_text: null // Invalid structure
        }
      }

      const result = (workflow as any).extractPlainTextFromBlock(block)
      expect(result).toBe('')
    })

    it('should handle malformed table_row block', () => {
      const workflow = new NotionSyncWorkflow(mockCtx, mockEnv)
      const block = {
        type: 'table_row',
        table_row: {
          cells: 'not an array' // Invalid structure
        }
      }

      const result = (workflow as any).extractPlainTextFromBlock(block)
      expect(result).toBe('')
    })
  })

  describe('Zod Schemas', () => {
    describe('TitlePropertySchema', () => {
      it('should parse valid title property', () => {
        const data = {
          type: 'title',
          title: [
            { plain_text: 'Test Title' },
            { plain_text: ' Part 2' }
          ]
        }
        const result = TitlePropertySchema.parse(data)
        expect(result.title[0].plain_text).toBe('Test Title')
        expect(result.title[1].plain_text).toBe(' Part 2')
      })

      it('should handle missing plain_text with transform', () => {
        const data = {
          type: 'title',
          title: [
            { plain_text: 'Test' },
            { annotations: { bold: true } }, // No plain_text
            { plain_text: undefined }, // Undefined plain_text
            { plain_text: null }, // Null plain_text
          ]
        }
        const result = TitlePropertySchema.parse(data)
        expect(result.title[0].plain_text).toBe('Test')
        expect(result.title[1].plain_text).toBe('')
        expect(result.title[2].plain_text).toBe('')
        expect(result.title[3].plain_text).toBe('')
      })
    })

    describe('RichTextPropertySchema', () => {
      it('should parse valid rich_text property', () => {
        const data = {
          type: 'rich_text',
          rich_text: [
            { plain_text: 'Some text' },
            { plain_text: ' more text' }
          ]
        }
        const result = RichTextPropertySchema.parse(data)
        expect(result.rich_text[0].plain_text).toBe('Some text')
        expect(result.rich_text[1].plain_text).toBe(' more text')
      })

      it('should handle missing plain_text with transform', () => {
        const data = {
          type: 'rich_text',
          rich_text: [
            { plain_text: null },
            { plain_text: undefined },
            {}
          ]
        }
        const result = RichTextPropertySchema.parse(data)
        expect(result.rich_text[0].plain_text).toBe('')
        expect(result.rich_text[1].plain_text).toBe('')
        expect(result.rich_text[2].plain_text).toBe('')
      })
    })

    describe('SelectPropertySchema', () => {
      it('should parse valid select property', () => {
        const data = {
          type: 'select',
          select: { name: 'Option 1' }
        }
        const result = SelectPropertySchema.parse(data)
        expect(result.select?.name).toBe('Option 1')
      })

      it('should handle null select', () => {
        const data = {
          type: 'select',
          select: null
        }
        const result = SelectPropertySchema.parse(data)
        expect(result.select).toEqual({ name: '' })
      })
    })

    describe('MultiSelectPropertySchema', () => {
      it('should parse valid multi_select property', () => {
        const data = {
          type: 'multi_select',
          multi_select: [
            { name: 'Tag 1' },
            { name: 'Tag 2' }
          ]
        }
        const result = MultiSelectPropertySchema.parse(data)
        expect(result.multi_select).toHaveLength(2)
        expect(result.multi_select?.[0].name).toBe('Tag 1')
      })

      it('should handle null multi_select', () => {
        const data = {
          type: 'multi_select',
          multi_select: null
        }
        const result = MultiSelectPropertySchema.parse(data)
        expect(result.multi_select).toEqual([])
      })
    })

    describe('VectorizablePropertySchema', () => {
      it('should parse title property through discriminated union', () => {
        const data = {
          type: 'title',
          title: [{ plain_text: 'Title' }]
        }
        const result = VectorizablePropertySchema.parse(data)
        expect(result.type).toBe('title')
        expect((result as any).title[0].plain_text).toBe('Title')
      })

      it('should parse rich_text property through discriminated union', () => {
        const data = {
          type: 'rich_text',
          rich_text: [{ plain_text: 'Text' }]
        }
        const result = VectorizablePropertySchema.parse(data)
        expect(result.type).toBe('rich_text')
        expect((result as any).rich_text[0].plain_text).toBe('Text')
      })

      it('should parse select property through discriminated union', () => {
        const data = {
          type: 'select',
          select: { name: 'Option' }
        }
        const result = VectorizablePropertySchema.parse(data)
        expect(result.type).toBe('select')
        expect((result as any).select.name).toBe('Option')
      })

      it('should parse multi_select property through discriminated union', () => {
        const data = {
          type: 'multi_select',
          multi_select: [{ name: 'Tag' }]
        }
        const result = VectorizablePropertySchema.parse(data)
        expect(result.type).toBe('multi_select')
        expect((result as any).multi_select[0].name).toBe('Tag')
      })

      it('should throw error for unsupported property type', () => {
        const data = {
          type: 'checkbox',
          checkbox: true
        }
        expect(() => VectorizablePropertySchema.parse(data)).toThrow()
      })
    })
  })
})