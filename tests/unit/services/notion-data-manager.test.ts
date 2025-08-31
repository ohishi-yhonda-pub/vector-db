import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NotionDataManager } from '../../../src/services/notion-data-manager'
import { getDb } from '../../../src/db'

// Mock database
vi.mock('../../../src/db', () => ({
  getDb: vi.fn()
}))

describe('NotionDataManager', () => {
  let manager: NotionDataManager
  let mockDb: any
  let mockEnv: Env

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup mock database
    mockDb = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis()
    }

    ;(getDb as any).mockReturnValue(mockDb)
    
    mockEnv = {} as Env
    manager = new NotionDataManager(mockEnv)
  })

  describe('savePage', () => {
    it('should save a page to database', async () => {
      const mockPage = {
        id: 'page-123',
        object: 'page',
        created_time: '2024-01-01T00:00:00.000Z',
        last_edited_time: '2024-01-01T00:00:00.000Z',
        created_by: { id: 'user-1' },
        last_edited_by: { id: 'user-1' },
        archived: false,
        in_trash: false,
        properties: { title: { type: 'title' } },
        parent: { type: 'workspace' },
        url: 'https://notion.so/page-123',
        public_url: null,
        cover: null,
        icon: null
      }

      await manager.savePage(mockPage as any)

      expect(mockDb.insert).toHaveBeenCalled()
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'page-123',
          object: 'page',
          archived: false,
          inTrash: false
        })
      )
    })
  })

  describe('saveBlocks', () => {
    it('should save multiple blocks', async () => {
      const mockBlocks = [
        {
          id: 'block-1',
          object: 'block',
          type: 'paragraph',
          created_time: '2024-01-01T00:00:00.000Z',
          last_edited_time: '2024-01-01T00:00:00.000Z',
          created_by: { id: 'user-1' },
          last_edited_by: { id: 'user-1' },
          has_children: false,
          archived: false,
          in_trash: false,
          parent: { type: 'page_id', page_id: 'page-123' },
          paragraph: {
            rich_text: [{ plain_text: 'Test text' }]
          }
        }
      ]

      await manager.saveBlocks('page-123', mockBlocks as any)

      expect(mockDb.insert).toHaveBeenCalled()
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'block-1',
          pageId: 'page-123',
          type: 'paragraph',
          plainText: 'Test text'
        })
      )
    })

    it('should skip saving when no blocks', async () => {
      await manager.saveBlocks('page-123', [])
      expect(mockDb.insert).not.toHaveBeenCalled()
    })
  })

  describe('savePageProperties', () => {
    it('should save page properties', async () => {
      const properties = {
        Title: {
          id: 'title-id',
          type: 'title',
          title: [{ plain_text: 'Test Page' }]
        },
        Status: {
          id: 'status-id',
          type: 'select',
          select: { name: 'Published' }
        }
      }

      await manager.savePageProperties('page-123', properties)

      expect(mockDb.insert).toHaveBeenCalledTimes(2)
    })
  })

  describe('getPage', () => {
    it('should retrieve a page from database', async () => {
      const mockPage = { id: 'page-123', object: 'page' }
      mockDb.limit.mockResolvedValue([mockPage])

      const result = await manager.getPage('page-123')

      expect(result).toEqual(mockPage)
      expect(mockDb.select).toHaveBeenCalled()
      expect(mockDb.where).toHaveBeenCalled()
      expect(mockDb.limit).toHaveBeenCalledWith(1)
    })

    it('should return null if page not found', async () => {
      mockDb.limit.mockResolvedValue([])

      const result = await manager.getPage('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('getAllPages', () => {
    it('should retrieve all pages with filters', async () => {
      const mockPages = [
        { id: 'page-1', archived: false },
        { id: 'page-2', archived: false }
      ]
      mockDb.limit.mockResolvedValue(mockPages)

      const result = await manager.getAllPages({
        archived: false,
        limit: 10
      })

      expect(result).toEqual(mockPages)
      expect(mockDb.limit).toHaveBeenCalledWith(10)
    })

    it('should retrieve all pages without filters', async () => {
      const mockPages = [{ id: 'page-1' }, { id: 'page-2' }]
      mockDb.orderBy.mockResolvedValue(mockPages)

      const result = await manager.getAllPages()

      expect(result).toEqual(mockPages)
      expect(mockDb.orderBy).toHaveBeenCalled()
    })
  })

  describe('getBlocks', () => {
    it('should retrieve blocks for a page', async () => {
      const mockBlocks = [
        { id: 'block-1', orderIndex: 0 },
        { id: 'block-2', orderIndex: 1 }
      ]
      mockDb.orderBy.mockResolvedValue(mockBlocks)

      const result = await manager.getBlocks('page-123')

      expect(result).toEqual(mockBlocks)
      expect(mockDb.where).toHaveBeenCalled()
      expect(mockDb.orderBy).toHaveBeenCalled()
    })
  })

  describe('extractPageTitle', () => {
    it('should extract title from properties', () => {
      const properties = {
        Title: {
          type: 'title',
          title: [
            { plain_text: 'My ' },
            { plain_text: 'Page' }
          ]
        }
      }

      const result = manager.extractPageTitle(properties)

      expect(result).toBe('My Page')
    })

    it('should return Untitled for missing title', () => {
      const properties = {
        Status: { type: 'select' }
      }

      const result = manager.extractPageTitle(properties)

      expect(result).toBe('Untitled')
    })
  })

  describe('saveVectorRelation', () => {
    it('should save vector relation', async () => {
      await manager.saveVectorRelation(
        'page-123',
        'vec-123',
        'default',
        'page',
        'block-123'
      )

      expect(mockDb.insert).toHaveBeenCalled()
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          notionPageId: 'page-123',
          vectorId: 'vec-123',
          vectorNamespace: 'default',
          contentType: 'page',
          notionBlockId: 'block-123'
        })
      )
    })
  })

  describe('getPages method', () => {
    it('should get pages with archived filter', async () => {
      const mockResults = [{ id: 'page-1' }, { id: 'page-2' }]
      mockDb.where.mockResolvedValue(mockResults)
      
      const result = await manager.getAllPages({ archived: true })
      expect(result).toBe(mockResults)
    })
  })

  describe('extractPlainTextFromBlock (private method)', () => {
    it('should return empty string when block has no type', () => {
      const block = { type: '' } as any
      // @ts-ignore accessing private method for testing
      const result = manager.extractPlainTextFromBlock(block)
      expect(result).toBe('')
    })

    it('should handle table_row blocks', () => {
      const block = {
        type: 'table_row',
        table_row: {
          cells: [
            [{ plain_text: 'Cell 1' }],
            [{ plain_text: 'Cell 2' }]
          ]
        }
      } as any
      // @ts-ignore accessing private method for testing
      const result = manager.extractPlainTextFromBlock(block)
      expect(result).toBe('Cell 1 Cell 2')
    })

    it('should handle table_row blocks without cells', () => {
      const block = {
        type: 'table_row',
        table_row: {}
      } as any
      // @ts-ignore accessing private method for testing  
      const result = manager.extractPlainTextFromBlock(block)
      expect(result).toBe('')
    })
  })

  describe('extractPlainTextFromProperty (private method)', () => {
    it('should handle number property', () => {
      const property = { type: 'number', number: 42 }
      // @ts-ignore accessing private method for testing
      const result = manager.extractPlainTextFromProperty(property)
      expect(result).toBe('42')
    })

    it('should handle multi_select property', () => {
      const property = { 
        type: 'multi_select', 
        multi_select: [{ name: 'Tag1' }, { name: 'Tag2' }] 
      }
      // @ts-ignore accessing private method for testing
      const result = manager.extractPlainTextFromProperty(property)
      expect(result).toBe('Tag1, Tag2')
    })

    it('should handle date property', () => {
      const property = { type: 'date', date: { start: '2024-01-01' } }
      // @ts-ignore accessing private method for testing
      const result = manager.extractPlainTextFromProperty(property)
      expect(result).toBe('2024-01-01')
    })

    it('should handle people property', () => {
      const property = { 
        type: 'people', 
        people: [{ name: 'John' }, { id: 'user-123' }] 
      }
      // @ts-ignore accessing private method for testing
      const result = manager.extractPlainTextFromProperty(property)
      expect(result).toBe('John, user-123')
    })

    it('should handle url property', () => {
      const property = { type: 'url', url: 'https://example.com' }
      // @ts-ignore accessing private method for testing
      const result = manager.extractPlainTextFromProperty(property)
      expect(result).toBe('https://example.com')
    })

    it('should handle email property', () => {
      const property = { type: 'email', email: 'test@example.com' }
      // @ts-ignore accessing private method for testing
      const result = manager.extractPlainTextFromProperty(property)
      expect(result).toBe('test@example.com')
    })

    it('should handle phone_number property', () => {
      const property = { type: 'phone_number', phone_number: '+1234567890' }
      // @ts-ignore accessing private method for testing
      const result = manager.extractPlainTextFromProperty(property)
      expect(result).toBe('+1234567890')
    })

    it('should handle unknown property types', () => {
      const property = { type: 'unknown_type' }
      // @ts-ignore accessing private method for testing
      const result = manager.extractPlainTextFromProperty(property)
      expect(result).toBe('')
    })
  })
})