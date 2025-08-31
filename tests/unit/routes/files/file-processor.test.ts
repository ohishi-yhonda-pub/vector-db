import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FileProcessor } from '../../../../src/routes/api/files/file-processor'

describe('FileProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  describe('decodeFileName', () => {
    it('should decode Japanese filename correctly', () => {
      // Simulate Latin-1 encoded Japanese filename
      const encodedName = 'ãã¹ã' // テスト in wrong encoding
      const decoded = FileProcessor.decodeFileName(encodedName)
      expect(decoded).toBe('テスト')
    })

    it('should return original filename if no Japanese characters', () => {
      const filename = 'test-file.pdf'
      const result = FileProcessor.decodeFileName(filename)
      expect(result).toBe('test-file.pdf')
    })

    it('should handle decode errors gracefully', () => {
      const invalidName = 'test\xFF\xFE.pdf' // Invalid UTF-8 sequence
      const result = FileProcessor.decodeFileName(invalidName)
      expect(result).toBeDefined()
    })
  })

  describe('encodeFileToBase64', () => {
    it('should encode file to base64', async () => {
      const content = 'Hello, World!'
      const file = new File([content], 'test.txt', { type: 'text/plain' })
      const base64 = await FileProcessor.encodeFileToBase64(file)
      
      // Decode and verify
      const decoded = atob(base64)
      expect(decoded).toBe(content)
    })

    it('should handle large files with chunking', async () => {
      // Create a file larger than chunk size (8192 bytes)
      const largeContent = 'x'.repeat(10000)
      const file = new File([largeContent], 'large.txt', { type: 'text/plain' })
      const base64 = await FileProcessor.encodeFileToBase64(file)
      
      // Decode and verify
      const decoded = atob(base64)
      expect(decoded).toBe(largeContent)
    })

    it('should handle binary files', async () => {
      const binaryData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]) // JPEG header
      const file = new File([binaryData], 'image.jpg', { type: 'image/jpeg' })
      const base64 = await FileProcessor.encodeFileToBase64(file)
      
      expect(base64).toBeDefined()
      expect(base64.length).toBeGreaterThan(0)
    })
  })

  describe('processWithVectorManager', () => {
    it('should call VectorManager with correct parameters', async () => {
      const mockProcessFileAsync = vi.fn().mockResolvedValue({
        jobId: 'job-123',
        workflowId: 'workflow-123',
        status: 'processing'
      })

      const mockVectorManager = {
        processFileAsync: mockProcessFileAsync
      }

      const mockEnv = {
        VECTOR_CACHE: {
          idFromName: vi.fn().mockReturnValue('id-123'),
          get: vi.fn().mockReturnValue(mockVectorManager)
        }
      } as any

      const result = await FileProcessor.processWithVectorManager(
        mockEnv,
        'base64data',
        'test.pdf',
        'application/pdf',
        1024,
        'documents',
        { category: 'test' }
      )

      expect(mockEnv.VECTOR_CACHE.idFromName).toHaveBeenCalledWith('global')
      expect(mockEnv.VECTOR_CACHE.get).toHaveBeenCalledWith('id-123')
      expect(mockProcessFileAsync).toHaveBeenCalledWith(
        'base64data',
        'test.pdf',
        'application/pdf',
        1024,
        'documents',
        { category: 'test' }
      )
      expect(result).toEqual({
        jobId: 'job-123',
        workflowId: 'workflow-123',
        status: 'processing'
      })
    })
  })

  describe('logRequestHeaders', () => {
    it('should log request headers', () => {
      const logSpy = vi.spyOn(console, 'log')
      const headers = {
        'content-type': 'multipart/form-data',
        'content-length': '1024',
        'accept-charset': 'utf-8'
      }

      FileProcessor.logRequestHeaders(headers)

      expect(logSpy).toHaveBeenCalledWith('Request headers:', headers)
    })
  })

  describe('logFileInfo', () => {
    it('should log file information', () => {
      const logSpy = vi.spyOn(console, 'log')
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
      
      FileProcessor.logFileInfo(file)

      expect(logSpy).toHaveBeenCalledWith('File object:', expect.objectContaining({
        name: 'test.pdf',
        type: 'application/pdf',
        size: 7,
        constructor: 'File'
      }))
    })
  })
})