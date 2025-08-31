import { createRoute, RouteHandler } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import {
  FileProcessingResponseSchema,
  type FileProcessingResponse
} from '../../../schemas/file-upload.schema'
import { ErrorResponseSchema, type ErrorResponse } from '../../../schemas/error.schema'
import { FileValidator } from './file-validator'
import { FileProcessor } from './file-processor'

// 環境の型定義
type EnvType = {
  Bindings: Env
}

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
    // リクエストヘッダーのログ出力
    FileProcessor.logRequestHeaders({
      'content-type': c.req.header('content-type'),
      'content-length': c.req.header('content-length'),
      'accept-charset': c.req.header('accept-charset')
    })
    
    // フォームデータの取得
    const formData = await c.req.formData()
    const file = formData.get('file')
    const namespace = formData.get('namespace') as string | null
    const metadataStr = formData.get('metadata') as string | null
    
    // ファイルのバリデーション
    if (!FileValidator.validateFile(file)) {
      console.error('Not a File object:', file)
      return c.json<ErrorResponse, 400>({
        success: false,
        error: 'Bad Request',
        message: 'ファイルが正しくアップロードされていません'
      }, 400)
    }
    
    // ファイル情報のログ出力
    FileProcessor.logFileInfo(file)
    
    // ファイル名のデコード
    const fileName = FileProcessor.decodeFileName(file.name)
    
    // ファイルサイズのバリデーション
    const sizeValidation = FileValidator.validateFileSize(file)
    if (!sizeValidation.valid) {
      return c.json<ErrorResponse, 413>(sizeValidation.error!, 413)
    }
    
    // ファイルタイプのバリデーション
    const typeValidation = FileValidator.validateFileType(file)
    if (!typeValidation.valid) {
      return c.json<ErrorResponse, 415>(typeValidation.error!, 415)
    }
    
    // メタデータのバリデーション
    const metadataValidation = FileValidator.validateMetadata(metadataStr)
    if (!metadataValidation.valid) {
      return c.json<ErrorResponse, 400>(metadataValidation.error!, 400)
    }
    
    // ファイルをBase64エンコード
    const fileDataBase64 = await FileProcessor.encodeFileToBase64(file)
    
    // VectorManagerを使用してファイルを処理
    const result = await FileProcessor.processWithVectorManager(
      c.env,
      fileDataBase64,
      fileName,
      file.type,
      file.size,
      namespace || undefined,
      metadataValidation.data
    )
    
    return c.json<FileProcessingResponse, 202>({
      success: true,
      data: {
        jobId: result.jobId,
        workflowId: result.workflowId,
        status: result.status,
        fileInfo: {
          name: fileName,
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