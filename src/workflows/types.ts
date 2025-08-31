/**
 * ワークフロー共通型定義
 */

/**
 * テキストチャンク
 */
export interface TextChunk {
  id: string
  text: string
  index: number
  startOffset: number
  endOffset: number
  metadata?: Record<string, any>
}

/**
 * チャンク処理パラメータ
 */
export interface ChunkProcessingParams {
  text: string
  fileName: string
  namespace?: string
  metadata?: Record<string, any>
  chunkSize?: number
  chunkOverlap?: number
}

/**
 * チャンク処理結果
 */
export interface ChunkProcessingResult {
  chunks: TextChunk[]
  totalChunks: number
  averageChunkSize: number
}