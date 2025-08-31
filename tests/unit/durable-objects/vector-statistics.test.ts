import { describe, it, expect, beforeEach, vi } from 'vitest'
import { VectorStatisticsManager, SearchHistoryEntry, VectorStatistics } from '../../../src/durable-objects/vector-statistics'

describe('VectorStatisticsManager', () => {
  let statsManager: VectorStatisticsManager
  let mockEnv: Env

  beforeEach(() => {
    mockEnv = {
      ENVIRONMENT: 'test'
    } as any
    
    statsManager = new VectorStatisticsManager(100, 10, mockEnv)
  })

  describe('trackSearch', () => {
    it('should track search history', async () => {
      const query = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2]
      const results: VectorizeMatches = {
        matches: [
          { id: 'vec1', score: 0.95 },
          { id: 'vec2', score: 0.85 }
        ] as VectorizeMatch[],
        count: 2
      }

      await statsManager.trackSearch(query, results, 'test-namespace', 123)

      const history = statsManager.getSearchHistory()
      expect(history).toHaveLength(1)
      expect(history[0].queryVector).toHaveLength(10) // Only first 10 dimensions
      expect(history[0].resultCount).toBe(2)
      expect(history[0].topScore).toBe(0.95)
      expect(history[0].namespace).toBe('test-namespace')
      expect(history[0].duration).toBe(123)
    })

    it('should limit search history size', async () => {
      const query = [0.1, 0.2, 0.3]
      const results: VectorizeMatches = {
        matches: [{ id: 'vec1', score: 0.9 }] as VectorizeMatch[],
        count: 1
      }

      // Create manager with small history size
      const smallStatsManager = new VectorStatisticsManager(5, 10, mockEnv)

      // Add 10 searches
      for (let i = 0; i < 10; i++) {
        await smallStatsManager.trackSearch(query, results)
      }

      const history = smallStatsManager.getSearchHistory()
      expect(history).toHaveLength(5) // Should be limited to 5
    })

    it('should update statistics on search', async () => {
      const query = [0.1, 0.2, 0.3]
      const results1: VectorizeMatches = {
        matches: [{ id: 'vec1', score: 0.8 }] as VectorizeMatch[],
        count: 1
      }
      const results2: VectorizeMatches = {
        matches: [{ id: 'vec2', score: 0.6 }] as VectorizeMatch[],
        count: 1
      }

      await statsManager.trackSearch(query, results1, 'ns1', 100)
      await statsManager.trackSearch(query, results2, 'ns1', 200)

      const stats = statsManager.getStatistics()
      expect(stats.totalSearches).toBe(2)
      expect(stats.averageSearchScore).toBe(0.7) // (0.8 + 0.6) / 2
      expect(stats.averageSearchDuration).toBe(150) // (100 + 200) / 2
      expect(stats.namespaceStats['ns1']).toBeDefined()
      expect(stats.namespaceStats['ns1'].searchCount).toBe(2)
    })
  })

  describe('trackVectorCreation', () => {
    it('should track vector creation', () => {
      const vector: VectorizeVector = {
        id: 'vec1',
        values: [0.1, 0.2, 0.3],
        namespace: 'test',
        metadata: { key: 'value' }
      }

      statsManager.trackVectorCreation(vector)

      const recentVectors = statsManager.getRecentVectors()
      expect(recentVectors).toHaveLength(1)
      expect(recentVectors[0]).toEqual(vector)

      const stats = statsManager.getStatistics()
      expect(stats.totalVectorsCreated).toBe(1)
      expect(stats.namespaceStats['test'].vectorCount).toBe(1)
    })

    it('should limit recent vectors', () => {
      // Create manager with small recent vectors limit
      const smallStatsManager = new VectorStatisticsManager(100, 3, mockEnv)

      // Add 5 vectors
      for (let i = 0; i < 5; i++) {
        const vector: VectorizeVector = {
          id: `vec${i}`,
          values: [0.1, 0.2, 0.3],
          namespace: 'test'
        }
        smallStatsManager.trackVectorCreation(vector)
      }

      const recentVectors = smallStatsManager.getRecentVectors()
      expect(recentVectors).toHaveLength(3) // Should be limited to 3
      expect(recentVectors[0].id).toBe('vec4') // Most recent first
    })
  })

  describe('trackVectorDeletion', () => {
    it('should track vector deletion', () => {
      // First add some vectors
      for (let i = 0; i < 5; i++) {
        const vector: VectorizeVector = {
          id: `vec${i}`,
          values: [0.1, 0.2, 0.3],
          namespace: 'test'
        }
        statsManager.trackVectorCreation(vector)
      }

      // Delete some vectors
      statsManager.trackVectorDeletion(['vec1', 'vec3'], 'test')

      const recentVectors = statsManager.getRecentVectors()
      expect(recentVectors).toHaveLength(3) // 5 - 2 = 3
      expect(recentVectors.find(v => v.id === 'vec1')).toBeUndefined()
      expect(recentVectors.find(v => v.id === 'vec3')).toBeUndefined()

      const stats = statsManager.getStatistics()
      expect(stats.totalVectorsDeleted).toBe(2)
      expect(stats.namespaceStats['test'].vectorCount).toBe(3) // 5 - 2 = 3
    })

    it('should handle deletion with non-existent namespace', () => {
      statsManager.trackVectorDeletion(['vec1', 'vec2'], 'non-existent')

      const stats = statsManager.getStatistics()
      expect(stats.totalVectorsDeleted).toBe(2)
      // Non-existent namespace should not crash
      expect(stats.namespaceStats['non-existent']).toBeUndefined()
    })
  })

  describe('getSearchHistory', () => {
    it('should return limited search history', async () => {
      const query = [0.1, 0.2, 0.3]
      const results: VectorizeMatches = {
        matches: [{ id: 'vec1', score: 0.9 }] as VectorizeMatch[],
        count: 1
      }

      // Add 10 searches
      for (let i = 0; i < 10; i++) {
        await statsManager.trackSearch(query, results)
      }

      const limitedHistory = statsManager.getSearchHistory(5)
      expect(limitedHistory).toHaveLength(5)
      
      const fullHistory = statsManager.getSearchHistory()
      expect(fullHistory).toHaveLength(10)
    })
  })

  describe('resetStatistics', () => {
    it('should reset statistics', async () => {
      // Add some data
      const query = [0.1, 0.2, 0.3]
      const results: VectorizeMatches = {
        matches: [{ id: 'vec1', score: 0.9 }] as VectorizeMatch[],
        count: 1
      }
      await statsManager.trackSearch(query, results)

      const vector: VectorizeVector = {
        id: 'vec1',
        values: [0.1, 0.2, 0.3],
        namespace: 'test'
      }
      statsManager.trackVectorCreation(vector)

      // Reset statistics
      statsManager.resetStatistics()

      const stats = statsManager.getStatistics()
      expect(stats.totalSearches).toBe(0)
      expect(stats.totalVectorsCreated).toBe(0)
      expect(stats.totalVectorsDeleted).toBe(0)
      expect(stats.averageSearchScore).toBe(0)
      expect(stats.averageSearchDuration).toBe(0)
      expect(Object.keys(stats.namespaceStats)).toHaveLength(0)
    })
  })

  describe('clearHistory', () => {
    it('should clear search history', async () => {
      const query = [0.1, 0.2, 0.3]
      const results: VectorizeMatches = {
        matches: [{ id: 'vec1', score: 0.9 }] as VectorizeMatch[],
        count: 1
      }

      // Add some searches
      for (let i = 0; i < 5; i++) {
        await statsManager.trackSearch(query, results)
      }

      // Clear history
      statsManager.clearHistory()

      const history = statsManager.getSearchHistory()
      expect(history).toHaveLength(0)
    })
  })

  describe('generateSummary', () => {
    it('should generate correct summary', async () => {
      // Add some search data
      const query = [0.1, 0.2, 0.3]
      const results: VectorizeMatches = {
        matches: [{ id: 'vec1', score: 0.9 }] as VectorizeMatch[],
        count: 1
      }
      
      for (let i = 0; i < 3; i++) {
        await statsManager.trackSearch(query, results, 'ns1', 100)
      }

      // Add some vectors
      for (let i = 0; i < 5; i++) {
        const vector: VectorizeVector = {
          id: `vec${i}`,
          values: [0.1, 0.2, 0.3],
          namespace: 'ns1'
        }
        statsManager.trackVectorCreation(vector)
      }

      // Delete some vectors
      statsManager.trackVectorDeletion(['vec1', 'vec2'], 'ns1')

      const summary = statsManager.generateSummary()

      expect(summary.searches.total).toBe(3)
      expect(summary.searches.recent).toBe(3) // All within 24 hours
      expect(summary.searches.averageScore).toBe(0.9)
      expect(summary.searches.averageDuration).toBe(100)

      expect(summary.vectors.created).toBe(5)
      expect(summary.vectors.deleted).toBe(2)
      expect(summary.vectors.recent).toBe(3) // 5 - 2 deleted

      expect(summary.namespaces).toHaveLength(1)
      expect(summary.namespaces[0].name).toBe('ns1')
      expect(summary.namespaces[0].searches).toBe(3)
      expect(summary.namespaces[0].vectors).toBe(3) // 5 - 2
    })

    it('should filter recent searches correctly', async () => {
      const query = [0.1, 0.2, 0.3]
      const results: VectorizeMatches = {
        matches: [{ id: 'vec1', score: 0.9 }] as VectorizeMatch[],
        count: 1
      }

      // Add an old search (mock old timestamp)
      const oldEntry: SearchHistoryEntry = {
        timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
        queryVector: query.slice(0, 10),
        resultCount: 1,
        topScore: 0.9,
        namespace: 'old'
      }
      
      // Directly manipulate history for testing
      ;(statsManager as any).searchHistory.push(oldEntry)
      ;(statsManager as any).statistics.totalSearches = 1

      // Add a recent search
      await statsManager.trackSearch(query, results, 'recent')

      const summary = statsManager.generateSummary()
      expect(summary.searches.total).toBe(2)
      expect(summary.searches.recent).toBe(1) // Only the recent one
    })
  })

  describe('state management', () => {
    it('should restore state correctly', () => {
      const state = {
        searchHistory: [
          {
            timestamp: new Date().toISOString(),
            queryVector: [0.1, 0.2],
            resultCount: 2,
            topScore: 0.95,
            namespace: 'restored'
          }
        ],
        recentVectors: [
          {
            id: 'restored-vec',
            values: [0.1, 0.2, 0.3],
            namespace: 'restored'
          }
        ] as VectorizeVector[],
        statistics: {
          totalSearches: 10,
          totalVectorsCreated: 20,
          totalVectorsDeleted: 5,
          averageSearchScore: 0.85,
          averageSearchDuration: 150,
          namespaceStats: {
            'restored': {
              searchCount: 10,
              vectorCount: 15
            }
          }
        }
      }

      statsManager.restore(state)

      const restoredState = statsManager.getState()
      expect(restoredState.searchHistory).toEqual(state.searchHistory)
      expect(restoredState.recentVectors).toEqual(state.recentVectors)
      expect(restoredState.statistics).toEqual(state.statistics)
    })

    it('should get current state', async () => {
      // Add some data
      const query = [0.1, 0.2, 0.3]
      const results: VectorizeMatches = {
        matches: [{ id: 'vec1', score: 0.9 }] as VectorizeMatch[],
        count: 1
      }
      await statsManager.trackSearch(query, results)

      const vector: VectorizeVector = {
        id: 'vec1',
        values: [0.1, 0.2, 0.3],
        namespace: 'test'
      }
      statsManager.trackVectorCreation(vector)

      const state = statsManager.getState()
      expect(state.searchHistory).toHaveLength(1)
      expect(state.recentVectors).toHaveLength(1)
      expect(state.statistics.totalSearches).toBe(1)
      expect(state.statistics.totalVectorsCreated).toBe(1)
    })
  })
})