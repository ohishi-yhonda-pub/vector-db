/**
 * ベクトル統計管理クラス
 * VectorManagerから分離した統計・履歴管理機能
 */

import { createLogger, Logger } from '../middleware/logging'

/**
 * 検索履歴エントリー
 */
export interface SearchHistoryEntry {
  timestamp: string
  queryVector: number[]
  resultCount: number
  topScore: number
  namespace?: string
  duration?: number
}

/**
 * ベクトル統計
 */
export interface VectorStatistics {
  totalSearches: number
  totalVectorsCreated: number
  totalVectorsDeleted: number
  averageSearchScore: number
  averageSearchDuration: number
  namespaceStats: Record<string, {
    searchCount: number
    vectorCount: number
  }>
}

/**
 * 最近のベクトル情報
 */
export interface RecentVector {
  id: string
  namespace: string
  createdAt: string
  metadata?: Record<string, any>
  preview?: string // テキストの最初の100文字
}

/**
 * ベクトル統計マネージャー
 */
export class VectorStatisticsManager {
  private searchHistory: SearchHistoryEntry[] = []
  private recentVectors: VectorizeVector[] = []
  private statistics: VectorStatistics = {
    totalSearches: 0,
    totalVectorsCreated: 0,
    totalVectorsDeleted: 0,
    averageSearchScore: 0,
    averageSearchDuration: 0,
    namespaceStats: {}
  }
  private logger: Logger

  constructor(
    private readonly maxHistorySize: number = 100,
    private readonly maxRecentVectors: number = 10,
    env?: Env
  ) {
    this.logger = createLogger('VectorStatistics', env)
  }

  /**
   * 検索履歴を追加
   */
  async trackSearch(
    query: number[],
    results: VectorizeMatches,
    namespace?: string,
    duration?: number
  ): Promise<void> {
    const entry: SearchHistoryEntry = {
      timestamp: new Date().toISOString(),
      queryVector: query.slice(0, 10), // 最初の10次元のみ保存
      resultCount: results.matches.length,
      topScore: results.matches[0]?.score || 0,
      namespace,
      duration
    }

    this.searchHistory.push(entry)

    // 最大履歴数を超えたら古いものを削除
    if (this.searchHistory.length > this.maxHistorySize) {
      this.searchHistory.shift()
    }

    // 統計を更新
    this.updateStatistics(entry)

    this.logger.debug('Search tracked', {
      resultCount: entry.resultCount,
      topScore: entry.topScore,
      namespace
    })
  }

  /**
   * ベクトル作成を追跡
   */
  trackVectorCreation(vector: VectorizeVector): void {
    // 最近のベクトルリストに追加
    this.recentVectors.unshift(vector)
    if (this.recentVectors.length > this.maxRecentVectors) {
      this.recentVectors.pop()
    }

    // 統計を更新
    this.statistics.totalVectorsCreated++
    
    const namespace = vector.namespace || 'default'
    if (!this.statistics.namespaceStats[namespace]) {
      this.statistics.namespaceStats[namespace] = {
        searchCount: 0,
        vectorCount: 0
      }
    }
    this.statistics.namespaceStats[namespace].vectorCount++

    this.logger.debug('Vector creation tracked', {
      vectorId: vector.id,
      namespace
    })
  }

  /**
   * ベクトル削除を追跡
   */
  trackVectorDeletion(vectorIds: string[], namespace?: string): void {
    // 最近のベクトルリストから削除
    const idsSet = new Set(vectorIds)
    this.recentVectors = this.recentVectors.filter(v => !idsSet.has(v.id))

    // 統計を更新
    this.statistics.totalVectorsDeleted += vectorIds.length

    if (namespace && this.statistics.namespaceStats[namespace]) {
      this.statistics.namespaceStats[namespace].vectorCount = 
        Math.max(0, this.statistics.namespaceStats[namespace].vectorCount - vectorIds.length)
    }

    this.logger.debug('Vector deletion tracked', {
      count: vectorIds.length,
      namespace
    })
  }

  /**
   * 統計を更新
   */
  private updateStatistics(entry: SearchHistoryEntry): void {
    this.statistics.totalSearches++

    // 平均スコアを更新
    const totalScore = this.statistics.averageSearchScore * (this.statistics.totalSearches - 1)
    this.statistics.averageSearchScore = (totalScore + entry.topScore) / this.statistics.totalSearches

    // 平均時間を更新
    if (entry.duration) {
      const totalDuration = this.statistics.averageSearchDuration * (this.statistics.totalSearches - 1)
      this.statistics.averageSearchDuration = (totalDuration + entry.duration) / this.statistics.totalSearches
    }

    // namespace統計を更新
    const namespace = entry.namespace || 'default'
    if (!this.statistics.namespaceStats[namespace]) {
      this.statistics.namespaceStats[namespace] = {
        searchCount: 0,
        vectorCount: 0
      }
    }
    this.statistics.namespaceStats[namespace].searchCount++
  }

  /**
   * 検索履歴を取得
   */
  getSearchHistory(limit?: number): SearchHistoryEntry[] {
    if (limit) {
      return this.searchHistory.slice(-limit)
    }
    return [...this.searchHistory]
  }

  /**
   * 最近のベクトルを取得
   */
  getRecentVectors(): VectorizeVector[] {
    return [...this.recentVectors]
  }

  /**
   * 統計情報を取得
   */
  getStatistics(): VectorStatistics {
    return { ...this.statistics }
  }

  /**
   * 統計をリセット
   */
  resetStatistics(): void {
    this.statistics = {
      totalSearches: 0,
      totalVectorsCreated: 0,
      totalVectorsDeleted: 0,
      averageSearchScore: 0,
      averageSearchDuration: 0,
      namespaceStats: {}
    }
    this.logger.info('Statistics reset')
  }

  /**
   * 履歴をクリア
   */
  clearHistory(): void {
    this.searchHistory = []
    this.logger.info('Search history cleared')
  }

  /**
   * 統計サマリーを生成
   */
  generateSummary(): {
    searches: {
      total: number
      recent: number
      averageScore: number
      averageDuration: number
    }
    vectors: {
      created: number
      deleted: number
      recent: number
    }
    namespaces: Array<{
      name: string
      searches: number
      vectors: number
    }>
  } {
    const recentSearches = this.searchHistory.filter(
      h => new Date(h.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    ).length

    return {
      searches: {
        total: this.statistics.totalSearches,
        recent: recentSearches,
        averageScore: this.statistics.averageSearchScore,
        averageDuration: this.statistics.averageSearchDuration
      },
      vectors: {
        created: this.statistics.totalVectorsCreated,
        deleted: this.statistics.totalVectorsDeleted,
        recent: this.recentVectors.length
      },
      namespaces: Object.entries(this.statistics.namespaceStats).map(([name, stats]) => ({
        name,
        searches: stats.searchCount,
        vectors: stats.vectorCount
      }))
    }
  }

  /**
   * 状態を復元
   */
  restore(state: {
    searchHistory: SearchHistoryEntry[]
    recentVectors: VectorizeVector[]
    statistics: VectorStatistics
  }): void {
    this.searchHistory = state.searchHistory || []
    this.recentVectors = state.recentVectors || []
    this.statistics = state.statistics || this.statistics
    
    this.logger.info('State restored', {
      historySize: this.searchHistory.length,
      recentVectorsCount: this.recentVectors.length
    })
  }

  /**
   * 状態を取得
   */
  getState(): {
    searchHistory: SearchHistoryEntry[]
    recentVectors: VectorizeVector[]
    statistics: VectorStatistics
  } {
    return {
      searchHistory: this.searchHistory,
      recentVectors: this.recentVectors,
      statistics: this.statistics
    }
  }
}