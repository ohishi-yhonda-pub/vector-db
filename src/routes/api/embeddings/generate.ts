import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import {
  GenerateEmbeddingSchema,
  GenerateEmbeddingResponseSchema,
  type GenerateEmbedding,
  type GenerateEmbeddingResponse
} from '../../../schemas/embedding.schema'
import { AIEmbeddings } from '@/durable-objects'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// 埋め込み生成ロジック
export async function generateEmbedding(
  params: GenerateEmbedding,
  aiEmbeddings: DurableObjectStub<AIEmbeddings>
): Promise<GenerateEmbeddingResponse> {
  const result = await aiEmbeddings.generateEmbedding(params.text, params.model)
  
  return {
    success: true,
    data: result,
    message: 'テキストの処理を開始しました'
  }
}

// 埋め込み生成ルート
export const generateEmbeddingRoute = createRoute({
  method: 'post',
  path: '/embeddings',
  request: {
    body: {
      content: {
        'application/json': {
          schema: GenerateEmbeddingSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: GenerateEmbeddingResponseSchema
        }
      },
      description: '処理が開始されました'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: '不正なリクエスト'
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
  summary: 'テキスト埋め込み生成',
  description: 'Workers AIを使用してテキストの埋め込みベクトルを非同期で生成します。処理状況はWorkflow IDで確認できます。'
})

// 埋め込み生成ハンドラー
export const generateEmbeddingHandler: RouteHandler<typeof generateEmbeddingRoute, EnvType> = async (c) => {
  try {
    const body = c.req.valid('json')

    // Durable Objectを使用
    const aiEmbeddingsId = c.env.AI_EMBEDDINGS.idFromName('default')
    const aiEmbeddings = c.env.AI_EMBEDDINGS.get(aiEmbeddingsId)

    const response = await generateEmbedding(body, aiEmbeddings)
    return c.json(response, 200)
  } catch (error) {
    console.error('Embedding generation error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : '埋め込み生成中にエラーが発生しました'
    }, 500)
  }
}