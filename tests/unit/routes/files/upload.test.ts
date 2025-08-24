import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { uploadFileRoute, uploadFileHandler } from '../../../../src/routes/api/files/upload'

// Mock Vector Manager Durable Object
const mockVectorManager = {
  processFileAsync: vi.fn()
}

// Mock Durable Object namespace
const mockVectorCacheNamespace = {
  idFromName: vi.fn().mockReturnValue('mock-id'),
  get: vi.fn().mockReturnValue(mockVectorManager)
}

describe('Upload File Route', () => {
  let app: OpenAPIHono<{ Bindings: Env }>
  let mockEnv: Env

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockEnv = {
      ENVIRONMENT: 'development' as const,
      DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
      DEFAULT_TEXT_GENERATION_MODEL: '@cf/google/gemma-3-12b-it',
      IMAGE_ANALYSIS_PROMPT: 'Describe this image',
      IMAGE_ANALYSIS_MAX_TOKENS: '512',
      TEXT_EXTRACTION_MAX_TOKENS: '1024',
      NOTION_API_KEY: 'test-key',
      AI: {} as any,
      VECTORIZE_INDEX: {} as any,
      VECTOR_CACHE: mockVectorCacheNamespace as any,
      NOTION_MANAGER: {} as any,
      AI_EMBEDDINGS: {} as any,
      DB: {} as any,
      BATCH_EMBEDDINGS_WORKFLOW: {} as any,
      VECTOR_OPERATIONS_WORKFLOW: {} as any,
      FILE_PROCESSING_WORKFLOW: {} as any,
      NOTION_SYNC_WORKFLOW: {} as any
    }

    app = new OpenAPIHono<{ Bindings: Env }>()
    app.openapi(uploadFileRoute, uploadFileHandler)
  })

  describe('POST /files/upload', () => {
    it('should upload PDF file successfully', async () => {
      const mockResult = {
        jobId: 'job-123',
        workflowId: 'workflow-456',
        status: 'processing'
      }

      mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

      const formData = new FormData()
      const pdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // PDF header
      const pdfFile = new File([pdfContent], 'test.pdf', { type: 'application/pdf' })
      formData.append('file', pdfFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(mockVectorManager.processFileAsync).toHaveBeenCalledWith(
        expect.any(String), // base64 encoded file
        'test.pdf',
        'application/pdf',
        4,
        undefined,
        {}
      )
      expect(result).toEqual({
        success: true,
        data: {
          jobId: 'job-123',
          workflowId: 'workflow-456',
          status: 'processing',
          fileInfo: {
            name: 'test.pdf',
            type: 'application/pdf',
            size: 4
          },
          message: 'ファイルの処理を開始しました'
        }
      })
    })

    it('should upload image file with namespace and metadata', async () => {
      const mockResult = {
        jobId: 'job-img-123',
        workflowId: 'workflow-img-456',
        status: 'processing'
      }

      mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

      const formData = new FormData()
      const imageContent = new Uint8Array([0xFF, 0xD8, 0xFF]) // JPEG header
      const imageFile = new File([imageContent], 'test.jpg', { type: 'image/jpeg' })
      formData.append('file', imageFile)
      formData.append('namespace', 'test-namespace')
      formData.append('metadata', JSON.stringify({ category: 'test', tags: ['image'] }))

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(mockVectorManager.processFileAsync).toHaveBeenCalledWith(
        expect.any(String),
        'test.jpg',
        'image/jpeg',
        3,
        'test-namespace',
        { category: 'test', tags: ['image'] }
      )
      expect(result.success).toBe(true)
    })

    it('should accept PNG files', async () => {
      const mockResult = {
        jobId: 'job-png',
        workflowId: 'workflow-png',
        status: 'processing'
      }

      mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

      const formData = new FormData()
      const pngFile = new File([new Uint8Array([0x89, 0x50, 0x4E, 0x47])], 'test.png', { type: 'image/png' })
      formData.append('file', pngFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await app.fetch(request, mockEnv)
      expect(response.status).toBe(202)
    })

    it('should accept GIF files', async () => {
      const mockResult = {
        jobId: 'job-gif',
        workflowId: 'workflow-gif',
        status: 'processing'
      }

      mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

      const formData = new FormData()
      const gifFile = new File([new Uint8Array([0x47, 0x49, 0x46])], 'test.gif', { type: 'image/gif' })
      formData.append('file', gifFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await app.fetch(request, mockEnv)
      expect(response.status).toBe(202)
    })

    it('should accept WebP files', async () => {
      const mockResult = {
        jobId: 'job-webp',
        workflowId: 'workflow-webp',
        status: 'processing'
      }

      mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

      const formData = new FormData()
      const webpFile = new File([new Uint8Array([0x52, 0x49, 0x46, 0x46])], 'test.webp', { type: 'image/webp' })
      formData.append('file', webpFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await app.fetch(request, mockEnv)
      expect(response.status).toBe(202)
    })

    it('should handle missing file', async () => {
      const formData = new FormData()
      formData.append('namespace', 'test')

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error.name).toBe('ZodError')
    })

    it('should reject files over 10MB', async () => {
      const formData = new FormData()
      const largeContent = new Uint8Array(11 * 1024 * 1024) // 11MB
      const largeFile = new File([largeContent], 'large.pdf', { type: 'application/pdf' })
      formData.append('file', largeFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(413)
      expect(result).toEqual({
        success: false,
        error: 'Payload Too Large',
        message: 'ファイルサイズは10MB以下にしてください'
      })
    })

    it('should reject unsupported file types', async () => {
      const formData = new FormData()
      const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' })
      formData.append('file', textFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(415)
      expect(result).toEqual({
        success: false,
        error: 'Unsupported Media Type',
        message: 'サポートされていないファイル形式です: text/plain'
      })
    })

    it('should reject invalid metadata JSON', async () => {
      const formData = new FormData()
      const pdfFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'test.pdf', { type: 'application/pdf' })
      formData.append('file', pdfFile)
      formData.append('metadata', 'invalid json {')

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Bad Request')
      expect(result.message).toContain('メタデータ')
    })

    it('should handle empty metadata', async () => {
      const mockResult = {
        jobId: 'job-no-meta',
        workflowId: 'workflow-no-meta',
        status: 'processing'
      }

      mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

      const formData = new FormData()
      const pdfFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'test.pdf', { type: 'application/pdf' })
      formData.append('file', pdfFile)
      formData.append('metadata', '')

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await app.fetch(request, mockEnv)
      expect(response.status).toBe(202)
    })

    it('should handle Durable Object errors', async () => {
      mockVectorManager.processFileAsync.mockRejectedValue(new Error('Processing failed'))

      const formData = new FormData()
      const pdfFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'test.pdf', { type: 'application/pdf' })
      formData.append('file', pdfFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Processing failed'
      })
    })

    it('should handle non-Error exceptions', async () => {
      mockVectorManager.processFileAsync.mockRejectedValue('String error')

      const formData = new FormData()
      const pdfFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'test.pdf', { type: 'application/pdf' })
      formData.append('file', pdfFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('ファイルアップロード中にエラーが発生しました')
    })

    it('should handle file with special characters in name', async () => {
      const mockResult = {
        jobId: 'job-special',
        workflowId: 'workflow-special',
        status: 'processing'
      }

      mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

      const formData = new FormData()
      const pdfFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'test-file_2024.pdf', { type: 'application/pdf' })
      formData.append('file', pdfFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await app.fetch(request, mockEnv)
      const result = await response.json() as any

      expect(response.status).toBe(202)
      expect(result.data.fileInfo.name).toBe('test-file_2024.pdf')
    })

  })
})