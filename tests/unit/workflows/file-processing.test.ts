import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock cloudflare:workers
vi.mock('cloudflare:workers', () => ({
  WorkflowEntrypoint: class {
    constructor(public ctx: any, public env: any) {}
  },
  WorkflowStep: {},
  WorkflowEvent: {}
}))

// Import after mocking  
import { FileProcessingWorkflow } from '../../../src/workflows/file-processing'

describe('FileProcessingWorkflow', () => {
  let workflow: FileProcessingWorkflow
  let mockEnv: any
  let mockCtx: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockEnv = {
      AI: {
        run: vi.fn()
      },
      DEFAULT_TEXT_GENERATION_MODEL: '@cf/meta/llama-3-8b-instruct',
      TEXT_EXTRACTION_MAX_TOKENS: '2048',
      VECTOR_OPERATIONS_WORKFLOW: {
        create: vi.fn().mockResolvedValue({ id: 'workflow-123' })
      }
    }

    mockCtx = {}

    workflow = new FileProcessingWorkflow(mockCtx, mockEnv)
  })

  describe('processFile', () => {
    let mockStep: any

    beforeEach(() => {
      mockStep = {
        do: vi.fn()
      }
    })

    it('should use custom namespace and metadata for PDF', async () => {
      const params = {
        fileData: btoa('PDF content'),
        fileName: 'test.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        namespace: 'custom-namespace',
        metadata: { userId: 'user123' }
      }

      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'analyze-file-with-gemma') {
            return {
              description: 'Test PDF',
              extractedText: 'Content',
              topics: '',
              keywords: '',
              hasText: true
            }
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'prepare-content-chunks') {
            return [
              { text: 'Test PDF', type: 'description' },
              { text: 'Content', type: 'extracted-text' }
            ]
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'vectorize-content') {
            // Execute the callback to trigger VECTOR_OPERATIONS_WORKFLOW.create
            return await fn()
          }
          return fn()
        })

      mockEnv.AI.run.mockResolvedValueOnce({
        response: 'DESCRIPTION: Test PDF\nEXTRACTED_TEXT: Content'
      })

      const result = await (workflow as any).processFile(params, mockStep)
      
      expect(result.success).toBe(true)

      expect(mockEnv.VECTOR_OPERATIONS_WORKFLOW.create).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            namespace: 'custom-namespace',
            metadata: expect.objectContaining({
              userId: 'user123'
            })
          })
        })
      )
    })

    it('should process PDF file successfully', async () => {
      const params = {
        fileData: btoa('PDF content'),
        fileName: 'test.pdf',
        fileType: 'application/pdf',
        fileSize: 1024
      }

      mockStep.do
        .mockResolvedValueOnce({
          description: 'Test PDF',
          extractedText: 'Content',
          topics: 'testing',
          keywords: 'test, pdf',
          hasText: true
        })
        .mockResolvedValueOnce([
          { text: 'Test PDF', type: 'description' },
          { text: 'Content', type: 'extracted-text' },
          { text: 'Topics: testing\nKeywords: test, pdf', type: 'metadata' }
        ])
        .mockResolvedValueOnce(['pdf_test.pdf_description_0_123', 'pdf_test.pdf_extracted-text_1_123', 'pdf_test.pdf_metadata_2_123'])

      mockEnv.AI.run.mockResolvedValueOnce({
        response: `DESCRIPTION: Test PDF
EXTRACTED_TEXT: Content
TOPICS: testing
KEYWORDS: test, pdf`
      })

      const result = await (workflow as any).processFile(params, mockStep)

      expect(result).toMatchObject({
        type: 'pdf',
        success: true,
        content: {
          text: 'Content',
          description: 'Test PDF',
          metadata: {
            fileName: 'test.pdf',
            fileType: 'application/pdf',
            fileSize: 1024,
            hasExtractedText: true
          }
        }
      })
      expect(result.vectorIds).toHaveLength(3)
    })

    it('should process image file successfully', async () => {
      const params = {
        fileData: btoa('Image content'),
        fileName: 'test.jpg',
        fileType: 'image/jpeg',
        fileSize: 2048
      }

      mockStep.do
        .mockResolvedValueOnce({
          description: 'A test image',
          extractedText: '',
          topics: 'image',
          keywords: 'test, image',
          hasText: false
        })
        .mockResolvedValueOnce([
          { text: 'A test image', type: 'description' },
          { text: 'Topics: image\nKeywords: test, image', type: 'metadata' }
        ])
        .mockResolvedValueOnce(['image_test.jpg_description_0_123', 'image_test.jpg_metadata_1_123'])

      mockEnv.AI.run.mockResolvedValueOnce({
        response: `DESCRIPTION: A test image
EXTRACTED_TEXT: 
TOPICS: image
KEYWORDS: test, image`
      })

      const result = await (workflow as any).processFile(params, mockStep)

      expect(result.type).toBe('image')
      expect(result.success).toBe(true)
      expect(result.vectorIds).toHaveLength(2)
    })

    it('should handle AI analysis failure', async () => {
      const params = {
        fileData: btoa('PDF content'),
        fileName: 'test.pdf',
        fileType: 'application/pdf',
        fileSize: 1024
      }

      mockEnv.AI.run.mockRejectedValueOnce(new Error('AI service error'))
      
      mockStep.do
        .mockResolvedValueOnce({
          description: 'pdf file: test.pdf',
          extractedText: '',
          topics: '',
          keywords: '',
          hasText: false
        })
        .mockResolvedValueOnce([
          { text: 'pdf file: test.pdf', type: 'description' }
        ])
        .mockResolvedValueOnce(['pdf_test.pdf_description_0_123'])

      const result = await (workflow as any).processFile(params, mockStep)

      expect(result.success).toBe(true)
      expect(result.content.description).toBe('pdf file: test.pdf')
      expect(result.content.text).toBe('')
    })

    it('should handle processing error', async () => {
      const params = {
        fileData: btoa('PDF content'),
        fileName: 'test.pdf',
        fileType: 'application/pdf',
        fileSize: 1024
      }

      mockStep.do.mockRejectedValueOnce(new Error('Processing failed'))

      const result = await (workflow as any).processFile(params, mockStep)

      expect(result).toMatchObject({
        type: 'pdf',
        success: false,
        content: {},
        vectorIds: [],
        error: 'Processing failed'
      })
    })

    it('should handle long text chunking', async () => {
      const longText = 'A'.repeat(2500) // Longer than chunk size (1000)
      const params = {
        fileData: btoa('PDF content'),
        fileName: 'test.pdf',
        fileType: 'application/pdf',
        fileSize: 1024
      }

      mockStep.do
        .mockResolvedValueOnce({
          description: 'Long PDF',
          extractedText: longText,
          topics: 'testing',
          keywords: 'test',
          hasText: true
        })
        .mockResolvedValueOnce([
          { text: 'Long PDF', type: 'description' },
          { text: 'A'.repeat(1000), type: 'extracted-text' },
          { text: 'A'.repeat(1000), type: 'extracted-text' },
          { text: 'A'.repeat(500), type: 'extracted-text' },
          { text: 'Topics: testing\nKeywords: test', type: 'metadata' }
        ])
        .mockResolvedValueOnce([
          'pdf_test.pdf_description_0_123',
          'pdf_test.pdf_extracted-text_1_123',
          'pdf_test.pdf_extracted-text_2_123',
          'pdf_test.pdf_extracted-text_3_123',
          'pdf_test.pdf_metadata_4_123'
        ])

      mockEnv.AI.run.mockResolvedValueOnce({
        response: `DESCRIPTION: Long PDF
EXTRACTED_TEXT: ${longText}
TOPICS: testing
KEYWORDS: test`
      })

      const result = await (workflow as any).processFile(params, mockStep)

      expect(result.success).toBe(true)
      expect(result.vectorIds).toHaveLength(5)
    })

    it('should handle file without description', async () => {
      const params = {
        fileData: btoa('PDF content'),
        fileName: 'test.pdf',
        fileType: 'application/pdf',
        fileSize: 1024
      }

      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'analyze-file-with-gemma') {
            return {
              description: '',
              extractedText: 'Some text',
              topics: 'topics',
              keywords: 'keywords',
              hasText: true
            }
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'prepare-content-chunks') {
            return await fn() // Execute to test the logic
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'vectorize-content') {
            return await fn()
          }
          return fn()
        })

      mockEnv.AI.run.mockResolvedValueOnce({
        response: 'DESCRIPTION: \nEXTRACTED_TEXT: Some text\nTOPICS: topics\nKEYWORDS: keywords'
      })

      const result = await (workflow as any).processFile(params, mockStep)

      expect(result.success).toBe(true)
      // Should only have extracted-text and metadata chunks, no description chunk
      expect(result.vectorIds).toHaveLength(2)
    })

    it('should handle file without topics and keywords', async () => {
      const params = {
        fileData: btoa('PDF content'),
        fileName: 'test.pdf',
        fileType: 'application/pdf',
        fileSize: 1024
      }

      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'analyze-file-with-gemma') {
            return {
              description: 'Test PDF',
              extractedText: 'Content',
              topics: '',
              keywords: '',
              hasText: true
            }
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'prepare-content-chunks') {
            return await fn() // Execute to test the logic
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'vectorize-content') {
            return await fn()
          }
          return fn()
        })

      mockEnv.AI.run.mockResolvedValueOnce({
        response: 'DESCRIPTION: Test PDF\nEXTRACTED_TEXT: Content'
      })

      const result = await (workflow as any).processFile(params, mockStep)

      expect(result.success).toBe(true)
      // Should only have description and extracted-text chunks, no metadata chunk
      expect(result.vectorIds).toHaveLength(2)
    })

    it('should handle file without extracted text', async () => {
      const params = {
        fileData: btoa('Image content'),
        fileName: 'test.jpg',
        fileType: 'image/jpeg',
        fileSize: 2048
      }

      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'analyze-file-with-gemma') {
            return {
              description: 'Test image',
              extractedText: '',
              topics: 'image topics',
              keywords: 'image, test',
              hasText: false
            }
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'prepare-content-chunks') {
            return await fn() // Execute to test the logic
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'vectorize-content') {
            return await fn()
          }
          return fn()
        })

      mockEnv.AI.run.mockResolvedValueOnce({
        response: 'DESCRIPTION: Test image\nEXTRACTED_TEXT: \nTOPICS: image topics\nKEYWORDS: image, test'
      })

      const result = await (workflow as any).processFile(params, mockStep)

      expect(result.success).toBe(true)
      // Should only have description and metadata chunks, no extracted-text chunk
      expect(result.vectorIds).toHaveLength(2)
    })

    it('should handle AI run failure inside step', async () => {
      const params = {
        fileData: btoa('PDF content'),
        fileName: 'test.pdf',
        fileType: 'application/pdf',
        fileSize: 1024
      }

      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'analyze-file-with-gemma') {
            // Execute the callback to test the try-catch inside
            return await fn()
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'prepare-content-chunks') {
            return await fn()
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'vectorize-content') {
            return await fn()
          }
          return fn()
        })

      mockEnv.AI.run.mockRejectedValueOnce(new Error('AI service error'))

      const result = await (workflow as any).processFile(params, mockStep)

      expect(result.success).toBe(true)
      expect(result.content.description).toBe('pdf file: test.pdf')
      expect(result.content.text).toBe('')
    })

    it('should handle text exactly at chunk boundary', async () => {
      const exactBoundaryText = 'B'.repeat(2000) // Exactly 2 chunks of 1000
      const params = {
        fileData: btoa('PDF content'),
        fileName: 'boundary.pdf',
        fileType: 'application/pdf',
        fileSize: 2048
      }

      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'analyze-file-with-gemma') {
            return {
              description: 'Boundary test',
              extractedText: exactBoundaryText,
              topics: 'boundary',
              keywords: 'test',
              hasText: true
            }
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'prepare-content-chunks') {
            return await fn()
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'vectorize-content') {
            return await fn()
          }
          return fn()
        })

      mockEnv.AI.run.mockResolvedValueOnce({
        response: `DESCRIPTION: Boundary test
EXTRACTED_TEXT: ${exactBoundaryText}
TOPICS: boundary
KEYWORDS: test`
      })

      const result = await (workflow as any).processFile(params, mockStep)

      expect(result.success).toBe(true)
      expect(result.vectorIds).toHaveLength(4) // description + 2 text chunks + metadata
    })

    it('should use fallback description when AI returns no description', async () => {
      const params = {
        fileData: btoa('PDF content'),
        fileName: 'test.pdf',
        fileType: 'application/pdf',
        fileSize: 1024
      }

      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'analyze-file-with-gemma') {
            return await fn()
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'prepare-content-chunks') {
            return await fn()
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'vectorize-content') {
            return await fn()
          }
          return fn()
        })

      // AI returns response without description section
      mockEnv.AI.run.mockResolvedValueOnce({
        response: 'EXTRACTED_TEXT: Some content\nTOPICS: test'
      })

      const result = await (workflow as any).processFile(params, mockStep)

      expect(result.success).toBe(true)
      expect(result.content.description).toBe('pdf file: test.pdf')
    })

    it('should handle non-Error exception in catch block', async () => {
      const params = {
        fileData: btoa('PDF content'),
        fileName: 'test.pdf',
        fileType: 'application/pdf',
        fileSize: 1024
      }

      // Throw a non-Error object
      mockStep.do.mockRejectedValueOnce('String error')

      const result = await (workflow as any).processFile(params, mockStep)

      expect(result).toMatchObject({
        type: 'pdf',
        success: false,
        error: 'File processing failed'
      })
    })

    it('should handle image error with proper type', async () => {
      const params = {
        fileData: btoa('Image content'),
        fileName: 'test.jpg',
        fileType: 'image/jpeg',
        fileSize: 2048
      }

      mockStep.do.mockRejectedValueOnce(new Error('Image processing error'))

      const result = await (workflow as any).processFile(params, mockStep)

      expect(result).toMatchObject({
        type: 'image',
        success: false,
        error: 'Image processing error'
      })
    })
  })

  describe('run', () => {
    let mockStep: any

    beforeEach(() => {
      mockStep = {
        do: vi.fn()
      }
    })

    const createMockEvent = (payload: any) => ({
      payload,
      timestamp: new Date()
    })

    it('should handle unsupported file type', async () => {
      const params = {
        fileData: btoa('content'),
        fileName: 'test.txt',
        fileType: 'text/plain',
        fileSize: 100
      }

      const event = createMockEvent(params)
      await expect(workflow.run(event as any, mockStep as any)).rejects.toThrow('Unsupported file type: text/plain')
    })

    it('should process PDF file through run method', async () => {
      const params = {
        fileData: btoa('PDF content'),
        fileName: 'test.pdf',
        fileType: 'application/pdf',
        fileSize: 1024
      }

      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'analyze-file-with-gemma') {
            return await fn()
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'prepare-content-chunks') {
            return await fn()
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'vectorize-content') {
            return await fn()
          }
          return fn()
        })

      mockEnv.AI.run.mockResolvedValueOnce({
        response: 'DESCRIPTION: Test PDF\nEXTRACTED_TEXT: Content'
      })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result.success).toBe(true)
      expect(result.type).toBe('pdf')
    })

    it('should process image file through run method', async () => {
      const params = {
        fileData: btoa('Image content'),
        fileName: 'test.png',
        fileType: 'image/png',
        fileSize: 2048
      }

      mockStep.do
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'analyze-file-with-gemma') {
            return await fn()
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'prepare-content-chunks') {
            return await fn()
          }
          return fn()
        })
        .mockImplementationOnce(async (name: string, fn: () => any) => {
          if (name === 'vectorize-content') {
            return await fn()
          }
          return fn()
        })

      mockEnv.AI.run.mockResolvedValueOnce({
        response: 'DESCRIPTION: Test image\nEXTRACTED_TEXT: '
      })

      const event = createMockEvent(params)
      const result = await workflow.run(event as any, mockStep as any)

      expect(result.success).toBe(true)
      expect(result.type).toBe('image')
    })
  })

  describe('extractTextFromResult', () => {
    it('should extract text from string result', () => {
      const result = (workflow as any).extractTextFromResult('Simple text')
      expect(result).toBe('Simple text')
    })

    it('should extract from response field', () => {
      const result = (workflow as any).extractTextFromResult({ response: 'Text from response' })
      expect(result).toBe('Text from response')
    })

    it('should extract from text field', () => {
      const result = (workflow as any).extractTextFromResult({ text: 'Text from text field' })
      expect(result).toBe('Text from text field')
    })

    it('should extract from description field', () => {
      const result = (workflow as any).extractTextFromResult({ description: 'Text from description' })
      expect(result).toBe('Text from description')
    })

    it('should extract from generated_text field', () => {
      const result = (workflow as any).extractTextFromResult({ generated_text: 'Generated text' })
      expect(result).toBe('Generated text')
    })

    it('should extract from result field', () => {
      const result = (workflow as any).extractTextFromResult({ result: 'Result text' })
      expect(result).toBe('Result text')
    })

    it('should return empty string for null/undefined', () => {
      expect((workflow as any).extractTextFromResult(null)).toBe('')
      expect((workflow as any).extractTextFromResult(undefined)).toBe('')
    })

    it('should return empty string for unknown format', () => {
      expect((workflow as any).extractTextFromResult({ unknown: 'field' })).toBe('')
      expect((workflow as any).extractTextFromResult(123)).toBe('')
    })
  })

  describe('parseAnalysisResponse', () => {
    it('should parse formatted response correctly', () => {
      const response = `DESCRIPTION: This is a description
EXTRACTED_TEXT: This is extracted text
TOPICS: topic1, topic2
KEYWORDS: key1, key2`

      const result = (workflow as any).parseAnalysisResponse(response)
      
      expect(result).toEqual({
        description: 'This is a description',
        extractedText: 'This is extracted text',
        topics: 'topic1, topic2',
        keywords: 'key1, key2'
      })
    })

    it('should handle partial sections', () => {
      const response = `DESCRIPTION: Only description
KEYWORDS: some keywords`

      const result = (workflow as any).parseAnalysisResponse(response)
      
      expect(result).toEqual({
        description: 'Only description',
        keywords: 'some keywords'
      })
    })

    it('should handle unformatted response', () => {
      const response = 'This is just plain text without sections'

      const result = (workflow as any).parseAnalysisResponse(response)
      
      expect(result).toEqual({
        description: 'This is just plain text without sections'
      })
    })

    it('should handle case-insensitive sections', () => {
      const response = `description: lowercase
EXTRACTED_text: mixed case`

      const result = (workflow as any).parseAnalysisResponse(response)
      
      expect(result).toEqual({
        description: 'lowercase',
        extractedText: 'mixed case'
      })
    })

    it('should handle multi-line content', () => {
      const response = `DESCRIPTION: Line 1
Line 2
Line 3
EXTRACTED_TEXT: Text line 1
Text line 2`

      const result = (workflow as any).parseAnalysisResponse(response)
      
      expect(result.description).toBe('Line 1\nLine 2\nLine 3')
      expect(result.extractedText).toBe('Text line 1\nText line 2')
    })
  })
})