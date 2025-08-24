import { z } from '@hono/zod-openapi'
import { VectorSchema } from './vector.schema'
import { type VectorizeMatch } from './cloudflare.schema'

export const SearchQuerySchema = z.object({
  query: z.string().min(1).openapi({
    example: '検索クエリテキスト',
    description: '検索するテキストクエリ'
  }),
  topK: z.number().int().min(1).max(100).default(10).openapi({
    example: 10,
    description: '返す結果の最大数'
  }),
  namespace: z.string().optional().openapi({
    example: 'default',
    description: '検索する名前空間'
  }),
  filter: z.record(z.string(), z.any()).optional().openapi({
    example: { category: 'technology' },
    description: 'メタデータフィルター'
  }),
  includeMetadata: z.boolean().default(true).openapi({
    example: true,
    description: 'メタデータを結果に含めるか'
  }),
  includeValues: z.boolean().default(false).openapi({
    example: false,
    description: 'ベクトル値を結果に含めるか'
  })
})

export const SearchMatchSchema = z.object({
  id: z.string(),
  score: z.number().min(0).max(1).openapi({
    example: 0.95,
    description: '類似度スコア（0-1）'
  }),
  vector: VectorSchema.optional(),
  metadata: z.record(z.string(), z.any()).optional()
})

export const SearchResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    matches: z.array(SearchMatchSchema),
    query: z.string(),
    namespace: z.string().optional(),
    processingTime: z.number().openapi({
      example: 123.45,
      description: '処理時間（ミリ秒）'
    })
  }),
  message: z.string().optional()
})

export type SearchQuery = z.infer<typeof SearchQuerySchema>
export type SearchMatch = z.infer<typeof SearchMatchSchema>
export type SearchResponse = z.infer<typeof SearchResponseSchema>