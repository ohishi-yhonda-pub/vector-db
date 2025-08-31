import { describe, it, expect } from 'vitest'
import { PageFormatter } from '../../../../src/routes/api/notion/page-formatter'
import type { NotionPage } from '../../../../src/db/schema'

describe('PageFormatter', () => {
  describe('extractTitle', () => {
    it('should extract title from properties', () => {
      const properties = {
        title: {
          title: [
            { plain_text: 'My ' },
            { plain_text: 'Page ' },
            { plain_text: 'Title' }
          ]
        }
      }
      
      const title = PageFormatter.extractTitle(properties)
      expect(title).toBe('My Page Title')
    })

    it('should return Untitled for missing title', () => {
      expect(PageFormatter.extractTitle({})).toBe('Untitled')
      expect(PageFormatter.extractTitle(null as any)).toBe('Untitled')
      expect(PageFormatter.extractTitle({ title: {} })).toBe('Untitled')
      expect(PageFormatter.extractTitle({ title: { title: [] } })).toBe('Untitled')
    })

    it('should handle empty plain_text', () => {
      const properties = {
        title: {
          title: [{ plain_text: '' }, { other: 'value' }]
        }
      }
      
      const title = PageFormatter.extractTitle(properties)
      expect(title).toBe('Untitled')
    })
  })

  describe('parseParent', () => {
    it('should parse JSON string parent', () => {
      const parentStr = '{"type": "workspace", "workspace": true}'
      const result = PageFormatter.parseParent(parentStr)
      
      expect(result).toEqual({
        type: 'workspace',
        workspace: true
      })
    })

    it('should return object parent as-is', () => {
      const parent = { type: 'page_id', page_id: 'page-123' }
      const result = PageFormatter.parseParent(parent)
      
      expect(result).toBe(parent)
    })

    it('should handle invalid JSON', () => {
      const result = PageFormatter.parseParent('invalid json')
      expect(result).toEqual({ type: 'unknown' })
    })
  })

  describe('parseProperties', () => {
    it('should parse JSON string properties', () => {
      const propsStr = '{"title": {"title": [{"plain_text": "Test"}]}}'
      const result = PageFormatter.parseProperties(propsStr)
      
      expect(result).toEqual({
        title: { title: [{ plain_text: 'Test' }] }
      })
    })

    it('should return object properties as-is', () => {
      const props = { title: { title: [] } }
      const result = PageFormatter.parseProperties(props)
      
      expect(result).toBe(props)
    })

    it('should handle invalid JSON', () => {
      const result = PageFormatter.parseProperties('invalid json')
      expect(result).toEqual({})
    })
  })

  describe('formatCachedPage', () => {
    it('should format cached page from database', () => {
      const cachedPage: NotionPage = {
        id: 'page-123',
        object: 'page',
        createdTime: '2024-01-01T00:00:00.000Z',
        lastEditedTime: '2024-01-02T00:00:00.000Z',
        createdById: 'user-1',
        lastEditedById: 'user-1',
        cover: null,
        icon: null,
        parent: '{"type": "workspace", "workspace": true}',
        archived: false,
        inTrash: false,
        properties: '{"title": {"title": [{"plain_text": "Test Page"}]}}',
        url: 'https://notion.so/page-123',
        publicUrl: null
      }
      
      const formatted = PageFormatter.formatCachedPage(cachedPage)
      
      expect(formatted).toEqual({
        id: 'page-123',
        title: 'Test Page',
        url: 'https://notion.so/page-123',
        last_edited_time: '2024-01-02T00:00:00.000Z',
        created_time: '2024-01-01T00:00:00.000Z',
        archived: false,
        parent: {
          type: 'workspace',
          workspace: true
        }
      })
    })
  })

  describe('formatApiPage', () => {
    it('should format page from Notion API', () => {
      const apiPage = {
        id: 'page-456',
        url: 'https://notion.so/page-456',
        last_edited_time: '2024-01-03T00:00:00.000Z',
        created_time: '2024-01-01T00:00:00.000Z',
        archived: true,
        parent: {
          type: 'database_id',
          database_id: 'db-123'
        },
        properties: {
          title: {
            title: [{ plain_text: 'API Page' }]
          }
        }
      }
      
      const formatted = PageFormatter.formatApiPage(apiPage)
      
      expect(formatted).toEqual({
        id: 'page-456',
        title: 'API Page',
        url: 'https://notion.so/page-456',
        last_edited_time: '2024-01-03T00:00:00.000Z',
        created_time: '2024-01-01T00:00:00.000Z',
        archived: true,
        parent: {
          type: 'database_id',
          database_id: 'db-123'
        }
      })
    })

    it('should handle missing fields', () => {
      const apiPage = { id: 'page-789' }
      const formatted = PageFormatter.formatApiPage(apiPage)
      
      expect(formatted).toEqual({
        id: 'page-789',
        title: 'Untitled',
        url: '',
        last_edited_time: '',
        created_time: '',
        archived: false,
        parent: {
          type: ''
        }
      })
    })
  })

  describe('formatPages', () => {
    it('should format multiple pages', () => {
      const pages = [
        {
          id: 'page-1',
          createdTime: '2024-01-01',
          lastEditedTime: '2024-01-02',
          url: 'https://notion.so/1',
          archived: false,
          parent: '{}',
          properties: '{}'
        } as NotionPage,
        {
          id: 'page-2',
          url: 'https://notion.so/2',
          archived: true
        }
      ]
      
      const formatted = PageFormatter.formatPages(pages, true)
      
      expect(formatted).toHaveLength(2)
      expect(formatted[0].id).toBe('page-1')
      expect(formatted[1].id).toBe('page-2')
    })
  })
})