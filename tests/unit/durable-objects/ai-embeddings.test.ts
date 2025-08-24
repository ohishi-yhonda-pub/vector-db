import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AIEmbeddings } from '../../../src/durable-objects/ai-embeddings'

// Mock the Agent class
vi.mock('agents', () => ({
  Agent: class {
    constructor(public ctx: any, public env: any) {
      this.state = { jobs: {} }
    }
    state: any
    setState(newState: any) {
      this.state = { ...this.state, ...newState }
    }
  }
}))

describe('AIEmbeddings Durable Object', () => {
  let aiEmbeddings: AIEmbeddings
  let mockCtx: any
  let mockEnv: any
  let mockWorkflow: any

  beforeEach(() => {
    mockWorkflow = {
      id: 'workflow-123',
      status: vi.fn().mockResolvedValue({ status: 'running' })
    }

    mockEnv = {
      DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
      BATCH_EMBEDDINGS_WORKFLOW: {
        create: vi.fn().mockResolvedValue(mockWorkflow),
        get: vi.fn().mockResolvedValue(mockWorkflow)
      }
    }

    mockCtx = {
      storage: {
        get: vi.fn(),
        put: vi.fn()
      }
    }

    aiEmbeddings = new AIEmbeddings(mockCtx, mockEnv)
  })

  describe('constructor', () => {
    it('should initialize with correct initial state', () => {
      expect(aiEmbeddings.initialState).toEqual({ jobs: {} })
      expect(aiEmbeddings.state).toEqual({ jobs: {} })
    })
  })

  describe('generateEmbedding', () => {
    it('should create workflow for single text embedding', async () => {
      const text = 'Test text'
      const result = await aiEmbeddings.generateEmbedding(text)

      expect(mockEnv.BATCH_EMBEDDINGS_WORKFLOW.create).toHaveBeenCalledWith({
        id: expect.stringContaining('single_'),
        params: {
          texts: [text],
          model: '@cf/baai/bge-base-en-v1.5',
          batchSize: 1,
          saveToVectorize: false
        }
      })

      expect(result).toEqual({
        jobId: expect.stringContaining('single_'),
        workflowId: 'workflow-123',
        status: 'processing'
      })

      expect(aiEmbeddings.state.jobs).toHaveProperty(result.jobId)
      expect(aiEmbeddings.state.jobs[result.jobId]).toMatchObject({
        texts: [text],
        status: 'pending',
        createdAt: expect.any(String)
      })
    })

    it('should use custom model when provided', async () => {
      const text = 'Test text'
      const customModel = '@cf/baai/bge-large-en-v1.5'
      
      await aiEmbeddings.generateEmbedding(text, customModel)

      expect(mockEnv.BATCH_EMBEDDINGS_WORKFLOW.create).toHaveBeenCalledWith({
        id: expect.stringContaining('single_'),
        params: {
          texts: [text],
          model: customModel,
          batchSize: 1,
          saveToVectorize: false
        }
      })
    })
  })

  describe('scheduleBatchEmbeddings', () => {
    it('should create workflow for batch embeddings with default options', async () => {
      const texts = ['Text 1', 'Text 2', 'Text 3']
      const result = await aiEmbeddings.scheduleBatchEmbeddings(texts)

      expect(mockEnv.BATCH_EMBEDDINGS_WORKFLOW.create).toHaveBeenCalledWith({
        id: expect.stringContaining('batch_'),
        params: {
          texts,
          model: '@cf/baai/bge-base-en-v1.5',
          batchSize: 10,
          saveToVectorize: false
        }
      })

      expect(result).toEqual({
        jobId: expect.stringContaining('batch_'),
        workflowId: 'workflow-123',
        status: 'scheduled',
        textsCount: 3
      })
    })

    it('should use custom options when provided', async () => {
      const texts = ['Text 1', 'Text 2']
      const customModel = '@cf/baai/bge-small-en-v1.5'
      const options = {
        batchSize: 5,
        saveToVectorize: true,
        delayMs: 1000
      }

      const result = await aiEmbeddings.scheduleBatchEmbeddings(texts, customModel, options)

      expect(mockEnv.BATCH_EMBEDDINGS_WORKFLOW.create).toHaveBeenCalledWith({
        id: expect.stringContaining('batch_'),
        params: {
          texts,
          model: customModel,
          batchSize: 5,
          saveToVectorize: true
        }
      })

      expect(aiEmbeddings.state.jobs[result.jobId]).toMatchObject({
        texts,
        model: customModel,
        options,
        status: 'pending'
      })
    })
  })

  describe('getJobStatus', () => {
    it('should return job status when job exists', async () => {
      const jobId = 'test-job-123'
      const job = {
        texts: ['Test'],
        model: '@cf/baai/bge-base-en-v1.5',
        options: {},
        status: 'completed' as const,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      }

      aiEmbeddings.state.jobs[jobId] = job

      const result = await aiEmbeddings.getJobStatus(jobId)
      expect(result).toEqual(job)
    })

    it('should return undefined when job does not exist', async () => {
      const result = await aiEmbeddings.getJobStatus('non-existent-job')
      expect(result).toBeUndefined()
    })
  })

  describe('getWorkflowStatus', () => {
    it('should fetch and return workflow status', async () => {
      const workflowId = 'workflow-456'
      const expectedStatus = { status: 'completed', output: {} }
      
      mockWorkflow.status.mockResolvedValueOnce(expectedStatus)

      const result = await aiEmbeddings.getWorkflowStatus(workflowId)
      
      expect(mockEnv.BATCH_EMBEDDINGS_WORKFLOW.get).toHaveBeenCalledWith(workflowId)
      expect(result).toEqual(expectedStatus)
    })
  })

  describe('generateBatchEmbeddings', () => {
    it('should create workflow for batch processing', async () => {
      const texts = ['Text 1', 'Text 2', 'Text 3', 'Text 4']
      const result = await aiEmbeddings.generateBatchEmbeddings(texts)

      expect(mockEnv.BATCH_EMBEDDINGS_WORKFLOW.create).toHaveBeenCalledWith({
        id: expect.stringContaining('batch_'),
        params: {
          texts,
          model: '@cf/baai/bge-base-en-v1.5',
          batchSize: 10,
          saveToVectorize: false
        }
      })

      expect(result).toEqual({
        jobId: expect.stringContaining('batch_'),
        workflowId: 'workflow-123',
        status: 'processing',
        textsCount: 4
      })
    })

    it('should use custom model and options', async () => {
      const texts = ['Text 1', 'Text 2']
      const customModel = '@cf/baai/bge-large-en-v1.5'
      const options = {
        batchSize: 20,
        saveToVectorize: true
      }

      const result = await aiEmbeddings.generateBatchEmbeddings(texts, customModel, options)

      expect(mockEnv.BATCH_EMBEDDINGS_WORKFLOW.create).toHaveBeenCalledWith({
        id: expect.stringContaining('batch_'),
        params: {
          texts,
          model: customModel,
          batchSize: 20,
          saveToVectorize: true
        }
      })

      expect(aiEmbeddings.state.jobs[result.jobId]).toMatchObject({
        texts,
        model: customModel,
        options,
        status: 'pending'
      })
    })
  })

  describe('getAvailableModels', () => {
    it('should return list of available embedding models', async () => {
      const models = await aiEmbeddings.getAvailableModels()

      expect(models).toHaveLength(3)
      expect(models[0]).toEqual({
        name: '@cf/baai/bge-base-en-v1.5',
        description: 'BAAI General Embedding - English v1.5',
        dimensions: 768,
        maxTokens: 512,
        recommended: true
      })
      expect(models[1]).toEqual({
        name: '@cf/baai/bge-small-en-v1.5',
        description: 'BAAI General Embedding Small - English v1.5',
        dimensions: 384,
        maxTokens: 512,
        recommended: false
      })
      expect(models[2]).toEqual({
        name: '@cf/baai/bge-large-en-v1.5',
        description: 'BAAI General Embedding Large - English v1.5',
        dimensions: 1024,
        maxTokens: 512,
        recommended: false
      })
    })
  })
})