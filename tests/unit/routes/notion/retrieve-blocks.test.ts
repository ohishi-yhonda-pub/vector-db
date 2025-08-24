import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { retrieveNotionBlocksRoute, retrieveNotionBlocksHandler } from '../../../../src/routes/api/notion/retrieve-blocks'

// Mock NotionService methods
const mockGetBlocks = vi.fn()
const mockFetchBlocksFromNotion = vi.fn()
const mockSaveBlocks = vi.fn()

vi.mock('../../../../src/services/notion.service', () => ({
  NotionService: vi.fn().mockImplementation(() => ({
    getBlocks: mockGetBlocks,
    fetchBlocksFromNotion: mockFetchBlocksFromNotion,
    saveBlocks: mockSaveBlocks
  }))
}))

describe('Retrieve Notion Blocks Route', () => {
  let app: OpenAPIHono<{ Bindings: Env }>
  let mockEnv: Env

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockEnv = {
      ENVIRONMENT: 'development' as const,
      DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
      DEFAULT_TEXT_GENERATION_MODEL: '@cf/meta/llama-3.1-8b-instruct',
      IMAGE_ANALYSIS_PROMPT: 'test-prompt',
      IMAGE_ANALYSIS_MAX_TOKENS: '1000',
      TEXT_EXTRACTION_MAX_TOKENS: '4000',
      NOTION_API_KEY: 'test-notion-key',
      AI: {} as any,
      VECTORIZE_INDEX: {} as any,
      VECTOR_CACHE: {} as any,
      NOTION_MANAGER: {} as any,
      AI_EMBEDDINGS: {} as any,
      DB: {} as any,
      BATCH_EMBEDDINGS_WORKFLOW: {} as any,
      VECTOR_OPERATIONS_WORKFLOW: {} as any,
      FILE_PROCESSING_WORKFLOW: {} as any,
      NOTION_SYNC_WORKFLOW: {} as any
    }

    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi(retrieveNotionBlocksRoute, retrieveNotionBlocksHandler)
  })

  describe('GET /notion/pages/{pageId}/blocks', () => {
    it('should retrieve blocks from cache successfully', async () => {
      const mockCachedBlocks = [
        {
          id: 'block-1',
          parentType: 'page_id',
          parentId: 'page-123',
          createdTime: '2024-01-01T00:00:00.000Z',
          lastEditedTime: '2024-01-02T00:00:00.000Z',
          createdById: 'user-123',
          lastEditedById: 'user-456',
          hasChildren: false,
          archived: false,
          inTrash: false,
          type: 'paragraph',
          content: JSON.stringify({
            paragraph: {
              rich_text: [{ plain_text: 'Test paragraph block' }]
            }
          })
        },
        {
          id: 'block-2',
          parentType: 'block_id',
          parentId: 'block-1',
          createdTime: '2024-01-03T00:00:00.000Z',
          lastEditedTime: '2024-01-04T00:00:00.000Z',
          createdById: 'user-789',
          lastEditedById: 'user-101',
          hasChildren: true,
          archived: false,
          inTrash: false,
          type: 'heading_1',
          content: JSON.stringify({
            heading_1: {
              rich_text: [{ plain_text: 'Test heading block' }]
            }
          })
        }
      ]

      mockGetBlocks.mockResolvedValue(mockCachedBlocks)

      const request = new Request('http://localhost/notion/pages/page-123/blocks?fromCache=true', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockGetBlocks).toHaveBeenCalledWith('page-123')
      expect(result.success).toBe(true)
      expect(result.data.blocks).toHaveLength(2)
      expect(result.data.blocks[0]).toEqual({
        object: 'block',
        id: 'block-1',
        parent: {
          type: 'page_id',
          page_id: 'page-123',
          block_id: undefined
        },
        created_time: '2024-01-01T00:00:00.000Z',
        last_edited_time: '2024-01-02T00:00:00.000Z',
        created_by: { object: 'user', id: 'user-123' },
        last_edited_by: { object: 'user', id: 'user-456' },
        has_children: false,
        archived: false,
        in_trash: false,
        type: 'paragraph',
        paragraph: {
          rich_text: [{ plain_text: 'Test paragraph block' }]
        }
      })
      expect(result.data.has_more).toBe(false)
      expect(result.data.next_cursor).toBeNull()
    })

    it('should fetch from Notion API when not in cache', async () => {
      const mockNotionBlocks = [
        {
          object: 'block',
          id: 'api-block-1',
          parent: {
            type: 'page_id',
            page_id: 'page-456'
          },
          created_time: '2024-01-05T00:00:00.000Z',
          last_edited_time: '2024-01-06T00:00:00.000Z',
          created_by: { object: 'user', id: 'user-111' },
          last_edited_by: { object: 'user', id: 'user-222' },
          has_children: false,
          archived: false,
          in_trash: false,
          type: 'paragraph',
          paragraph: {
            rich_text: [{ plain_text: 'API paragraph block' }]
          }
        }
      ]

      mockGetBlocks.mockResolvedValue([])
      mockFetchBlocksFromNotion.mockResolvedValue(mockNotionBlocks)
      mockSaveBlocks.mockResolvedValue(undefined)

      const request = new Request('http://localhost/notion/pages/page-456/blocks', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockFetchBlocksFromNotion).toHaveBeenCalledWith('page-456')
      expect(mockSaveBlocks).toHaveBeenCalledWith('page-456', mockNotionBlocks)
      expect(result.data.blocks).toEqual(mockNotionBlocks)
    })

    it('should return empty blocks when no blocks found', async () => {
      mockGetBlocks.mockResolvedValue([])
      mockFetchBlocksFromNotion.mockResolvedValue([])

      const request = new Request('http://localhost/notion/pages/empty-page/blocks', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.blocks).toEqual([])
      expect(result.data.has_more).toBe(false)
      expect(result.data.next_cursor).toBeNull()
      expect(mockSaveBlocks).not.toHaveBeenCalled()
    })

    it('should handle fromCache=true with empty cache', async () => {
      mockGetBlocks.mockResolvedValue([])

      const request = new Request('http://localhost/notion/pages/page-cache-empty/blocks?fromCache=true', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(mockGetBlocks).toHaveBeenCalledWith('page-cache-empty')
      expect(mockFetchBlocksFromNotion).toHaveBeenCalledWith('page-cache-empty')
      expect(result.data.blocks).toEqual([])
    })

    it('should handle missing Notion API key', async () => {
      mockEnv.NOTION_API_KEY = ''

      const request = new Request('http://localhost/notion/pages/page-123/blocks', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(401)
      expect(result).toEqual({
        success: false,
        error: 'Unauthorized',
        message: 'Notion APIトークンが設定されていません'
      })
    })

    it('should handle mixed parent types in cached blocks', async () => {
      const mockCachedBlocks = [
        {
          id: 'block-page-parent',
          parentType: 'page_id',
          parentId: 'page-789',
          createdTime: '2024-01-07T00:00:00.000Z',
          lastEditedTime: '2024-01-08T00:00:00.000Z',
          createdById: 'user-333',
          lastEditedById: 'user-444',
          hasChildren: false,
          archived: false,
          inTrash: false,
          type: 'paragraph',
          content: JSON.stringify({
            paragraph: {
              rich_text: [{ plain_text: 'Page parent block' }]
            }
          })
        },
        {
          id: 'block-block-parent',
          parentType: 'block_id',
          parentId: 'block-parent',
          createdTime: '2024-01-09T00:00:00.000Z',
          lastEditedTime: '2024-01-10T00:00:00.000Z',
          createdById: 'user-555',
          lastEditedById: 'user-666',
          hasChildren: true,
          archived: true,
          inTrash: true,
          type: 'bulleted_list_item',
          content: JSON.stringify({
            bulleted_list_item: {
              rich_text: [{ plain_text: 'Block parent item' }]
            }
          })
        }
      ]

      mockGetBlocks.mockResolvedValue(mockCachedBlocks)

      const request = new Request('http://localhost/notion/pages/page-789/blocks?fromCache=true', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.blocks[0].parent.page_id).toBe('page-789')
      expect(result.data.blocks[0].parent.block_id).toBeUndefined()
      expect(result.data.blocks[1].parent.page_id).toBeUndefined()
      expect(result.data.blocks[1].parent.block_id).toBe('block-parent')
      expect(result.data.blocks[1].archived).toBe(true)
      expect(result.data.blocks[1].in_trash).toBe(true)
    })

    it('should handle errors from NotionService', async () => {
      mockGetBlocks.mockResolvedValue([])
      mockFetchBlocksFromNotion.mockRejectedValue(new Error('Database connection error'))

      const request = new Request('http://localhost/notion/pages/page-error/blocks', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Database connection error'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockGetBlocks.mockResolvedValue([])
      mockFetchBlocksFromNotion.mockRejectedValue('String error')

      const request = new Request('http://localhost/notion/pages/page-error/blocks', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('ブロック取得中にエラーが発生しました')
    })

    it('should handle fromCache=false explicitly', async () => {
      const mockNotionBlocks = [
        {
          object: 'block',
          id: 'explicit-false-block',
          parent: { type: 'page_id', page_id: 'page-explicit-false' },
          created_time: '2024-01-11T00:00:00.000Z',
          last_edited_time: '2024-01-12T00:00:00.000Z',
          created_by: { object: 'user', id: 'user-777' },
          last_edited_by: { object: 'user', id: 'user-888' },
          has_children: false,
          archived: false,
          in_trash: false,
          type: 'paragraph',
          paragraph: {
            rich_text: [{ plain_text: 'Explicit false block' }]
          }
        }
      ]

      mockGetBlocks.mockResolvedValue([])
      mockFetchBlocksFromNotion.mockResolvedValue(mockNotionBlocks)
      mockSaveBlocks.mockResolvedValue(undefined)

      const request = new Request('http://localhost/notion/pages/page-explicit-false/blocks?fromCache=false', {
        method: 'GET'
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.blocks).toEqual(mockNotionBlocks)
    })
  })
})