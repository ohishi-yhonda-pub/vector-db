/**
 * 検索サービス共通処理
 */

import { VectorizeService } from '../../../services'
import { type SearchMatch } from '../../../schemas/search.schema'
import { type VectorizeMatch } from '../../../schemas/cloudflare.schema'
import { AppError, ErrorCodes } from '../../../utils/error-handler'

/**
 * 検索サービスクラス
 */
export class SearchService {
  private vectorizeService: VectorizeService

  constructor(private env: Env) {
    this.vectorizeService = new VectorizeService(env)
  }

  /**
   * テキストをベクトル化
   */
  async embedText(text: string): Promise<number[]> {
    try {
      const aiResult = await this.env.AI.run(
        this.env.DEFAULT_EMBEDDING_MODEL as keyof AiModels,
        { text }
      )

      if (!('data' in aiResult) || !aiResult.data || aiResult.data.length === 0) {
        throw new AppError(
          ErrorCodes.EMBEDDING_GENERATION_ERROR,
          'Failed to generate embedding for query',
          500
        )
      }

      return aiResult.data[0]
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      throw new AppError(
        ErrorCodes.EMBEDDING_GENERATION_ERROR,
        `Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        error
      )
    }
  }

  /**
   * ベクトル検索実行
   */
  async searchByVector(
    embedding: number[],
    options: {
      topK?: number
      namespace?: string
      filter?: Record<string, any>
      returnMetadata?: boolean
    } = {}
  ): Promise<{ matches: VectorizeMatch[] }> {
    try {
      return await this.vectorizeService.query(embedding, options)
    } catch (error) {
      throw new AppError(
        ErrorCodes.SEARCH_ERROR,
        `検索中にエラーが発生しました`,
        500,
        error
      )
    }
  }

  /**
   * テキストクエリで検索
   */
  async searchByText(
    query: string,
    options: {
      topK?: number
      namespace?: string
      filter?: Record<string, any>
      includeMetadata?: boolean
      includeValues?: boolean
    } = {}
  ): Promise<SearchMatch[]> {
    // テキストをベクトル化
    const embedding = await this.embedText(query)
    
    // ベクトル検索実行
    const searchResults = await this.searchByVector(embedding, {
      topK: options.topK,
      namespace: options.namespace,
      filter: options.filter,
      returnMetadata: options.includeMetadata
    })
    
    // 結果を整形
    return this.formatSearchResults(
      searchResults.matches, 
      options.includeMetadata,
      options.includeValues
    )
  }

  /**
   * 類似ベクトル検索
   */
  async searchSimilar(
    vectorId: string,
    options: {
      topK?: number
      namespace?: string
      excludeSelf?: boolean
    } = {}
  ): Promise<SearchMatch[]> {
    try {
      const searchResults = await this.vectorizeService.findSimilar(
        vectorId,
        {
          topK: options.topK,
          namespace: options.namespace,
          excludeSelf: options.excludeSelf,
          returnMetadata: true
        }
      )
      
      return this.formatSearchResults(searchResults.matches, true, false)
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new AppError(
          ErrorCodes.VECTOR_NOT_FOUND,
          `Vector not found: ${vectorId}`,
          404,
          error
        )
      }
      throw new AppError(
        ErrorCodes.SEARCH_ERROR,
        `類似検索中にエラーが発生しました`,
        500,
        error
      )
    }
  }

  /**
   * 検索結果の整形
   */
  private formatSearchResults(
    matches: VectorizeMatch[],
    includeMetadata: boolean = true,
    includeValues: boolean = false
  ): SearchMatch[] {
    return matches.map((match: VectorizeMatch) => {
      const result: SearchMatch = {
        id: match.id,
        score: match.score
      }
      
      if (includeMetadata && match.metadata) {
        result.metadata = match.metadata
      }
      
      if (includeValues && match.values) {
        result.values = match.values
      }
      
      return result
    })
  }

  /**
   * 検索統計情報の取得
   */
  async getSearchStats(): Promise<{
    totalVectors: number
    namespaces: string[]
    lastSearchTime?: number
  }> {
    // 実装は将来的に追加
    return {
      totalVectors: 0,
      namespaces: [],
      lastSearchTime: undefined
    }
  }
}