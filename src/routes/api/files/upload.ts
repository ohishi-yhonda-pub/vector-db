import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import {
  FileProcessingResponseSchema,
  SupportedFileTypes,
  type FileProcessingResponse
} from '../../../schemas/file-upload.schema'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

// メタデータのバリデーションスキーマ
const MetadataSchema = z.string().nullable().optional().transform((val, ctx) => {
  if (!val) return {}
  try {
    return JSON.parse(val)
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'メタデータのバリデーションに失敗しました'
    })
    return z.NEVER
  }
})

// ファイルアップロードルート定義
export const uploadFileRoute = createRoute({
  method: 'post',
  path: '/files/upload',
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.instanceof(File),
            namespace: z.string().optional(),
            metadata: z.string().optional() // JSON string
          })
        }
      }
    }
  },
  responses: {
    202: {
      content: {
        'application/json': {
          schema: FileProcessingResponseSchema
        }
      },
      description: 'ファイル処理が開始されました'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: '不正なリクエスト'
    },
    413: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'ファイルサイズが大きすぎます'
    },
    415: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'サポートされていないファイル形式'
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
  tags: ['Files'],
  summary: 'ファイルアップロード',
  description: 'PDFまたは画像ファイルをアップロードして、内容を抽出しベクトル化します'
})

// ファイルアップロードハンドラー
export const uploadFileHandler: RouteHandler<typeof uploadFileRoute, EnvType> = async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    const namespace = formData.get('namespace') as string | null
    const metadataStr = formData.get('metadata') as string | null

    // ファイルサイズチェック (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return c.json<ErrorResponse, 413>({
        success: false,
        error: 'Payload Too Large',
        message: 'ファイルサイズは10MB以下にしてください'
      }, 413)
    }

    // ファイルタイプチェック
    const fileType = file.type
    const supportedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!supportedTypes.includes(fileType)) {
      return c.json<ErrorResponse, 415>({
        success: false,
        error: 'Unsupported Media Type',
        message: `サポートされていないファイル形式です: ${fileType}`
      }, 415)
    }

    // メタデータのパースとバリデーション
    const parseResult = MetadataSchema.safeParse(metadataStr)
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]
      return c.json<ErrorResponse, 400>({
        success: false,
        error: 'Bad Request',
        message: firstError.message
      }, 400)
    }
    const validatedMetadata = parseResult.data

    // ファイルをBase64エンコード
    const arrayBuffer = await file.arrayBuffer()
    const fileDataBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    // VectorManagerを使用してファイルを処理
    const vectorManagerId = c.env.VECTOR_CACHE.idFromName('global')
    const vectorManager = c.env.VECTOR_CACHE.get(vectorManagerId)
    
    const result = await vectorManager.processFileAsync(
      fileDataBase64,
      file.name,
      file.type,
      file.size,
      namespace || undefined,
      validatedMetadata
    )

    return c.json<FileProcessingResponse, 202>({
      success: true,
      data: {
        jobId: result.jobId,
        workflowId: result.workflowId,
        status: result.status,
        fileInfo: {
          name: file.name,
          type: file.type,
          size: file.size
        },
        message: 'ファイルの処理を開始しました'
      }
    }, 202)
  } catch (error) {
    console.error('File upload error:', error)
    return c.json<ErrorResponse, 500>({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'ファイルアップロード中にエラーが発生しました'
    }, 500)
  }
}