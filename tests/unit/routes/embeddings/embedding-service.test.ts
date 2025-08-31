import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EmbeddingService } from '../../../../src/routes/api/embeddings/embedding-service'
import { AppError, ErrorCodes } from '../../../../src/utils/error-handler'
import { createMockEnv } from '../../test-helpers'

// Mock AIEmbeddings Durable Object
const mockGenerateEmbedding = vi.fn()
const mockGenerateBatchEmbeddings = vi.fn()
const mockGetEmbeddingStatus = vi.fn()
const mockScheduleEmbedding = vi.fn()
const mockGetAvailableModels = vi.fn()
const mockCancelEmbedding = vi.fn()
const mockGetStatistics = vi.fn()

const mockAIEmbeddings = {
  generateEmbedding: mockGenerateEmbedding,
  generateBatchEmbeddings: mockGenerateBatchEmbeddings,
  getEmbeddingStatus: mockGetEmbeddingStatus,
  scheduleEmbedding: mockScheduleEmbedding,
  getAvailableModels: mockGetAvailableModels,
  cancelEmbedding: mockCancelEmbedding,
  getStatistics: mockGetStatistics
}

const mockDurableObjectStub = {
  get: vi.fn().mockReturnValue(mockAIEmbeddings),
  idFromName: vi.fn().mockReturnValue('mock-id')
}

vi.mock('../../../../src/middleware/logging', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  })
}))

describe('EmbeddingService', () => {
  let service: EmbeddingService
  let mockEnv: Env

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockEnv = createMockEnv({
      DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
      AI_EMBEDDINGS: mockDurableObjectStub as any
    })

    service = new EmbeddingService(mockEnv)
  })

  describe('generateEmbedding', () => {
    it('should generate embedding successfully', async () => {
      const mockResult = {
        workflowId: 'workflow-123',
        status: 'queued' as const,
        model: '@cf/baai/bge-base-en-v1.5',
        startedAt: '2024-01-01T00:00:00Z'
      }

      mockGenerateEmbedding.mockResolvedValue(mockResult)

      const result = await service.generateEmbedding('test text')

      expect(result).toEqual(mockResult)
      expect(mockGenerateEmbedding).toHaveBeenCalledWith(
        'test text',
        '@cf/baai/bge-base-en-v1.5'
      )
    })

    it('should use custom model when provided', async () => {
      const mockResult = {
        workflowId: 'workflow-124',
        status: 'queued' as const,
        model: 'custom-model'
      }

      mockGenerateEmbedding.mockResolvedValue(mockResult)

      await service.generateEmbedding('test text', 'custom-model')

      expect(mockGenerateEmbedding).toHaveBeenCalledWith(
        'test text',
        'custom-model'
      )
    })

    it('should handle embedding generation errors', async () => {
      mockGenerateEmbedding.mockRejectedValue(new Error('AI service error'))

      await expect(service.generateEmbedding('test text')).rejects.toThrow(AppError)
      await expect(service.generateEmbedding('test text')).rejects.toThrow('Failed to generate embedding: AI service error')
    })

    it('should handle non-Error exceptions', async () => {
      mockGenerateEmbedding.mockRejectedValue('String error')

      await expect(service.generateEmbedding('test text')).rejects.toThrow(AppError)
      await expect(service.generateEmbedding('test text')).rejects.toThrow('Failed to generate embedding: Unknown error')
    })
  })

  describe('generateBatchEmbeddings', () => {
    it('should generate batch embeddings successfully', async () => {
      const mockResult = {
        batchId: 'batch-123',
        workflowIds: ['workflow-1', 'workflow-2'],
        textsCount: 2,
        status: 'queued' as const,
        startedAt: '2024-01-01T00:00:00Z'
      }

      mockGenerateBatchEmbeddings.mockResolvedValue(mockResult)

      const result = await service.generateBatchEmbeddings(['text1', 'text2'])

      expect(result).toEqual(mockResult)
      expect(mockGenerateBatchEmbeddings).toHaveBeenCalledWith(
        ['text1', 'text2'],
        '@cf/baai/bge-base-en-v1.5',
        {
          batchSize: 10,
          saveToVectorize: false,
          namespace: undefined,
          metadata: undefined
        }
      )
    })

    it('should use custom options', async () => {
      const mockResult = {
        batchId: 'batch-124',
        workflowIds: ['workflow-3'],
        textsCount: 1,
        status: 'queued' as const
      }

      mockGenerateBatchEmbeddings.mockResolvedValue(mockResult)

      await service.generateBatchEmbeddings(['text1'], 'custom-model', {
        batchSize: 5,
        saveToVectorize: true,
        namespace: 'test-namespace',
        metadata: { source: 'test' }
      })

      expect(mockGenerateBatchEmbeddings).toHaveBeenCalledWith(
        ['text1'],
        'custom-model',
        {
          batchSize: 5,
          saveToVectorize: true,
          namespace: 'test-namespace',
          metadata: { source: 'test' }
        }
      )
    })

    it('should validate empty texts array', async () => {
      await expect(service.generateBatchEmbeddings([])).rejects.toThrow(AppError)
      await expect(service.generateBatchEmbeddings([])).rejects.toThrow('No texts provided for batch embedding')
    })

    it('should validate null texts', async () => {
      await expect(service.generateBatchEmbeddings(null as any)).rejects.toThrow(AppError)
    })

    it('should validate batch size limit', async () => {
      const largeTexts = Array.from({ length: 101 }, (_, i) => `text-${i}`)
      
      await expect(service.generateBatchEmbeddings(largeTexts)).rejects.toThrow(AppError)
      await expect(service.generateBatchEmbeddings(largeTexts)).rejects.toThrow('Batch size exceeds maximum limit of 100')
    })

    it('should handle AppError from durable object', async () => {
      const appError = new AppError(ErrorCodes.VALIDATION_ERROR, 'Test error', 400)
      mockGenerateBatchEmbeddings.mockRejectedValue(appError)

      await expect(service.generateBatchEmbeddings(['text1'])).rejects.toBe(appError)
    })

    it('should handle non-AppError exceptions', async () => {
      mockGenerateBatchEmbeddings.mockRejectedValue(new Error('Service error'))

      await expect(service.generateBatchEmbeddings(['text1'])).rejects.toThrow(AppError)
      await expect(service.generateBatchEmbeddings(['text1'])).rejects.toThrow('Failed to generate batch embeddings: Service error')
    })
  })

  describe('getEmbeddingStatus', () => {
    it('should get embedding status successfully', async () => {
      const mockStatus = {
        workflowId: 'workflow-123',
        status: 'completed' as const,
        embedding: [0.1, 0.2, 0.3],
        model: '@cf/baai/bge-base-en-v1.5',
        completedAt: '2024-01-01T00:05:00Z'
      }

      mockGetEmbeddingStatus.mockResolvedValue(mockStatus)

      const result = await service.getEmbeddingStatus('workflow-123')

      expect(result).toEqual(mockStatus)
      expect(mockGetEmbeddingStatus).toHaveBeenCalledWith('workflow-123')
    })

    it('should handle workflow not found', async () => {
      mockGetEmbeddingStatus.mockResolvedValue(null)

      await expect(service.getEmbeddingStatus('nonexistent')).rejects.toThrow(AppError)
      await expect(service.getEmbeddingStatus('nonexistent')).rejects.toThrow('Workflow not found: nonexistent')
    })

    it('should handle AppError from durable object', async () => {
      const appError = new AppError(ErrorCodes.INTERNAL_ERROR, 'Service unavailable', 503)
      mockGetEmbeddingStatus.mockRejectedValue(appError)

      await expect(service.getEmbeddingStatus('workflow-123')).rejects.toBe(appError)
    })

    it('should handle non-AppError exceptions', async () => {
      mockGetEmbeddingStatus.mockRejectedValue(new Error('Connection error'))

      await expect(service.getEmbeddingStatus('workflow-123')).rejects.toThrow(AppError)
      await expect(service.getEmbeddingStatus('workflow-123')).rejects.toThrow('Failed to get embedding status: Connection error')
    })
  })

  describe('scheduleEmbedding', () => {
    it('should schedule embedding successfully', async () => {
      const scheduleAt = new Date('2024-12-01T10:00:00Z')
      const mockJob = {
        id: 'job-123',
        type: 'single' as const,
        status: 'pending' as const,
        model: '@cf/baai/bge-base-en-v1.5',
        createdAt: '2024-01-01T00:00:00Z'
      }

      mockScheduleEmbedding.mockResolvedValue(mockJob)

      const result = await service.scheduleEmbedding('test text', scheduleAt)

      expect(result).toEqual(mockJob)
      expect(mockScheduleEmbedding).toHaveBeenCalledWith(
        'test text',
        scheduleAt,
        '@cf/baai/bge-base-en-v1.5',
        {}
      )
    })

    it('should schedule embedding with custom options', async () => {
      const scheduleAt = new Date('2024-12-01T10:00:00Z')
      const mockJob = {
        id: 'job-124',
        type: 'single' as const,
        status: 'pending' as const,
        model: 'custom-model',
        createdAt: '2024-01-01T00:00:00Z'
      }

      mockScheduleEmbedding.mockResolvedValue(mockJob)

      await service.scheduleEmbedding('test text', scheduleAt, 'custom-model', {
        namespace: 'test-ns',
        metadata: { priority: 1 },
        priority: 5
      })

      expect(mockScheduleEmbedding).toHaveBeenCalledWith(
        'test text',
        scheduleAt,
        'custom-model',
        {
          namespace: 'test-ns',
          metadata: { priority: 1 },
          priority: 5
        }
      )
    })

    it('should handle scheduling errors', async () => {
      const scheduleAt = new Date('2024-12-01T10:00:00Z')
      mockScheduleEmbedding.mockRejectedValue(new Error('Scheduler error'))

      await expect(service.scheduleEmbedding('test text', scheduleAt)).rejects.toThrow(AppError)
      await expect(service.scheduleEmbedding('test text', scheduleAt)).rejects.toThrow('Failed to schedule embedding: Scheduler error')
    })
  })

  describe('getAvailableModels', () => {
    it('should get available models successfully', async () => {
      const mockModels = [
        {
          id: '@cf/baai/bge-base-en-v1.5',
          name: 'BGE Base EN v1.5',
          dimensions: 768,
          maxTokens: 512,
          supported: true
        },
        {
          id: '@cf/baai/bge-small-en-v1.5',
          name: 'BGE Small EN v1.5',
          dimensions: 384,
          maxTokens: 512,
          supported: true
        }
      ]

      mockGetAvailableModels.mockResolvedValue(mockModels)

      const result = await service.getAvailableModels()

      expect(result).toEqual({
        models: mockModels,
        defaultModel: '@cf/baai/bge-base-en-v1.5'
      })
      expect(mockGetAvailableModels).toHaveBeenCalled()
    })

    it('should handle model retrieval errors', async () => {
      mockGetAvailableModels.mockRejectedValue(new Error('Models service error'))

      await expect(service.getAvailableModels()).rejects.toThrow(AppError)
      await expect(service.getAvailableModels()).rejects.toThrow('Failed to get available models: Models service error')
    })
  })

  describe('cancelEmbedding', () => {
    it('should cancel embedding successfully', async () => {
      mockCancelEmbedding.mockResolvedValue(true)

      const result = await service.cancelEmbedding('workflow-123')

      expect(result).toBe(true)
      expect(mockCancelEmbedding).toHaveBeenCalledWith('workflow-123')
    })

    it('should handle failed cancellation', async () => {
      mockCancelEmbedding.mockResolvedValue(false)

      const result = await service.cancelEmbedding('workflow-123')

      expect(result).toBe(false)
    })

    it('should handle cancellation errors', async () => {
      mockCancelEmbedding.mockRejectedValue(new Error('Cancellation error'))

      await expect(service.cancelEmbedding('workflow-123')).rejects.toThrow(AppError)
      await expect(service.cancelEmbedding('workflow-123')).rejects.toThrow('Failed to cancel embedding: Cancellation error')
    })
  })

  describe('getEmbeddingStats', () => {
    it('should get embedding statistics successfully', async () => {
      const mockStats = {
        totalGenerated: 100,
        totalFailed: 5,
        averageProcessingTime: 1500,
        modelsUsed: {
          '@cf/baai/bge-base-en-v1.5': 80,
          '@cf/baai/bge-small-en-v1.5': 20
        },
        lastGeneratedAt: '2024-01-01T12:00:00Z'
      }

      mockGetStatistics.mockResolvedValue(mockStats)

      const result = await service.getEmbeddingStats()

      expect(result).toEqual(mockStats)
      expect(mockGetStatistics).toHaveBeenCalled()
    })

    it('should handle statistics errors gracefully', async () => {
      mockGetStatistics.mockRejectedValue(new Error('Stats service error'))

      const result = await service.getEmbeddingStats()

      expect(result).toEqual({
        totalGenerated: 0,
        totalFailed: 0,
        averageProcessingTime: 0,
        modelsUsed: {}
      })
    })

    it('should handle undefined lastGeneratedAt', async () => {
      const mockStats = {
        totalGenerated: 50,
        totalFailed: 2,
        averageProcessingTime: 1200,
        modelsUsed: {
          '@cf/baai/bge-base-en-v1.5': 50
        }
      }

      mockGetStatistics.mockResolvedValue(mockStats)

      const result = await service.getEmbeddingStats()

      expect(result.lastGeneratedAt).toBeUndefined()
    })
  })

  describe('constructor', () => {
    it('should initialize EmbeddingService with correct dependencies', () => {
      expect(service).toBeInstanceOf(EmbeddingService)
      expect(mockDurableObjectStub.idFromName).toHaveBeenCalledWith('default')
      expect(mockDurableObjectStub.get).toHaveBeenCalledWith('mock-id')
    })
  })
})