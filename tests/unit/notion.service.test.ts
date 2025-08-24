import { describe, it, expect, vi, beforeEach } from 'vitest'
import { env, SELF } from 'cloudflare:test'
import { NotionService } from '../../src/services/notion.service'

describe('NotionService', () => {
  let service: NotionService

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    // Use real Cloudflare test environment with D1 database
    service = new NotionService(env, 'test-api-key')
  })

  describe('Constructor', () => {
    it('should create NotionService instance', () => {
      expect(service).toBeDefined()
      expect(service).toBeInstanceOf(NotionService)
    })

    it('should initialize with provided environment', () => {
      // getDb is called lazily when db getter is accessed
      expect(service).toBeDefined()
    })
  })

  describe('fetchPageFromNotion', () => {
    it('should fetch page from Notion API', async () => {
      const mockPageResponse = {
        id: '12345678-1234-1234-1234-123456789012',
        object: 'page',
        created_time: '2024-01-01T00:00:00.000Z',
        last_edited_time: '2024-01-01T00:00:00.000Z',
        created_by: { object: 'user' as const, id: 'user-1' },
        last_edited_by: { object: 'user' as const, id: 'user-1' },
        parent: { type: 'workspace' as const, workspace: true as true },
        archived: false,
        in_trash: false,
        properties: {},
        url: 'https://notion.so/test-page'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockPageResponse)
      })

      const result = await service.fetchPageFromNotion('12345678-1234-1234-1234-123456789012')

      expect(fetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/pages/12345678-1234-1234-1234-123456789012',
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
            'Notion-Version': '2022-06-28'
          }
        }
      )
      expect(result).toEqual(mockPageResponse)
    })

    it('should return null for 404 errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })

      const result = await service.fetchPageFromNotion('invalid-id')
      expect(result).toBeNull()
    })

    it('should throw error on API failure (non-404)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      })

      await expect(service.fetchPageFromNotion('invalid-id')).rejects.toThrow('Notion API error: 500')
    })
  })

  describe('fetchBlocksFromNotion', () => {
    it('should fetch blocks from Notion API', async () => {
      const mockBlocksResponse = {
        results: [
          {
            id: 'block-1',
            object: 'block',
            type: 'paragraph' as const,
            paragraph: { 
              rich_text: [{ plain_text: 'Test content' }]
            }
          }
        ],
        next_cursor: null,
        has_more: false
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockBlocksResponse)
      })

      const result = await service.fetchBlocksFromNotion('12345678-1234-1234-1234-123456789012')

      expect(fetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/blocks/12345678-1234-1234-1234-123456789012/children?page_size=100',
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
            'Notion-Version': '2022-06-28'
          }
        }
      )
      expect(result).toEqual(mockBlocksResponse.results)
    })

    it('should handle pagination', async () => {
      const mockFirstResponse = {
        results: [{ id: 'block-1' }],
        next_cursor: 'cursor-1',
        has_more: true
      }

      const mockSecondResponse = {
        results: [{ id: 'block-2' }],
        next_cursor: null,
        has_more: false
      }

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockFirstResponse)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockSecondResponse)
        })

      const result = await service.fetchBlocksFromNotion('page-id')

      expect(fetch).toHaveBeenCalledTimes(2)
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('block-1')
      expect(result[1].id).toBe('block-2')
    })
  })

  describe('fetchPagePropertyFromNotion', () => {
    it('should fetch page property from Notion API', async () => {
      const mockPropertyResponse = {
        id: 'prop-1',
        type: 'title',
        title: [{ plain_text: 'Test Title' }]
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockPropertyResponse)
      })

      const result = await service.fetchPagePropertyFromNotion('page-id', 'prop-id')

      expect(fetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/pages/page-id/properties/prop-id',
        {
          headers: {
            'Authorization': 'Bearer test-api-key',
            'Notion-Version': '2022-06-28'
          }
        }
      )
      expect(result).toEqual(mockPropertyResponse)
    })

    it('should throw error on property fetch failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      })

      await expect(service.fetchPagePropertyFromNotion('page-id', 'prop-id')).rejects.toThrow('Notion API error: 500')
    })

    it('should handle fetch errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      await expect(service.fetchPagePropertyFromNotion('page-id', 'prop-id')).rejects.toThrow('Network error')
    })
  })

  describe('searchAllPages', () => {
    it('should search pages from Notion API', async () => {
      const mockSearchResponse = {
        results: [
          { id: 'page-1', object: 'page' },
          { id: 'block-1', object: 'block' } // should be filtered out
        ],
        has_more: false,
        next_cursor: null
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockSearchResponse)
      })

      const result = await service.searchAllPages({ page_size: 50 })

      expect(fetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/search',
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-api-key',
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ page_size: 50 })
        }
      )
      expect(result.results).toHaveLength(1) // filtered to only pages
      expect(result.results[0].object).toBe('page')
    })

    it('should search pages with cursor and filter', async () => {
      const mockSearchResponse = {
        results: [{ id: 'page-1', object: 'page' }],
        has_more: true,
        next_cursor: 'cursor-123'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockSearchResponse)
      })

      const result = await service.searchAllPages({
        start_cursor: 'cursor-start',
        filter: { property: 'title', value: 'Test' }
      })

      const expectedBody = {
        page_size: 100,
        start_cursor: 'cursor-start',
        filter: {
          property: 'title',
          title: { equals: 'Test' }
        }
      }

      expect(fetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/search',
        expect.objectContaining({
          body: JSON.stringify(expectedBody)
        })
      )
      expect(result).toEqual(mockSearchResponse)
    })

    it('should throw error on search failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400
      })

      await expect(service.searchAllPages()).rejects.toThrow('Notion API error: 400')
    })
  })

  describe('extractPageTitle', () => {
    it('should extract title from properties', () => {
      const mockProperties = {
        'Title': {
          type: 'title',
          title: [
            { plain_text: 'Test Page' },
            { plain_text: ' Title' }
          ]
        },
        other_prop: {
          type: 'text',
          text: { content: 'Other content' }
        }
      }

      const title = service.extractPageTitle(mockProperties)

      expect(title).toBe('Test Page Title')
    })

    it('should return "Untitled" when no title property exists', () => {
      const mockProperties = {
        description: {
          type: 'rich_text',
          rich_text: [{ plain_text: 'Description only' }]
        }
      }

      const title = service.extractPageTitle(mockProperties)

      expect(title).toBe('Untitled')
    })

    it('should return "Untitled" when title property has no title field', () => {
      const mockProperties = {
        'Title': {
          type: 'title'
          // missing title field
        }
      }

      const title = service.extractPageTitle(mockProperties)

      expect(title).toBe('Untitled')
    })

    it('should return "Untitled" when title is empty', () => {
      const mockProperties = {
        'Title': {
          type: 'title',
          title: []
        }
      }

      const title = service.extractPageTitle(mockProperties)

      expect(title).toBe('Untitled')
    })

    it('should handle title with empty plain_text values', () => {
      const mockProperties = {
        'Title': {
          type: 'title',
          title: [
            { plain_text: '' },
            { plain_text: null }
          ]
        }
      }

      const title = service.extractPageTitle(mockProperties)

      expect(title).toBe('Untitled')
    })
  })

  describe('Database Operations', { sequential: true }, () => {
    it('should save page to D1 database', async () => {
      const mockPage = {
        id: 'page-test-1',
        object: 'page' as const,
        created_time: '2024-01-01T00:00:00.000Z',
        last_edited_time: '2024-01-01T00:00:00.000Z',
        created_by: { object: 'user' as const, id: 'user-1' },
        last_edited_by: { object: 'user' as const, id: 'user-1' },
        cover: { external: { url: 'cover.jpg' } },
        icon: { emoji: '📄' },
        parent: { type: 'workspace' as const, workspace: true as true },
        archived: false,
        in_trash: false,
        properties: { title: { type: 'title', title: [] } },
        url: 'https://notion.so/page-1',
        public_url: 'https://notion.so/page-1-public'
      }

      await service.savePage(mockPage)

      // Verify page was saved
      const savedPage = await service.getPage('page-test-1')
      expect(savedPage).toBeTruthy()
      expect(savedPage?.id).toBe('page-test-1')
      expect(savedPage?.url).toBe('https://notion.so/page-1')
    })

    it('should save page with null cover, icon and public_url', async () => {
      const mockPageWithNulls = {
        id: 'page-test-nulls',
        object: 'page' as const,
        created_time: '2024-01-01T00:00:00.000Z',
        last_edited_time: '2024-01-01T00:00:00.000Z',
        created_by: { object: 'user' as const, id: 'user-1' },
        last_edited_by: { object: 'user' as const, id: 'user-1' },
        cover: null, // covers line 124
        icon: null,  // covers line 125
        parent: { type: 'workspace' as const, workspace: true as true },
        archived: false,
        in_trash: false,
        properties: { title: { type: 'title', title: [] } },
        url: 'https://notion.so/page-nulls'
        // public_url missing - covers line 131
      }

      await service.savePage(mockPageWithNulls)

      // Verify page was saved
      const savedPage = await service.getPage('page-test-nulls')
      expect(savedPage).toBeTruthy()
      expect(savedPage?.id).toBe('page-test-nulls')
    })

    it('should save blocks to D1 database', async () => {
      const mockBlocks = [
        {
          id: 'block-test-1',
          object: 'block' as const,
          parent: { type: 'page_id' as const, page_id: 'page-test-1' },
          created_time: '2024-01-01T00:00:00.000Z',
          last_edited_time: '2024-01-01T00:00:00.000Z',
          created_by: { object: 'user' as const, id: 'user-1' },
          last_edited_by: { object: 'user' as const, id: 'user-1' },
          has_children: false,
          archived: false,
          in_trash: false,
          type: 'paragraph' as const,
          paragraph: { rich_text: [{ plain_text: 'Test paragraph content' }] }
        }
      ]

      await service.saveBlocks('page-test-1', mockBlocks)

      // Verify blocks were saved
      const savedBlocks = await service.getBlocks('page-test-1')
      expect(savedBlocks).toHaveLength(1)
      expect(savedBlocks[0].id).toBe('block-test-1')
      expect(savedBlocks[0].plainText).toBe('Test paragraph content')
    })

    it('should save page properties to D1 database', async () => {
      const mockProperties = {
        title: {
          id: 'title-id',
          type: 'title',
          title: [{ plain_text: 'Test Page Title' }]
        },
        score: {
          id: 'score-id',
          type: 'number',
          number: 95.5
        }
      }

      await service.savePageProperties('page-test-1', mockProperties)

      // We can't easily query page properties without exposing the method,
      // but we can test that the method completes without error
      expect(true).toBe(true)
    })

    it('should get all pages from cache', async () => {
      // Should return the page we saved earlier
      const pages = await service.getAllPagesFromCache()
      expect(pages.length).toBeGreaterThan(0)
      
      const testPage = pages.find(p => p.id === 'page-test-1')
      expect(testPage).toBeTruthy()
    })

    it('should get pages with limit', async () => {
      const pages = await service.getAllPagesFromCache({ limit: 1 })
      expect(pages).toHaveLength(1)
    })

    it('should get pages with archived filter', async () => {
      const pages = await service.getAllPagesFromCache({ archived: false })
      expect(pages.length).toBeGreaterThan(0)
      
      // All returned pages should not be archived
      pages.forEach(page => {
        expect(page.archived).toBe(false)
      })
    })

    it('should get pages with archived filter AND limit', async () => {
      // This test covers line 253: queryWithWhere.limit(options.limit)
      const pages = await service.getAllPagesFromCache({ archived: false, limit: 1 })
      expect(pages).toHaveLength(1)
      expect(pages[0].archived).toBe(false)
    })

    it('should save vector relations', async () => {
      await service.saveVectorRelation(
        'page-test-1',
        'vector-test-1',
        'test-namespace',
        'page-content'
      )

      await service.saveVectorRelation(
        'page-test-1',
        'vector-test-2',
        'test-namespace',
        'block-content',
        'block-test-1'
      )

      // The method completes without error
      expect(true).toBe(true)
    })

    it('should handle empty blocks array', async () => {
      await service.saveBlocks('page-test-1', [])
      // Should complete without error
      expect(true).toBe(true)
    })

    it('should handle empty properties', async () => {
      await service.savePageProperties('page-test-1', {})
      // Should complete without error
      expect(true).toBe(true)
    })

    it('should return null when page not found', async () => {
      const page = await service.getPage('non-existent-page')
      expect(page).toBeNull()
    })
  })

  describe('Utility Methods', () => {
    it('should extract plain text from different block types', () => {
      // Test paragraph block
      const paragraphBlock = {
        id: 'block-1',
        type: 'paragraph',
        paragraph: { rich_text: [{ plain_text: 'Test paragraph' }] }
      } as any

      const plainText1 = (service as any).extractPlainTextFromBlock(paragraphBlock)
      expect(plainText1).toBe('Test paragraph')

      // Test code block with various rich_text values (covers rt.plain_text || '')
      const codeBlock = {
        id: 'block-2',
        type: 'code',
        code: { 
          rich_text: [
            { plain_text: 'console.log("hello")' },
            { plain_text: null }, // null plain_text -> covers || '' branch
            { plain_text: '' },   // empty plain_text -> covers || '' branch
            { plain_text: undefined }, // undefined plain_text -> covers || '' branch
            { } // no plain_text property -> covers || '' branch
          ]
        }
      } as any

      const plainText2 = (service as any).extractPlainTextFromBlock(codeBlock)
      expect(plainText2).toBe('console.log("hello")')

      // Test table row block
      const tableRowBlock = {
        id: 'block-3',
        type: 'table_row',
        table_row: { 
          cells: [
            [{ plain_text: 'Cell 1' }, { plain_text: null }],
            [{ plain_text: 'Cell 2' }]
          ]
        }
      } as any

      const plainText3 = (service as any).extractPlainTextFromBlock(tableRowBlock)
      expect(plainText3).toBe('Cell 1 Cell 2')

      // Test unknown block type
      const unknownBlock = {
        id: 'block-4',
        type: 'unknown_type'
      } as any

      const plainText4 = (service as any).extractPlainTextFromBlock(unknownBlock)
      expect(plainText4).toBe('')

      // Test block with no content property at all
      const emptyBlock = {
        id: 'block-5',
        type: 'paragraph'
        // no paragraph property
      } as any

      const plainText5 = (service as any).extractPlainTextFromBlock(emptyBlock)
      expect(plainText5).toBe('')

      // Test block with no type
      const noTypeBlock = {
        id: 'block-6'
        // no type property
      } as any

      const plainText6 = (service as any).extractPlainTextFromBlock(noTypeBlock)
      expect(plainText6).toBe('')

      // Test image block (not in richTextTypes)
      const imageBlock = {
        id: 'block-7',
        type: 'image',
        image: {
          type: 'external',
          external: { url: 'https://example.com/image.png' }
        }
      } as any

      const plainText7 = (service as any).extractPlainTextFromBlock(imageBlock)
      expect(plainText7).toBe('')

      // Test table_row block without cells
      const tableRowNoCell = {
        id: 'block-8',
        type: 'table_row',
        table_row: {}
      } as any

      const plainText8 = (service as any).extractPlainTextFromBlock(tableRowNoCell)
      expect(plainText8).toBe('')

      // Test table_row block without table_row property
      const tableRowNoProperty = {
        id: 'block-9',
        type: 'table_row'
      } as any

      const plainText9 = (service as any).extractPlainTextFromBlock(tableRowNoProperty)
      expect(plainText9).toBe('')
    })

    it('should test hasRichText helper method', () => {
      // Test rich text types
      const paragraphBlock = { type: 'paragraph' } as any
      expect((service as any).hasRichText(paragraphBlock)).toBe(true)

      const codeBlock = { type: 'code' } as any
      expect((service as any).hasRichText(codeBlock)).toBe(true)

      // Test non-rich text type
      const imageBlock = { type: 'image' } as any
      expect((service as any).hasRichText(imageBlock)).toBe(false)

      const tableBlock = { type: 'table_row' } as any
      expect((service as any).hasRichText(tableBlock)).toBe(false)
    })

    it('should test getRichTextFromBlock helper method', () => {
      // Test block with rich text
      const blockWithRichText = {
        type: 'paragraph',
        paragraph: { rich_text: [{ plain_text: 'test' }] }
      } as any

      const richText1 = (service as any).getRichTextFromBlock(blockWithRichText)
      expect(richText1).toEqual([{ plain_text: 'test' }])

      // Test block without rich text property
      const blockWithoutRichText = {
        type: 'paragraph',
        paragraph: {}
      } as any

      const richText2 = (service as any).getRichTextFromBlock(blockWithoutRichText)
      expect(richText2).toBeNull()

      // Test block without block content
      const blockWithoutContent = {
        type: 'paragraph'
      } as any

      const richText3 = (service as any).getRichTextFromBlock(blockWithoutContent)
      expect(richText3).toBeNull()
    })

    it('should handle null property in extractPlainTextFromProperty', () => {
      // Test null property (covers line 373)
      const plainText = (service as any).extractPlainTextFromProperty(null)
      expect(plainText).toBe('')
    })

    it('should extract plain text from different property types', () => {
      // Test title property with null title array (covers line 378-380: || '' branch)
      const titlePropertyWithNull = {
        type: 'title',
        title: null
      }

      const plainText0 = (service as any).extractPlainTextFromProperty(titlePropertyWithNull)
      expect(plainText0).toBe('')

      // Test title property with empty array (covers || '' branch)
      const titlePropertyEmpty = {
        type: 'title',
        title: []
      }

      const plainTextEmpty = (service as any).extractPlainTextFromProperty(titlePropertyEmpty)
      expect(plainTextEmpty).toBe('')

      // Test title property
      const titleProperty = {
        type: 'title',
        title: [{ plain_text: 'Test Title' }]
      }

      const plainText1 = (service as any).extractPlainTextFromProperty(titleProperty)
      expect(plainText1).toBe('Test Title')

      // Test number property with null number (covers line 383: || '' branch)
      const numberPropertyNull = {
        type: 'number',
        number: null
      }

      const plainText2null = (service as any).extractPlainTextFromProperty(numberPropertyNull)
      expect(plainText2null).toBe('')

      // Test number property
      const numberProperty = {
        type: 'number',
        number: 42.5
      }

      const plainText2 = (service as any).extractPlainTextFromProperty(numberProperty)
      expect(plainText2).toBe('42.5')

      // Test select property
      const selectProperty = {
        type: 'select',
        select: { name: 'Important' }
      }

      const plainText3 = (service as any).extractPlainTextFromProperty(selectProperty)
      expect(plainText3).toBe('Important')

      // Test multi_select property
      const multiSelectProperty = {
        type: 'multi_select',
        multi_select: [{ name: 'tag1' }, { name: 'tag2' }]
      }

      const plainText4 = (service as any).extractPlainTextFromProperty(multiSelectProperty)
      expect(plainText4).toBe('tag1, tag2')

      // Test date property
      const dateProperty = {
        type: 'date',
        date: { start: '2024-01-01' }
      }

      const plainText5 = (service as any).extractPlainTextFromProperty(dateProperty)
      expect(plainText5).toBe('2024-01-01')

      // Test date property with null date (covers line 404: || '' branch)
      const dateNullProperty = {
        type: 'date',
        date: null
      }

      const plainText5b = (service as any).extractPlainTextFromProperty(dateNullProperty)
      expect(plainText5b).toBe('')

      // Test people property
      const peopleProperty = {
        type: 'people',
        people: [
          { name: 'John Doe', id: 'user-1' },
          { id: 'user-2' } // no name
        ]
      }

      const plainText6 = (service as any).extractPlainTextFromProperty(peopleProperty)
      expect(plainText6).toBe('John Doe, user-2')

      // Test URL property
      const urlProperty = {
        type: 'url',
        url: 'https://example.com'
      }

      const plainText7 = (service as any).extractPlainTextFromProperty(urlProperty)
      expect(plainText7).toBe('https://example.com')

      // Test null properties
      const nullProperty = {
        type: 'select',
        select: null
      }

      const plainText8 = (service as any).extractPlainTextFromProperty(nullProperty)
      expect(plainText8).toBe('')

      // Test rich_text property (covers line 389: rt.plain_text || '')
      const richTextProperty = {
        type: 'rich_text',
        rich_text: [
          { plain_text: 'Rich text content' },
          { plain_text: null }, // covers || '' branch
          { plain_text: '' }    // covers || '' branch  
        ]
      }

      const plainText9a = (service as any).extractPlainTextFromProperty(richTextProperty)
      expect(plainText9a).toBe('Rich text content')

      // Test multi_select with null multi_select (covers line 399-401)
      const multiSelectNullProperty = {
        type: 'multi_select',
        multi_select: null
      }

      const plainText9b = (service as any).extractPlainTextFromProperty(multiSelectNullProperty)
      expect(plainText9b).toBe('')

      // Test people with null people (covers line 407-409)  
      const peopleNullProperty = {
        type: 'people',
        people: null
      }

      const plainText9c = (service as any).extractPlainTextFromProperty(peopleNullProperty)
      expect(plainText9c).toBe('')

      // Test email property (covers line 414: property[property.type] || '')
      const emailProperty = {
        type: 'email',
        email: 'test@example.com'
      }

      const plainText9d = (service as any).extractPlainTextFromProperty(emailProperty)
      expect(plainText9d).toBe('test@example.com')

      // Test email property with null value (covers || '' branch on line 414)
      const emailNullProperty = {
        type: 'email',
        email: null
      }

      const plainText9e = (service as any).extractPlainTextFromProperty(emailNullProperty)
      expect(plainText9e).toBe('')

      // Test phone_number property
      const phoneProperty = {
        type: 'phone_number',
        phone_number: '+1234567890'
      }

      const plainText9f = (service as any).extractPlainTextFromProperty(phoneProperty)
      expect(plainText9f).toBe('+1234567890')

      // Test phone_number property with null value 
      const phoneNullProperty = {
        type: 'phone_number',
        phone_number: null
      }

      const plainText9g = (service as any).extractPlainTextFromProperty(phoneNullProperty)
      expect(plainText9g).toBe('')

      // Test unknown property type (covers line 416: default case)
      const unknownProperty = {
        type: 'unknown_property_type',
        unknown_property_type: { value: 'test' }
      }

      const plainText9 = (service as any).extractPlainTextFromProperty(unknownProperty)
      expect(plainText9).toBe('')
    })
  })

  describe('Error handling', () => {
    it('should handle fetch errors in fetchBlocksFromNotion', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      })

      await expect(service.fetchBlocksFromNotion('page-id')).rejects.toThrow('Notion API error: 500')
    })

    it('should handle network errors in fetchPageFromNotion', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network failed'))

      await expect(service.fetchPageFromNotion('page-id')).rejects.toThrow('Network failed')
    })
  })

})