import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupWorkflowTest } from '../test-helpers'

// Mock cloudflare:workers
vi.mock('cloudflare:workers', () => ({
  WorkflowEntrypoint: class {
    constructor(public ctx: any, public env: any) {}
  },
  WorkflowStep: {},
  WorkflowEvent: {}
}))

// Import after mocking
import { FileAnalyzer } from '../../../src/workflows/file-analyzer'

describe('FileAnalyzer', () => {
  let analyzer: FileAnalyzer
  let testSetup: ReturnType<typeof setupWorkflowTest>

  beforeEach(() => {
    vi.clearAllMocks()
    testSetup = setupWorkflowTest()
    
    // Add additional env variables
    testSetup.mockEnv.DEFAULT_TEXT_GENERATION_MODEL = 'gemma-7b-it'
    testSetup.mockEnv.AI = testSetup.mockAI
    
    // Mock AI responses
    testSetup.mockAI.run.mockResolvedValue({
      response: 'This is extracted text from the file'
    })

    // Create analyzer instance
    analyzer = new FileAnalyzer(testSetup.mockCtx, testSetup.mockEnv)
  })

  describe('run', () => {
    it('should analyze PDF file successfully', async () => {
      const params = {
        fileName: 'test.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        fileData: btoa('test pdf content'),
        namespace: 'test'
      }

      // Mock step.do to execute the callback and return the analysis result
      testSetup.mockStep.do.mockImplementation(async (name: string, fn: () => any) => {
        // Execute the actual function
        const result = await fn()
        return result
      })

      const event = {
        payload: params,
        timestamp: new Date()
      }

      const result = await analyzer.run(event as any, testSetup.mockStep)

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data.extractedText).toBeTruthy()
      expect(result.data.hasText).toBe(true)
      expect(testSetup.mockStep.do).toHaveBeenCalled()
    })

    it('should analyze image file successfully', async () => {
      const params = {
        fileName: 'test.jpg',
        fileType: 'image/jpeg',
        fileSize: 2048,
        fileData: btoa('test image content'),
        metadata: { source: 'upload' }
      }

      testSetup.mockStep.do.mockImplementation(async (name: string, fn: () => any) => {
        const result = await fn()
        return result
      })

      const event = {
        payload: params,
        timestamp: new Date()
      }

      const result = await analyzer.run(event as any, testSetup.mockStep)

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data.extractedText).toBeTruthy()
      expect(result.data.hasText).toBe(true)
      expect(result.data.metadata?.ai_analyzed).toBe(true)
    })

    it('should handle large files with simple analysis', async () => {
      const params = {
        fileName: 'large.pdf',
        fileType: 'application/pdf',
        fileSize: 3 * 1024 * 1024, // 3MB
        fileData: btoa('large file content')
      }

      testSetup.mockStep.do.mockImplementation(async (name: string, fn: () => any) => {
        const result = await fn()
        return result
      })

      const event = {
        payload: params,
        timestamp: new Date()
      }

      const result = await analyzer.run(event as any, testSetup.mockStep)

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data.extractedText).toContain('large file')
      expect(result.data.metadata?.simplified).toBe(true)
      expect(result.data.metadata?.reason).toBe('file_too_large')
      expect(testSetup.mockAI.run).not.toHaveBeenCalled()
    })

    it('should reject unsupported file types', async () => {
      const params = {
        fileName: 'test.txt',
        fileType: 'text/plain',
        fileSize: 1024,
        fileData: btoa('text content')
      }

      testSetup.mockStep.do.mockImplementation(async (name: string, fn: () => any) => {
        const result = await fn()
        return result
      })

      const event = {
        payload: params,
        timestamp: new Date()
      }

      const result = await analyzer.run(event as any, testSetup.mockStep)
      
      expect(result).toBeDefined()
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unsupported file type')
    })

    it('should extract text from various AI response formats', async () => {
      const testCases = [
        { response: 'Direct text response' },
        { choices: [{ message: { content: 'OpenAI format response' } }] },
        'Simple string response'
      ]

      testSetup.mockStep.do.mockImplementation(async (name: string, fn: () => any) => {
        const result = await fn()
        return result
      })

      for (const responseFormat of testCases) {
        testSetup.mockAI.run.mockResolvedValue(responseFormat)

        const params = {
          fileName: 'test.pdf',
          fileType: 'application/pdf',
          fileSize: 1024,
          fileData: btoa('test content')
        }

        const event = {
          payload: params,
          timestamp: new Date()
        }

        const result = await analyzer.run(event as any, testSetup.mockStep)
        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()
        expect(result.data.extractedText).toBeTruthy()
      }
    })

    it('should include metadata in analysis result', async () => {
      const params = {
        fileName: 'document.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        fileData: btoa('test content'),
        namespace: 'docs',
        metadata: {
          author: 'Test Author',
          category: 'Technical'
        }
      }

      testSetup.mockStep.do.mockImplementation(async (name: string, fn: () => any) => {
        const result = await fn()
        return result
      })

      const event = {
        payload: params,
        timestamp: new Date()
      }

      const result = await analyzer.run(event as any, testSetup.mockStep)

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data.metadata?.ai_analyzed).toBe(true)
      expect(result.data.metadata?.model).toBe('gemma-7b-it')
    })

    it('should handle empty AI response', async () => {
      testSetup.mockAI.run.mockResolvedValue(null)

      const params = {
        fileName: 'test.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        fileData: btoa('test content')
      }

      testSetup.mockStep.do.mockImplementation(async (name: string, fn: () => any) => {
        const result = await fn()
        return result
      })

      const event = {
        payload: params,
        timestamp: new Date()
      }

      // Should use simple analysis when AI returns null
      const result = await analyzer.run(event as any, testSetup.mockStep)
      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data.extractedText).toBeTruthy()
      expect(result.data.metadata?.simplified).toBe(true)
    })
  })
})