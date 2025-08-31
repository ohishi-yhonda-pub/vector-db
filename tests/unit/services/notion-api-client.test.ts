import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NotionAPIClient } from '../../../src/services/notion-api-client'

// Mock fetch
global.fetch = vi.fn()

describe('NotionAPIClient', () => {
  let client: NotionAPIClient
  const mockToken = 'test-token-123'

  beforeEach(() => {
    vi.clearAllMocks()
    client = new NotionAPIClient(mockToken)
  })

  describe('fetchPage', () => {
    it('should fetch a page successfully', async () => {
      const mockPage = {
        id: 'page-123',
        object: 'page',
        created_time: '2024-01-01T00:00:00.000Z',
        last_edited_time: '2024-01-01T00:00:00.000Z',
        created_by: { id: 'user-1' },
        last_edited_by: { id: 'user-1' },
        archived: false,
        in_trash: false,
        properties: {},
        parent: { type: 'workspace' },
        url: 'https://notion.so/page-123'
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPage
      })

      const result = await client.fetchPage('page-123')

      expect(result).toEqual(mockPage)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/pages/page-123',
        {
          headers: {
            'Authorization': 'Bearer test-token-123',
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          }
        }
      )
    })

    it('should return null for 404 errors', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404
      })

      const result = await client.fetchPage('nonexistent')

      expect(result).toBeNull()
    })

    it('should throw error for other API errors', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500
      })

      await expect(client.fetchPage('page-123')).rejects.toThrow('Notion API error: 500')
    })
  })

  describe('fetchBlocks', () => {
    it('should fetch blocks with pagination', async () => {
      const mockBlocks1 = [
        { id: 'block-1', type: 'paragraph', object: 'block' },
        { id: 'block-2', type: 'heading_1', object: 'block' }
      ]
      const mockBlocks2 = [
        { id: 'block-3', type: 'paragraph', object: 'block' }
      ]

      ;(global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: mockBlocks1,
            has_more: true,
            next_cursor: 'cursor-123'
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: mockBlocks2,
            has_more: false,
            next_cursor: null
          })
        })

      const result = await client.fetchBlocks('page-123')

      expect(result).toEqual([...mockBlocks1, ...mockBlocks2])
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should handle empty blocks', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [],
          has_more: false,
          next_cursor: null
        })
      })

      const result = await client.fetchBlocks('page-123')

      expect(result).toEqual([])
    })

    it('should throw and log error when fetchBlocks fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500
      })

      await expect(client.fetchBlocks('page-123')).rejects.toThrow('Notion API error: 500')
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch blocks from Notion:', expect.any(Error))
      
      consoleErrorSpy.mockRestore()
    })
  })

  describe('fetchProperty', () => {
    it('should fetch a property successfully', async () => {
      const mockProperty = {
        id: 'prop-123',
        type: 'title',
        title: [{ plain_text: 'Test Title' }]
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProperty
      })

      const result = await client.fetchProperty('page-123', 'prop-123')

      expect(result).toEqual(mockProperty)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/pages/page-123/properties/prop-123',
        {
          headers: {
            'Authorization': 'Bearer test-token-123',
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          }
        }
      )
    })

    it('should throw and log error when fetchProperty fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403
      })

      await expect(client.fetchProperty('page-123', 'prop-123')).rejects.toThrow('Notion API error: 403')
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to fetch property from Notion:', expect.any(Error))
      
      consoleErrorSpy.mockRestore()
    })
  })

  describe('searchPages', () => {
    it('should search pages with filter', async () => {
      const mockPages = [
        { id: 'page-1', object: 'page' },
        { id: 'page-2', object: 'page' },
        { id: 'db-1', object: 'database' }
      ]

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: mockPages,
          has_more: false,
          next_cursor: null
        })
      })

      const result = await client.searchPages({
        filter: {
          property: 'status',
          value: 'published'
        }
      })

      expect(result.results).toHaveLength(2) // Only pages, not databases
      expect(result.results[0].id).toBe('page-1')
      expect(result.results[1].id).toBe('page-2')
    })

    it('should handle pagination cursor', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [],
          has_more: true,
          next_cursor: 'next-cursor'
        })
      })

      const result = await client.searchPages({
        start_cursor: 'start-cursor',
        page_size: 50
      })

      expect(result.next_cursor).toBe('next-cursor')
      expect(result.has_more).toBe(true)
      
      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body)
      expect(callBody.start_cursor).toBe('start-cursor')
      expect(callBody.page_size).toBe(50)
    })

    it('should throw and log error when searchPages fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400
      })

      await expect(client.searchPages()).rejects.toThrow('Notion API error: 400')
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to search pages from Notion:', expect.any(Error))
      
      consoleErrorSpy.mockRestore()
    })
  })
})