import { describe, it, expect } from 'vitest'
import {
  SupportedFileTypes,
  FileUploadSchema,
  FileProcessingResponseSchema,
  FileProcessingResultSchema,
  type SupportedFileType,
  type FileUpload,
  type FileProcessingResponse,
  type FileProcessingResult
} from '../../../src/schemas/file-upload.schema'

describe('File Upload Schemas', () => {
  describe('SupportedFileTypes', () => {
    it('should validate supported PDF type', () => {
      const result = SupportedFileTypes.parse('application/pdf')
      expect(result).toBe('application/pdf')
    })

    it('should validate supported image types', () => {
      expect(SupportedFileTypes.parse('image/jpeg')).toBe('image/jpeg')
      expect(SupportedFileTypes.parse('image/png')).toBe('image/png')
      expect(SupportedFileTypes.parse('image/gif')).toBe('image/gif')
      expect(SupportedFileTypes.parse('image/webp')).toBe('image/webp')
    })

    it('should reject unsupported file type', () => {
      expect(() => SupportedFileTypes.parse('text/plain')).toThrow()
    })
  })

  describe('FileUploadSchema', () => {
    it('should validate file upload with all fields', () => {
      const mockFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' })
      const validUpload = {
        file: mockFile,
        namespace: 'test-namespace',
        metadata: JSON.stringify({ author: 'Test Author' })
      }

      const result = FileUploadSchema.parse(validUpload)
      expect(result.file).toBe(mockFile)
      expect(result.namespace).toBe('test-namespace')
      expect(result.metadata).toBe(JSON.stringify({ author: 'Test Author' }))
    })

    it('should validate minimal file upload', () => {
      const mockFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' })
      const minimalUpload = {
        file: mockFile
      }

      const result = FileUploadSchema.parse(minimalUpload)
      expect(result.file).toBe(mockFile)
    })

    it('should reject file larger than 10MB', () => {
      // Create a mock file object that appears to be larger than 10MB
      const largeFile = new File([''], 'large.pdf', { type: 'application/pdf' })
      // Mock the size property to be larger than 10MB
      Object.defineProperty(largeFile, 'size', { value: 11 * 1024 * 1024 })

      const upload = { file: largeFile }

      expect(() => FileUploadSchema.parse(upload)).toThrow()
    })

    it('should accept file exactly 10MB', () => {
      const exactSizeFile = new File([''], 'exact.pdf', { type: 'application/pdf' })
      // Mock the size property
      Object.defineProperty(exactSizeFile, 'size', { value: 10 * 1024 * 1024 })

      const upload = { file: exactSizeFile }

      const result = FileUploadSchema.parse(upload)
      expect(result.file).toBe(exactSizeFile)
    })
  })

  describe('FileProcessingResponseSchema', () => {
    it('should validate complete processing response', () => {
      const validResponse = {
        success: true,
        data: {
          jobId: 'job-123',
          workflowId: 'workflow-456',
          status: 'processing',
          fileInfo: {
            name: 'test.pdf',
            type: 'application/pdf',
            size: 1024
          },
          message: 'File processing started'
        }
      }

      const result = FileProcessingResponseSchema.parse(validResponse)
      expect(result).toEqual(validResponse)
    })

    it('should validate error response', () => {
      const errorResponse = {
        success: false,
        data: {
          jobId: 'job-123',
          workflowId: 'workflow-456',
          status: 'failed',
          fileInfo: {
            name: 'test.pdf',
            type: 'application/pdf',
            size: 1024
          },
          message: 'Processing failed'
        }
      }

      const result = FileProcessingResponseSchema.parse(errorResponse)
      expect(result).toEqual(errorResponse)
    })
  })

  describe('FileProcessingResultSchema', () => {
    it('should validate PDF processing result', () => {
      const pdfResult = {
        type: 'pdf' as const,
        success: true,
        content: {
          text: 'Extracted PDF content',
          extractedPages: 5,
          metadata: { title: 'Test Document' }
        },
        vectorIds: ['vector-1', 'vector-2']
      }

      const result = FileProcessingResultSchema.parse(pdfResult)
      expect(result).toEqual(pdfResult)
    })

    it('should validate image processing result', () => {
      const imageResult = {
        type: 'image' as const,
        success: true,
        content: {
          description: 'A beautiful landscape photo',
          metadata: { camera: 'Canon EOS' }
        },
        vectorIds: ['vector-3']
      }

      const result = FileProcessingResultSchema.parse(imageResult)
      expect(result).toEqual(imageResult)
    })

    it('should validate failed processing result', () => {
      const failedResult = {
        type: 'pdf' as const,
        success: false,
        content: {},
        vectorIds: [],
        error: 'Failed to extract text from PDF'
      }

      const result = FileProcessingResultSchema.parse(failedResult)
      expect(result).toEqual(failedResult)
    })

    it('should reject invalid type', () => {
      const invalidResult = {
        type: 'video', // not in enum
        success: true,
        content: {},
        vectorIds: []
      }

      expect(() => FileProcessingResultSchema.parse(invalidResult)).toThrow()
    })
  })

  describe('Type exports', () => {
    it('should export all types correctly', () => {
      // Test that types are properly exported and can be used
      const fileType: SupportedFileType = 'application/pdf'
      
      const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' })
      const upload: FileUpload = {
        file: mockFile
      }

      const response: FileProcessingResponse = {
        success: true,
        data: {
          jobId: 'job-1',
          workflowId: 'workflow-1',
          status: 'processing',
          fileInfo: {
            name: 'test.pdf',
            type: 'application/pdf',
            size: 1024
          },
          message: 'Processing started'
        }
      }

      const result: FileProcessingResult = {
        type: 'pdf',
        success: true,
        content: {
          text: 'Extracted text'
        },
        vectorIds: ['vector-1']
      }

      expect(fileType).toBe('application/pdf')
      expect(upload.file).toBe(mockFile)
      expect(response.success).toBe(true)
      expect(result.type).toBe('pdf')
    })
  })
})