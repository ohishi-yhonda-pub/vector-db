/**
 * チャンク処理ワークフロー
 * FileProcessingWorkflowから分離したチャンク処理機能
 */

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers'
import { AppError, ErrorCodes } from '../utils/error-handler'
import { TextChunk, ChunkProcessingParams, ChunkProcessingResult } from './types'

// Re-export for backward compatibility
export type { TextChunk, ChunkProcessingParams, ChunkProcessingResult }

/**
 * チャンク処理ワークフロー
 */
export class ChunkProcessor extends WorkflowEntrypoint<Env, ChunkProcessingParams> {
  private readonly DEFAULT_CHUNK_SIZE = 1000
  private readonly DEFAULT_CHUNK_OVERLAP = 100
  private readonly MIN_CHUNK_SIZE = 100
  private readonly MAX_CHUNK_SIZE = 5000

  /**
   * ワークフローエントリーポイント
   */
  async run(event: WorkflowEvent<ChunkProcessingParams>, step: WorkflowStep): Promise<ChunkProcessingResult> {
    const params = event.payload
    return this.processChunks(params, step)
  }

  /**
   * チャンク処理実行
   */
  private async processChunks(
    params: ChunkProcessingParams,
    step: WorkflowStep
  ): Promise<ChunkProcessingResult> {
    console.log('Starting chunk processing', {
      textLength: params.text.length,
      fileName: params.fileName,
      namespace: params.namespace
    })

    // パラメータの検証
    const chunkSize = this.validateChunkSize(params.chunkSize)
    const chunkOverlap = this.validateChunkOverlap(params.chunkOverlap, chunkSize)

    // テキストをチャンクに分割
    const chunks = await step.do('split-into-chunks', async () => {
      return this.splitTextIntoChunks(params.text, chunkSize, chunkOverlap, params)
    })

    if (!chunks || chunks.length === 0) {
      console.warn('No chunks created from text')
    }

    // チャンクのメタデータを追加
    const finalChunks = await step.do('enrich-chunks', async () => {
      return this.enrichChunks(chunks || [], params)
    })

    // 統計情報を計算
    const stats = this.calculateStatistics(finalChunks)

    return {
      chunks: finalChunks,
      totalChunks: finalChunks.length,
      averageChunkSize: stats.averageSize
    }
  }

  /**
   * チャンクサイズを検証
   */
  private validateChunkSize(chunkSize?: number): number {
    if (!chunkSize) {
      return this.DEFAULT_CHUNK_SIZE
    }
    
    if (chunkSize < this.MIN_CHUNK_SIZE) {
      console.warn(`Chunk size too small, using minimum: ${this.MIN_CHUNK_SIZE}`)
      return this.MIN_CHUNK_SIZE
    }
    
    if (chunkSize > this.MAX_CHUNK_SIZE) {
      console.warn(`Chunk size too large, using maximum: ${this.MAX_CHUNK_SIZE}`)
      return this.MAX_CHUNK_SIZE
    }
    
    return chunkSize
  }

  /**
   * チャンクオーバーラップを検証
   */
  private validateChunkOverlap(chunkOverlap?: number, chunkSize: number): number {
    if (!chunkOverlap) {
      return this.DEFAULT_CHUNK_OVERLAP
    }
    
    const maxOverlap = Math.floor(chunkSize / 2)
    if (chunkOverlap > maxOverlap) {
      console.warn(`Chunk overlap too large, using: ${maxOverlap}`)
      return maxOverlap
    }
    
    if (chunkOverlap < 0) {
      console.warn('Negative chunk overlap, using 0')
      return 0
    }
    
    return chunkOverlap
  }

  /**
   * テキストをチャンクに分割
   */
  private async splitTextIntoChunks(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
    params: ChunkProcessingParams
  ): Promise<TextChunk[]> {
    const chunks: TextChunk[] = []
    const cleanText = this.cleanText(text)
    
    if (!cleanText || cleanText.length === 0) {
      console.warn('No text to chunk')
      return []
    }

    let startOffset = 0
    let chunkIndex = 0

    while (startOffset < cleanText.length) {
      // チャンクの終了位置を計算
      const endOffset = Math.min(startOffset + chunkSize, cleanText.length)
      
      // 単語の境界で分割を調整
      const adjustedEndOffset = this.findWordBoundary(cleanText, endOffset)
      
      // チャンクを作成
      const chunkText = cleanText.substring(startOffset, adjustedEndOffset)
      
      if (chunkText.trim().length > 0) {
        chunks.push({
          id: this.generateChunkId(params.fileName, chunkIndex),
          text: chunkText,
          index: chunkIndex,
          startOffset,
          endOffset: adjustedEndOffset,
          metadata: {
            fileName: params.fileName,
            namespace: params.namespace,
            ...params.metadata
          }
        })
        chunkIndex++
      }

      // 次のチャンクの開始位置を計算（オーバーラップを考慮）
      startOffset = adjustedEndOffset - chunkOverlap
      
      // 無限ループを防ぐ - startOffsetが進まない場合も考慮
      if (startOffset >= adjustedEndOffset || adjustedEndOffset >= cleanText.length) {
        break
      }
    }

    console.log(`Split text into ${chunks.length} chunks`)
    return chunks
  }

  /**
   * テキストをクリーンアップ
   */
  private cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  /**
   * 単語の境界を見つける
   */
  private findWordBoundary(text: string, position: number): number {
    if (position >= text.length) {
      return text.length
    }

    // 日本語の場合は句読点で区切る
    const punctuations = ['。', '！', '？', '\n', '.', '!', '?']
    
    // 近くの句読点を探す
    for (let i = position; i > Math.max(0, position - 50); i--) {
      if (punctuations.includes(text[i])) {
        return i + 1
      }
    }

    // スペースで区切る（英語の場合）
    for (let i = position; i > Math.max(0, position - 20); i--) {
      if (text[i] === ' ') {
        return i + 1
      }
    }

    // 見つからない場合は元の位置を返す
    return position
  }

  /**
   * チャンクIDを生成
   */
  private generateChunkId(fileName: string, index: number): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 7)
    return `chunk_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}_${index}_${timestamp}_${random}`
  }

  /**
   * チャンクを豊富化
   */
  private async enrichChunks(
    chunks: TextChunk[],
    params: ChunkProcessingParams
  ): Promise<TextChunk[]> {
    return chunks.map(chunk => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        processedAt: new Date().toISOString(),
        chunkCount: chunks.length,
        position: `${chunk.index + 1}/${chunks.length}`
      }
    }))
  }

  /**
   * 統計情報を計算
   */
  private calculateStatistics(chunks: TextChunk[]): {
    averageSize: number
    minSize: number
    maxSize: number
  } {
    if (chunks.length === 0) {
      return { averageSize: 0, minSize: 0, maxSize: 0 }
    }

    const sizes = chunks.map(c => c.text.length)
    const total = sizes.reduce((sum, size) => sum + size, 0)
    
    return {
      averageSize: Math.round(total / chunks.length),
      minSize: Math.min(...sizes),
      maxSize: Math.max(...sizes)
    }
  }
}