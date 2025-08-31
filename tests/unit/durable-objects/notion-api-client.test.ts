import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotionApiClient, type NotionApiConfig } from '../../../src/durable-objects/notion-api-client'
import { NotionService } from '../../../src/services/notion.service'
import { AppError, ErrorCodes } from '../../../src/utils/error-handler'

// Mock NotionService
vi.mock('../../../src/services/notion.service', () => ({
  NotionService: vi.fn().mockImplementation(() => ({
    getPage: vi.fn(),
    getBlocks: vi.fn(),
    search: vi.fn(),
    queryDatabase: vi.fn()
  }))
}))

describe('NotionApiClient', () => {
  let mockEnv: Env
  let mockNotionService: any
  let client: NotionApiClient
  let config: NotionApiConfig

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockEnv = {} as Env
    
    mockNotionService = {
      getPage: vi.fn(),
      getBlocks: vi.fn(),
      search: vi.fn(),
      queryDatabase: vi.fn()
    }
    
    ;(NotionService as any).mockImplementation(() => mockNotionService)
    
    config = {
      apiKey: 'test-api-key',
      defaultNamespace: 'test-namespace',
      includeBlocksByDefault: true,
      includePropertiesByDefault: true
    }
    
    client = new NotionApiClient(mockEnv, config)
  })

  describe('constructor', () => {
    it('should create client with valid config', () => {
      expect(client).toBeInstanceOf(NotionApiClient)
      expect(NotionService).toHaveBeenCalledWith(mockEnv, 'test-api-key')
    })

    it('should use default values when not provided', () => {
      const minimalConfig = { apiKey: 'test-key' }
      const clientWithDefaults = new NotionApiClient(mockEnv, minimalConfig)
      
      expect(clientWithDefaults).toBeInstanceOf(NotionApiClient)
      expect(NotionService).toHaveBeenCalledWith(mockEnv, 'test-key')
    })

    it('should throw error when API key is missing', () => {
      const invalidConfig = { apiKey: '' }
      
      expect(() => new NotionApiClient(mockEnv, invalidConfig)).toThrow(AppError)
      expect(() => new NotionApiClient(mockEnv, invalidConfig)).toThrow('Notion API key is required')
    })

    it('should throw error when API key is undefined', () => {
      const invalidConfig = { apiKey: undefined as any }
      
      expect(() => new NotionApiClient(mockEnv, invalidConfig)).toThrow(AppError)
    })
  })

  describe('fetchPage', () => {
    it('should fetch page successfully', async () => {
      const mockPage = {
        id: 'page-123',
        title: 'Test Page',
        properties: { title: 'Test' }
      }
      
      mockNotionService.getPage.mockResolvedValue(mockPage)
      
      const result = await client.fetchPage('page-123')
      
      expect(mockNotionService.getPage).toHaveBeenCalledWith('page-123')
      expect(result).toEqual(mockPage)
    })

    it('should return null for 404 errors', async () => {
      const error = new Error('Not found')
      ;(error as any).status = 404
      
      mockNotionService.getPage.mockRejectedValue(error)
      
      const result = await client.fetchPage('nonexistent-page')
      
      expect(result).toBeNull()
    })

    it('should throw AppError for other errors', async () => {
      const error = new Error('API error')
      mockNotionService.getPage.mockRejectedValue(error)
      
      await expect(client.fetchPage('page-123')).rejects.toThrow(AppError)
      await expect(client.fetchPage('page-123')).rejects.toThrow('Failed to fetch Notion page: API error')
    })

    it('should handle errors without status property', async () => {
      const error = new Error('Network error')
      mockNotionService.getPage.mockRejectedValue(error)
      
      await expect(client.fetchPage('page-123')).rejects.toThrow(AppError)
    })
  })

  describe('fetchBlocks', () => {
    it('should fetch blocks successfully', async () => {
      const mockBlocks = [
        { id: 'block-1', type: 'paragraph' },
        { id: 'block-2', type: 'heading_1' }
      ]
      
      mockNotionService.getBlocks.mockResolvedValue(mockBlocks)
      
      const result = await client.fetchBlocks('page-123')
      
      expect(mockNotionService.getBlocks).toHaveBeenCalledWith('page-123')
      expect(result).toEqual(mockBlocks)
    })

    it('should return empty array when blocks is null', async () => {
      mockNotionService.getBlocks.mockResolvedValue(null)
      
      const result = await client.fetchBlocks('page-123')
      
      expect(result).toEqual([])
    })

    it('should return empty array when blocks is undefined', async () => {
      mockNotionService.getBlocks.mockResolvedValue(undefined)
      
      const result = await client.fetchBlocks('page-123')
      
      expect(result).toEqual([])
    })

    it('should throw AppError on service error', async () => {
      const error = new Error('Blocks fetch failed')
      mockNotionService.getBlocks.mockRejectedValue(error)
      
      await expect(client.fetchBlocks('page-123')).rejects.toThrow(AppError)
      await expect(client.fetchBlocks('page-123')).rejects.toThrow('Failed to fetch Notion blocks: Blocks fetch failed')
    })
  })

  describe('fetchProperties', () => {
    it('should fetch properties successfully', async () => {
      const mockPage = {
        id: 'page-123',
        properties: {
          title: { title: [{ text: { content: 'Test Title' } }] },
          status: { select: { name: 'Published' } }
        }
      }
      
      mockNotionService.getPage.mockResolvedValue(mockPage)
      
      const result = await client.fetchProperties('page-123')
      
      expect(mockNotionService.getPage).toHaveBeenCalledWith('page-123')
      expect(result).toEqual(mockPage.properties)
    })

    it('should return empty object when page has no properties', async () => {
      const mockPage = { id: 'page-123' }
      mockNotionService.getPage.mockResolvedValue(mockPage)
      
      const result = await client.fetchProperties('page-123')
      
      expect(result).toEqual({})
    })

    it('should return empty object when page is null', async () => {
      mockNotionService.getPage.mockResolvedValue(null)
      
      const result = await client.fetchProperties('page-123')
      
      expect(result).toEqual({})
    })

    it('should throw AppError on service error', async () => {
      const error = new Error('Properties fetch failed')
      mockNotionService.getPage.mockRejectedValue(error)
      
      await expect(client.fetchProperties('page-123')).rejects.toThrow(AppError)
      await expect(client.fetchProperties('page-123')).rejects.toThrow('Failed to fetch Notion properties: Properties fetch failed')
    })
  })

  describe('searchPages', () => {
    it('should search pages successfully', async () => {
      const mockResults = {
        results: [
          { id: 'page-1', title: 'First Page' },
          { id: 'page-2', title: 'Second Page' }
        ]
      }
      
      mockNotionService.search.mockResolvedValue(mockResults)
      
      const result = await client.searchPages('test query')
      
      expect(mockNotionService.search).toHaveBeenCalledWith({
        query: 'test query',
        filter: { property: 'object', value: 'page' },
        page_size: 20
      })
      expect(result).toEqual(mockResults.results)
    })

    it('should handle empty search results', async () => {
      const mockResults = { results: [] }
      mockNotionService.search.mockResolvedValue(mockResults)
      
      const result = await client.searchPages('nonexistent')
      
      expect(result).toEqual([])
    })

    it('should throw AppError on search error', async () => {
      const error = new Error('Search failed')
      mockNotionService.search.mockRejectedValue(error)
      
      await expect(client.searchPages('test query')).rejects.toThrow(AppError)
      await expect(client.searchPages('test query')).rejects.toThrow('Failed to search Notion pages: Search failed')
    })

    it('should handle search with empty query', async () => {
      const mockResults = { results: [] }
      mockNotionService.search.mockResolvedValue(mockResults)
      
      const result = await client.searchPages('')
      
      expect(mockNotionService.search).toHaveBeenCalledWith({
        query: '',
        filter: { property: 'object', value: 'page' },
        page_size: 20
      })
      expect(result).toEqual([])
    })
  })

  describe('fetchDatabasePages', () => {
    it('should fetch database pages successfully', async () => {
      const mockResponse = {
        results: [
          { id: 'page-1', properties: {} },
          { id: 'page-2', properties: {} }
        ],
        has_more: false,
        next_cursor: null
      }
      
      mockNotionService.queryDatabase.mockResolvedValue(mockResponse)
      
      const result = await client.fetchDatabasePages('database-123')
      
      expect(mockNotionService.queryDatabase).toHaveBeenCalledWith('database-123', {
        page_size: 100,
        start_cursor: undefined
      })
      expect(result).toEqual({
        pages: mockResponse.results,
        hasMore: false,
        nextCursor: undefined
      })
    })

    it('should handle pagination with options', async () => {
      const mockResponse = {
        results: [{ id: 'page-1', properties: {} }],
        has_more: true,
        next_cursor: 'next-cursor-123'
      }
      
      mockNotionService.queryDatabase.mockResolvedValue(mockResponse)
      
      const result = await client.fetchDatabasePages('database-123', {
        limit: 50,
        startCursor: 'start-cursor-456'
      })
      
      expect(mockNotionService.queryDatabase).toHaveBeenCalledWith('database-123', {
        page_size: 50,
        start_cursor: 'start-cursor-456'
      })
      expect(result).toEqual({
        pages: mockResponse.results,
        hasMore: true,
        nextCursor: 'next-cursor-123'
      })
    })

    it('should handle null next_cursor', async () => {
      const mockResponse = {
        results: [],
        has_more: false,
        next_cursor: null
      }
      
      mockNotionService.queryDatabase.mockResolvedValue(mockResponse)
      
      const result = await client.fetchDatabasePages('database-123')
      
      expect(result.nextCursor).toBeUndefined()
    })

    it('should throw AppError on database query failure', async () => {
      const error = new Error('Database query failed')
      mockNotionService.queryDatabase.mockRejectedValue(error)
      
      await expect(client.fetchDatabasePages('database-123')).rejects.toThrow(AppError)
      await expect(client.fetchDatabasePages('database-123')).rejects.toThrow('Failed to fetch database pages: Database query failed')
    })
  })

  describe('getDefaultOptions', () => {
    it('should return default options from config', () => {
      const result = client.getDefaultOptions()
      
      expect(result).toEqual({
        namespace: 'test-namespace',
        includeBlocks: true,
        includeProperties: true
      })
    })

    it('should use default values when config options not specified', () => {
      const minimalConfig = { apiKey: 'test-key' }
      const clientWithDefaults = new NotionApiClient(mockEnv, minimalConfig)
      
      const result = clientWithDefaults.getDefaultOptions()
      
      expect(result).toEqual({
        namespace: 'notion',
        includeBlocks: true,
        includeProperties: true
      })
    })
  })
})