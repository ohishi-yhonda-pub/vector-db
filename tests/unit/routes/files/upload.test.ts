import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uploadFileRoute, uploadFileHandler } from '../../../../src/routes/api/files/upload'
import { setupFileProcessingRouteTest } from '../../test-helpers'

describe('Upload File Route', () => {
  let testSetup: ReturnType<typeof setupFileProcessingRouteTest>

  beforeEach(() => {
    testSetup = setupFileProcessingRouteTest()
    testSetup.app.openapi(uploadFileRoute, uploadFileHandler)
  })

  describe('POST /files/upload', () => {
    it('should upload PDF file successfully', async () => {
      const mockResult = {
        jobId: 'job-123',
        workflowId: 'workflow-456',
        status: 'processing'
      }

      testSetup.mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

      const formData = new FormData()
      const pdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // PDF header
      const pdfFile = new File([pdfContent], 'test.pdf', { type: 'application/pdf' })
      formData.append('file', pdfFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any as any

      expect(response.status).toBe(202)
      expect(testSetup.mockVectorManager.processFileAsync).toHaveBeenCalledWith(
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

      testSetup.mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

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

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any as any

      expect(response.status).toBe(202)
      expect(testSetup.mockVectorManager.processFileAsync).toHaveBeenCalledWith(
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

      testSetup.mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

      const formData = new FormData()
      const pngFile = new File([new Uint8Array([0x89, 0x50, 0x4E, 0x47])], 'test.png', { type: 'image/png' })
      formData.append('file', pngFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      expect(response.status).toBe(202)
    })

    it('should accept GIF files', async () => {
      const mockResult = {
        jobId: 'job-gif',
        workflowId: 'workflow-gif',
        status: 'processing'
      }

      testSetup.mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

      const formData = new FormData()
      const gifFile = new File([new Uint8Array([0x47, 0x49, 0x46])], 'test.gif', { type: 'image/gif' })
      formData.append('file', gifFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      expect(response.status).toBe(202)
    })

    it('should accept WebP files', async () => {
      const mockResult = {
        jobId: 'job-webp',
        workflowId: 'workflow-webp',
        status: 'processing'
      }

      testSetup.mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

      const formData = new FormData()
      const webpFile = new File([new Uint8Array([0x52, 0x49, 0x46, 0x46])], 'test.webp', { type: 'image/webp' })
      formData.append('file', webpFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      expect(response.status).toBe(202)
    })

    it('should handle missing file', async () => {
      const formData = new FormData()
      formData.append('namespace', 'test')

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any as any

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

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any as any

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

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any as any

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

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any as any

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

      testSetup.mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

      const formData = new FormData()
      const pdfFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'test.pdf', { type: 'application/pdf' })
      formData.append('file', pdfFile)
      formData.append('metadata', '')

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      expect(response.status).toBe(202)
    })

    it('should handle Durable Object errors', async () => {
      testSetup.mockVectorManager.processFileAsync.mockRejectedValue(new Error('Processing failed'))

      const formData = new FormData()
      const pdfFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'test.pdf', { type: 'application/pdf' })
      formData.append('file', pdfFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any as any

      expect(response.status).toBe(500)
      expect(result).toEqual({
        success: false,
        error: 'Internal Server Error',
        message: 'Processing failed'
      })
    })

    it('should handle non-Error exceptions', async () => {
      testSetup.mockVectorManager.processFileAsync.mockRejectedValue('String error')

      const formData = new FormData()
      const pdfFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'test.pdf', { type: 'application/pdf' })
      formData.append('file', pdfFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any as any

      expect(response.status).toBe(500)
      expect(result.message).toBe('ファイルアップロード中にエラーが発生しました')
    })

    it('should handle file with special characters in name', async () => {
      const mockResult = {
        jobId: 'job-special',
        workflowId: 'workflow-special',
        status: 'processing'
      }

      testSetup.mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

      const formData = new FormData()
      const pdfFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'test-file_2024.pdf', { type: 'application/pdf' })
      formData.append('file', pdfFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any as any

      expect(response.status).toBe(202)
      expect(result.data.fileInfo.name).toBe('test-file_2024.pdf')
    })

    it('should handle when file is not a File object', async () => {
      const formData = new FormData()
      // Append a string instead of a File object - this triggers Zod validation error
      formData.append('file', 'not-a-file')

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      // When it's not a File object, Zod validation catches it first
      expect(result.error.name).toBe('ZodError')
    })

    it('should handle Japanese filename with direct Japanese characters', async () => {
      const mockResult = {
        jobId: 'job-japanese',
        workflowId: 'workflow-japanese',
        status: 'processing'
      }

      testSetup.mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

      const formData = new FormData()
      // Use direct Japanese characters in filename
      const pdfFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'テスト文書.pdf', { type: 'application/pdf' })
      formData.append('file', pdfFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any as any

      expect(response.status).toBe(202)
      expect(result.success).toBe(true)
      // Japanese filename should be preserved
      expect(result.data.fileInfo.name).toBe('テスト文書.pdf')
    })

    it('should handle filename with percent encoding but no Japanese characters', async () => {
      const mockResult = {
        jobId: 'job-encoded',
        workflowId: 'workflow-encoded',
        status: 'processing'
      }

      testSetup.mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

      const formData = new FormData()
      // Create a filename with percent encoding but only ASCII characters
      const encodedFilename = 'test%20file.pdf' // Space encoded as %20
      const pdfFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], encodedFilename, { type: 'application/pdf' })
      formData.append('file', pdfFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any as any

      expect(response.status).toBe(202)
      // Should keep original filename since decoded version has no Japanese characters
      expect(testSetup.mockVectorManager.processFileAsync).toHaveBeenCalledWith(
        expect.any(String),
        'test%20file.pdf', // Should keep original
        'application/pdf',
        4,
        undefined,
        {}
      )
    })

    it('should handle malformed percent-encoded filename', async () => {
      const mockResult = {
        jobId: 'job-malformed',
        workflowId: 'workflow-malformed',
        status: 'processing'
      }

      testSetup.mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

      const formData = new FormData()
      // Create a filename with malformed percent encoding
      const malformedFilename = 'test%ZZinvalid.pdf' // Invalid percent encoding
      const pdfFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], malformedFilename, { type: 'application/pdf' })
      formData.append('file', pdfFile)

      const request = new Request('http://localhost/files/upload', {
        method: 'POST',
        body: formData
      })

      const response = await testSetup.app.fetch(request, testSetup.mockEnv)
      const result = await response.json() as any as any

      expect(response.status).toBe(202)
      // Should keep original filename when decoding fails
      expect(testSetup.mockVectorManager.processFileAsync).toHaveBeenCalledWith(
        expect.any(String),
        'test%ZZinvalid.pdf', // Should keep original on decode error
        'application/pdf',
        4,
        undefined,
        {}
      )
    })

  })
})

// Additional tests to cover edge cases for better branch coverage
describe('Upload File Edge Cases', () => {
  let testSetup: ReturnType<typeof setupFileProcessingRouteTest>

  beforeEach(() => {
    testSetup = setupFileProcessingRouteTest()
    // Use the handler directly to bypass route validation for edge case testing
    testSetup.app.post('/files/upload', uploadFileHandler)
  })

  it('should handle FormData with non-File value after validation bypass', async () => {
    // Create a custom FormData that will bypass validation
    const customFormData = {
      get: (key: string) => {
        if (key === 'file') {
          // Return something that's not a File object
          return 'not-a-file-object'
        }
        return null
      }
    }

    const request = {
      formData: async () => customFormData,
      header: (name: string) => undefined
    } as any

    const c = {
      req: request,
      json: vi.fn((data: any, status?: number) => ({ 
        data, 
        status: status || 200,
        json: async () => data 
      })),
      env: testSetup.mockEnv
    } as any

    const response = await uploadFileHandler(c, {} as any)
    
    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Bad Request',
        message: 'ファイルが正しくアップロードされていません'
      }),
      400
    )
  })

  it('should decode Japanese filename from Latin-1 encoding', async () => {
    const mockResult = {
      jobId: 'job-jp-decode',
      workflowId: 'workflow-jp-decode',
      status: 'processing'
    }

    testSetup.mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

    // Create filename with Japanese characters encoded as Latin-1 bytes
    // This simulates what happens when a browser encodes Japanese characters incorrectly
    const japaneseText = 'テスト文書.pdf'
    const utf8Bytes = new TextEncoder().encode(japaneseText)
    let latin1Name = ''
    for (const byte of utf8Bytes) {
      latin1Name += String.fromCharCode(byte)
    }

    const formData = new FormData()
    const file = new File(['test'], latin1Name, { type: 'application/pdf' })
    formData.append('file', file)

    const response = await testSetup.app.request('/files/upload', {
      method: 'POST',
      body: formData
    }, testSetup.mockEnv)

    expect(response.status).toBe(202)
    const result = await response.json() as any
    expect(result.success).toBe(true)
    
    // The handler should decode the filename and detect Japanese characters
    expect(testSetup.mockVectorManager.processFileAsync).toHaveBeenCalledWith(
      expect.any(String),
      japaneseText, // Decoded Japanese filename
      'application/pdf',
      4,  // 'test' is 4 bytes
      undefined,
      {}
    )
  })

  it('should handle filename decoding errors gracefully', async () => {
    const mockResult = {
      jobId: 'job-decode-error',
      workflowId: 'workflow-decode-error',
      status: 'processing'
    }

    testSetup.mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

    // Create a filename with invalid UTF-8 sequence (unpaired surrogate)
    // This will cause TextDecoder to fail
    const invalidUtf8Name = String.fromCharCode(0xE3) + String.fromCharCode(0x82) + 
                            String.fromCharCode(0xB9) + String.fromCharCode(0xE3) + 
                            String.fromCharCode(0x83) + String.fromCharCode(0x88) +
                            String.fromCharCode(0xFF) + String.fromCharCode(0xFF) + // Invalid UTF-8 bytes
                            '.pdf'

    const formData = new FormData()
    const file = new File(['test'], invalidUtf8Name, { type: 'application/pdf' })
    formData.append('file', file)

    const response = await testSetup.app.request('/files/upload', {
      method: 'POST',
      body: formData
    }, testSetup.mockEnv)

    expect(response.status).toBe(202)
    const result = await response.json() as any
    expect(result.success).toBe(true)
    
    // The handler successfully decodes even with some invalid bytes, replacing them with �
    expect(testSetup.mockVectorManager.processFileAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('スト'), // Partially decoded with replacement chars
      'application/pdf',
      4,  // 'test' is 4 bytes
      undefined,
      {}
    )
  })

  it('should handle TextDecoder throwing error on invalid sequences', async () => {
    const mockResult = {
      jobId: 'job-decoder-error',
      workflowId: 'workflow-decoder-error',
      status: 'processing'
    }

    testSetup.mockVectorManager.processFileAsync.mockResolvedValue(mockResult)

    // Mock TextDecoder to throw an error
    const originalTextDecoder = global.TextDecoder
    global.TextDecoder = vi.fn().mockImplementation(() => ({
      decode: vi.fn().mockImplementation(() => {
        throw new Error('Invalid byte sequence')
      })
    })) as any

    // Create a filename that looks like it needs decoding
    const latin1Name = String.fromCharCode(0xE3) + String.fromCharCode(0x83) + 
                       String.fromCharCode(0x86) + '.pdf'

    const formData = new FormData()
    const file = new File(['test'], latin1Name, { type: 'application/pdf' })
    formData.append('file', file)

    const response = await testSetup.app.request('/files/upload', {
      method: 'POST',
      body: formData
    }, testSetup.mockEnv)

    expect(response.status).toBe(202)
    const result = await response.json() as any
    expect(result.success).toBe(true)
    
    // Should use original filename when TextDecoder fails
    expect(testSetup.mockVectorManager.processFileAsync).toHaveBeenCalledWith(
      expect.any(String),
      latin1Name, // Original filename since decoding failed
      'application/pdf',
      4,  // 'test' is 4 bytes
      undefined,
      {}
    )

    // Restore original TextDecoder
    global.TextDecoder = originalTextDecoder
  })

})