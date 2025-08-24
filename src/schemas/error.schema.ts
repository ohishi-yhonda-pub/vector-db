import { z } from '@hono/zod-openapi'

export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string().openapi({
    example: 'Bad Request',
    description: 'エラーの種類'
  }),
  message: z.string().openapi({
    example: '無効なリクエストパラメータです',
    description: 'エラーの詳細メッセージ'
  }),
  details: z.any().optional().openapi({
    description: 'エラーの詳細情報'
  })
})

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>