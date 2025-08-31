/**
 * 検索バリデーション共通処理
 */

import { z } from '@hono/zod-openapi'

/**
 * 共通検索パラメータスキーマ
 */
export const BaseSearchParamsSchema = z.object({
  topK: z.number()
    .int()
    .min(1)
    .max(100)
    .default(10),
  namespace: z.string()
    .optional()
})

/**
 * テキスト検索パラメータスキーマ
 */
export const TextSearchParamsSchema = z.object({
  query: z.string()
    .min(1),
  topK: z.number()
    .int()
    .min(1)
    .max(100)
    .default(10),
  namespace: z.string()
    .optional(),
  includeMetadata: z.boolean()
    .default(true),
  includeValues: z.boolean()
    .default(false),
  filter: z.record(z.string(), z.any())
    .optional()
})

/**
 * 類似検索パラメータスキーマ
 */
export const SimilarSearchParamsSchema = z.object({
  vectorId: z.string()
    .min(1),
  excludeSelf: z.boolean()
    .default(true),
  topK: z.number()
    .int()
    .min(1)
    .max(100)
    .default(10),
  namespace: z.string()
    .optional()
})

/**
 * GET版セマンティック検索パラメータスキーマ
 */
export const SemanticSearchQuerySchema = z.object({
  query: z.string()
    .min(1),
  topK: z.string()
    .optional()
    .transform(v => v ? Number(v) : 10)
    .pipe(z.number().int().min(1).max(100)),
  namespace: z.string()
    .optional()
})

/**
 * POST版セマンティック検索パラメータスキーマ
 */
export const SemanticSearchBodySchema = z.object({
  query: z.string()
    .min(1),
  topK: z.number()
    .int()
    .min(1)
    .max(100)
    .default(10),
  namespace: z.string()
    .optional()
})

/**
 * 検索結果の妥当性チェック
 */
export function validateSearchResults(results: any): boolean {
  if (!results || typeof results !== 'object') {
    return false
  }
  
  if (!Array.isArray(results.matches)) {
    return false
  }
  
  return results.matches.every((match: any) => 
    match && 
    typeof match.id === 'string' &&
    typeof match.score === 'number' &&
    match.score >= 0 && 
    match.score <= 1
  )
}

/**
 * 検索パラメータの正規化
 */
export function normalizeSearchParams(params: any): any {
  const normalized = { ...params }
  
  // topKの範囲チェックと正規化
  if (normalized.topK !== undefined) {
    normalized.topK = Math.min(Math.max(1, normalized.topK), 100)
  }
  
  // namespaceの正規化（空文字を未定義に）
  if (normalized.namespace === '') {
    delete normalized.namespace
  }
  
  // filterの正規化（空オブジェクトを未定義に）
  if (normalized.filter && Object.keys(normalized.filter).length === 0) {
    delete normalized.filter
  }
  
  return normalized
}