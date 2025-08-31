import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NotionOrchestrator } from '../../../src/services/notion-orchestrator'
import { NotionAPIClient } from '../../../src/services/notion-api-client'
import { NotionDataManager } from '../../../src/services/notion-data-manager'

// Mock dependencies
vi.mock('../../../src/services/notion-api-client')
vi.mock('../../../src/services/notion-data-manager')

describe('NotionOrchestrator', () => {
  let orchestrator: NotionOrchestrator
  let mockEnv: Env
  let mockAPIClient: any
  let mockDataManager: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockEnv = {} as Env
    
    // Setup mock API client
    mockAPIClient = {
      fetchPage: vi.fn(),
      fetchBlocks: vi.fn(),
      fetchProperty: vi.fn(),
      searchPages: vi.fn()
    }
    ;(NotionAPIClient as any).mockImplementation(() => mockAPIClient)
    
    // Setup mock data manager
    mockDataManager = {
      savePage: vi.fn(),
      saveBlocks: vi.fn(),
      savePageProperties: vi.fn(),
      saveVectorRelation: vi.fn(),
      getPage: vi.fn(),
      getBlocks: vi.fn(),
      getAllPages: vi.fn(),
      extractPageTitle: vi.fn()
    }
    ;(NotionDataManager as any).mockImplementation(() => mockDataManager)
    
    orchestrator = new NotionOrchestrator(mockEnv, 'test-token')
  })

  describe('syncPage', () => {
    it('should sync a page with blocks and properties', async () => {
      const mockPage = {
        id: 'page-123',
        properties: {
          title: { type: 'title', title: [{ plain_text: 'Test' }] }
        }
      }
      const mockBlocks = [
        { id: 'block-1', type: 'paragraph' }
      ]

      mockAPIClient.fetchPage.mockResolvedValue(mockPage)
      mockAPIClient.fetchBlocks.mockResolvedValue(mockBlocks)

      const result = await orchestrator.syncPage('page-123')

      expect(result.page).toEqual(mockPage)
      expect(result.blocks).toEqual(mockBlocks)
      expect(mockDataManager.savePage).toHaveBeenCalledWith(mockPage)
      expect(mockDataManager.saveBlocks).toHaveBeenCalledWith('page-123', mockBlocks)
      expect(mockDataManager.savePageProperties).toHaveBeenCalledWith('page-123', mockPage.properties)
    })

    it('should handle missing page', async () => {
      mockAPIClient.fetchPage.mockResolvedValue(null)

      const result = await orchestrator.syncPage('nonexistent')

      expect(result.page).toBeNull()
      expect(result.blocks).toEqual([])
      expect(mockDataManager.savePage).not.toHaveBeenCalled()
    })

    it('should handle page without blocks', async () => {
      const mockPage = { id: 'page-123' }
      mockAPIClient.fetchPage.mockResolvedValue(mockPage)
      mockAPIClient.fetchBlocks.mockResolvedValue([])

      const result = await orchestrator.syncPage('page-123')

      expect(result.page).toEqual(mockPage)
      expect(result.blocks).toEqual([])
      expect(mockDataManager.saveBlocks).not.toHaveBeenCalled()
    })
  })

  describe('syncAllPages', () => {
    it('should sync multiple pages', async () => {
      const mockSearchResult = {
        results: [
          { id: 'page-1' },
          { id: 'page-2' },
          { id: 'page-3' }
        ],
        has_more: false,
        next_cursor: null
      }

      mockAPIClient.searchPages.mockResolvedValue(mockSearchResult)
      mockAPIClient.fetchPage.mockResolvedValue({ id: 'page' })
      mockAPIClient.fetchBlocks.mockResolvedValue([])

      const result = await orchestrator.syncAllPages()

      expect(result.synced).toBe(3)
      expect(result.has_more).toBe(false)
      expect(result.next_cursor).toBeNull()
      expect(mockAPIClient.fetchPage).toHaveBeenCalledTimes(3)
    })

    it('should handle sync errors gracefully', async () => {
      const mockSearchResult = {
        results: [
          { id: 'page-1' },
          { id: 'page-2' }
        ],
        has_more: false,
        next_cursor: null
      }

      mockAPIClient.searchPages.mockResolvedValue(mockSearchResult)
      mockAPIClient.fetchPage
        .mockResolvedValueOnce({ id: 'page-1' })
        .mockRejectedValueOnce(new Error('Sync failed'))
      mockAPIClient.fetchBlocks.mockResolvedValue([])

      const result = await orchestrator.syncAllPages()

      expect(result.synced).toBe(1) // Only one successful sync
    })
  })

  describe('getPage', () => {
    it('should return cached page when available', async () => {
      const cachedPage = { id: 'page-123', cached: true }
      mockDataManager.getPage.mockResolvedValue(cachedPage)

      const result = await orchestrator.getPage('page-123')

      expect(result).toEqual(cachedPage)
      expect(mockAPIClient.fetchPage).not.toHaveBeenCalled()
    })

    it('should fetch from Notion when not cached', async () => {
      const mockPage = { id: 'page-123' }
      mockDataManager.getPage
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockPage)
      mockAPIClient.fetchPage.mockResolvedValue(mockPage)
      mockAPIClient.fetchBlocks.mockResolvedValue([])

      const result = await orchestrator.getPage('page-123')

      expect(result).toEqual(mockPage)
      expect(mockAPIClient.fetchPage).toHaveBeenCalled()
    })

    it('should force refresh when requested', async () => {
      const cachedPage = { id: 'page-123', cached: true }
      const freshPage = { id: 'page-123', fresh: true }
      mockDataManager.getPage.mockResolvedValue(freshPage)
      mockAPIClient.fetchPage.mockResolvedValue(freshPage)
      mockAPIClient.fetchBlocks.mockResolvedValue([])

      const result = await orchestrator.getPage('page-123', true)

      expect(result).toEqual(freshPage)
      expect(mockAPIClient.fetchPage).toHaveBeenCalled()
    })
  })

  describe('getBlocks', () => {
    it('should return cached blocks when available', async () => {
      const cachedBlocks = [
        { id: 'block-1', cached: true },
        { id: 'block-2', cached: true }
      ]
      mockDataManager.getBlocks.mockResolvedValue(cachedBlocks)

      const result = await orchestrator.getBlocks('page-123')

      expect(result).toEqual(cachedBlocks)
      expect(mockAPIClient.fetchBlocks).not.toHaveBeenCalled()
    })

    it('should fetch from Notion when not cached', async () => {
      const freshBlocks = [{ id: 'block-1' }]
      mockDataManager.getBlocks
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(freshBlocks)
      mockAPIClient.fetchPage.mockResolvedValue({ id: 'page-123' })
      mockAPIClient.fetchBlocks.mockResolvedValue(freshBlocks)

      const result = await orchestrator.getBlocks('page-123')

      expect(result).toEqual(freshBlocks)
      expect(mockAPIClient.fetchBlocks).toHaveBeenCalled()
    })
  })

  describe('getAllPagesFromCache', () => {
    it('should get all pages from cache', async () => {
      const mockPages = [
        { id: 'page-1' },
        { id: 'page-2' }
      ]
      mockDataManager.getAllPages.mockResolvedValue(mockPages)

      const result = await orchestrator.getAllPagesFromCache({
        archived: false,
        limit: 10
      })

      expect(result).toEqual(mockPages)
      expect(mockDataManager.getAllPages).toHaveBeenCalledWith({
        archived: false,
        limit: 10
      })
    })
  })

  describe('createVectorRelation', () => {
    it('should create vector relation', async () => {
      await orchestrator.createVectorRelation(
        'page-123',
        'vec-123',
        'default',
        'page',
        'block-123'
      )

      expect(mockDataManager.saveVectorRelation).toHaveBeenCalledWith(
        'page-123',
        'vec-123',
        'default',
        'page',
        'block-123'
      )
    })
  })

  describe('extractPageTitle', () => {
    it('should extract page title', () => {
      const properties = { title: { type: 'title' } }
      mockDataManager.extractPageTitle.mockReturnValue('Test Title')

      const result = orchestrator.extractPageTitle(properties)

      expect(result).toBe('Test Title')
      expect(mockDataManager.extractPageTitle).toHaveBeenCalledWith(properties)
    })
  })
})