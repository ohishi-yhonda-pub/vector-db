import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import {
  ListModelsResponseSchema,
  type ListModelsResponse
} from '../../../schemas/embedding.schema'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// 利用可能なモデル一覧ルート
export const listModelsRoute = createRoute({
  method: 'get',
  path: '/embeddings/models',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ListModelsResponseSchema
        }
      },
      description: '利用可能なモデル一覧'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'サーバーエラー'
    }
  },
  tags: ['Embeddings'],
  summary: '利用可能なモデル一覧',
  description: '埋め込み生成に利用可能なモデルの一覧を取得します'
})

// 利用可能なモデル一覧ハンドラー
export const listModelsHandler: RouteHandler<typeof listModelsRoute, EnvType> = async (c) => {
  try {
    const aiEmbeddingsId = c.env.AI_EMBEDDINGS.idFromName('default')
    const aiEmbeddings = c.env.AI_EMBEDDINGS.get(aiEmbeddingsId)
    
    const models = await aiEmbeddings.getAvailableModels()
    
    return c.json<ListModelsResponse, 200>({
      success: true,
      data: models
    }, 200)
  } catch (error) {
    console.error('List models error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'モデル一覧の取得中にエラーが発生しました'
    }, 500)
  }
}