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
            file: z.instanceof(File).openapi({
              type: 'string',
              format: 'binary',
              description: 'アップロードするファイル（PDF、JPEG、PNG、GIF、WebP）'
            }),
            namespace: z.string().optional().openapi({
              description: 'ベクトルの名前空間（オプション）',
              example: 'documents'
            }),
            metadata: z.string().optional().openapi({
              description: 'メタデータ（JSON形式の文字列）',
              example: '{"category": "report", "year": 2024}'
            })
          }).openapi({
            required: ['file']
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
    // リクエストヘッダーの確認
    const contentType = c.req.header('content-type')
    console.log('Request headers:', {
      'content-type': contentType,
      'content-length': c.req.header('content-length'),
      'accept-charset': c.req.header('accept-charset')
    })
    
    const formData = await c.req.formData()
    const file = formData.get('file')
    
    // Fileオブジェクトかどうか確認
    if (!(file instanceof File)) {
      console.error('Not a File object:', file)
      return c.json<ErrorResponse, 400>({
        success: false,
        error: 'Bad Request',
        message: 'ファイルが正しくアップロードされていません'
      }, 400)
    }
    const namespace = formData.get('namespace') as string | null
    const metadataStr = formData.get('metadata') as string | null
    
    // File オブジェクトの詳細をログ出力
    console.log('File object:', {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      // File APIの他のプロパティも確認
      constructor: file.constructor.name
    })
    
    // ファイル名のデコード処理（文字化け対策）
    let fileName = file.name
    console.log('Original filename:', fileName)
    console.log('Filename char codes:', Array.from(fileName).map(c => c.charCodeAt(0)))
    
    try {
      // Latin-1として解釈された文字を元のバイト列に戻す
      const originalBytes = new Uint8Array(fileName.length)
      for (let i = 0; i < fileName.length; i++) {
        originalBytes[i] = fileName.charCodeAt(i)
      }
      
      // UTF-8としてデコードし直す
      const decoder = new TextDecoder('utf-8')
      try {
        const decodedName = decoder.decode(originalBytes)
        console.log('Decoded filename:', decodedName)
        // 正常にデコードできたか確認（日本語文字が含まれているか）
        if (/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(decodedName)) {
          fileName = decodedName
          console.log('Using decoded filename:', fileName)
        } else {
          console.log('No Japanese characters found in decoded name')
        }
      } catch (e) {
        // デコードに失敗した場合は元のファイル名を使用
        console.log('Failed to decode filename as UTF-8, using original:', fileName, e)
      }
    } catch (error) {
      console.error('Error processing filename:', error)
    }

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

    // ファイルをBase64エンコード（大きなファイル対応）
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    // バイナリ文字列を作成（チャンクごとに処理）
    const chunkSize = 8192
    let binaryString = ''
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, Math.min(i + chunkSize, uint8Array.length))
      binaryString += String.fromCharCode(...chunk)
    }
    
    // 全体を一度にBase64エンコード
    const fileDataBase64 = btoa(binaryString)

    // VectorManagerを使用してファイルを処理
    const vectorManagerId = c.env.VECTOR_CACHE.idFromName('global')
    const vectorManager = c.env.VECTOR_CACHE.get(vectorManagerId)
    
    const result = await vectorManager.processFileAsync(
      fileDataBase64,
      fileName,  // デコード済みのファイル名を使用
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
          name: fileName,  // デコード済みのファイル名を使用
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