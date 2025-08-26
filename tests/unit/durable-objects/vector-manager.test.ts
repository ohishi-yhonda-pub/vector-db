import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VectorManager } from '../../../src/durable-objects/vector-manager'

// Mock the Agent class
vi.mock('agents', () => ({
  Agent: class {
    constructor(public ctx: any, public env: any) {
      this.state = {
        searchHistory: [],
        vectorJobs: {},
        fileProcessingJobs: {}
      }
    }
    state: any
    setState(newState: any) {
      this.state = { ...this.state, ...newState }
    }
  }
}))

describe('VectorManager Durable Object', () => {
  // Mock Date.now to return incrementing values
  let mockDateNow = 1000000000000

  let vectorManager: VectorManager
  let mockCtx: any
  let mockEnv: any
  let mockVectorizeIndex: any
  let mockWorkflow: any
  let jobCounter = 0

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, 'now').mockImplementation(() => mockDateNow++)
    jobCounter = 0

    mockWorkflow = {
      id: 'workflow-123',
      status: vi.fn().mockResolvedValue({ status: 'running' })
    }

    mockVectorizeIndex = {
      insert: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({
        matches: [{ id: 'vec-1', score: 0.95 }]
      }),
      getByIds: vi.fn().mockResolvedValue([
        { id: 'vec-1', values: [0.1, 0.2, 0.3], namespace: 'default', metadata: {} }
      ]),
      deleteByIds: vi.fn().mockResolvedValue({ count: 1 }),
      upsert: vi.fn().mockResolvedValue(undefined)
    }

    mockEnv = {
      VECTORIZE_INDEX: mockVectorizeIndex,
      EMBEDDINGS_WORKFLOW: {
        create: vi.fn().mockResolvedValue({
          get: vi.fn().mockResolvedValue({
            success: true,
            embedding: [0.1, 0.2, 0.3],
            model: '@cf/baai/bge-base-en-v1.5'
          })
        })
      },
      VECTOR_OPERATIONS_WORKFLOW: {
        create: vi.fn().mockResolvedValue(mockWorkflow),
        get: vi.fn().mockResolvedValue(mockWorkflow)
      },
      FILE_PROCESSING_WORKFLOW: {
        create: vi.fn().mockResolvedValue(mockWorkflow),
        get: vi.fn().mockResolvedValue(mockWorkflow)
      },
      DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5'
    }

    mockCtx = {
      storage: {
        get: vi.fn(),
        put: vi.fn()
      },
      waitUntil: vi.fn()
    }

    vectorManager = new VectorManager(mockCtx, mockEnv)
  })

  describe('constructor', () => {
    it('should initialize with correct initial state', () => {
      expect(vectorManager.initialState).toEqual({
        searchHistory: [],
        vectorJobs: {},
        fileProcessingJobs: {}
      })
      expect((vectorManager as any).vectorizeIndex).toBe(mockVectorizeIndex)
    })
  })

  describe('insertVectors', () => {
    it('should insert vectors using vectorize index', async () => {
      const vectors = [
        { id: 'vec-1', values: [0.1, 0.2, 0.3], namespace: 'test' }
      ]

      await vectorManager.insertVectors(vectors)

      expect(mockVectorizeIndex.insert).toHaveBeenCalledWith(vectors)
    })
  })

  describe('queryVectors', () => {
    it('should query vectors and track search history', async () => {
      const queryVector = [0.1, 0.2, 0.3]
      const options = { topK: 5, namespace: 'test' }

      const results = await vectorManager.queryVectors(queryVector, options)

      expect(mockVectorizeIndex.query).toHaveBeenCalledWith(queryVector, options)
      expect(results).toEqual({ matches: [{ id: 'vec-1', score: 0.95 }] })
      expect(mockCtx.waitUntil).toHaveBeenCalled()
    })
  })

  describe('trackSearch', () => {
    it('should track search history', async () => {
      const query = Array.from({ length: 20 }, (_, i) => i * 0.1)
      const results = {
        matches: [
          { id: 'vec-1', score: 0.95 },
          { id: 'vec-2', score: 0.85 }
        ]
      }

      await (vectorManager as any).trackSearch(query, results)

      const history = await vectorManager.getSearchHistory()
      expect(history).toHaveLength(1)
      expect(history[0]).toMatchObject({
        timestamp: expect.any(String),
        queryVector: query.slice(0, 10), // Only first 10 dimensions
        resultCount: 2,
        topScore: 0.95
      })
    })

    it('should limit search history to 100 entries', async () => {
      // Add 101 entries
      for (let i = 0; i < 101; i++) {
        await (vectorManager as any).trackSearch([i], { matches: [] })
      }

      const history = await vectorManager.getSearchHistory()
      expect(history).toHaveLength(100)
      expect(history[0].queryVector[0]).toBe(1) // First entry was removed
    })
  })

  describe('getVectorsByIds', () => {
    it('should get vectors by IDs', async () => {
      const ids = ['vec-1', 'vec-2']
      const vectors = await vectorManager.getVectorsByIds(ids)

      expect(mockVectorizeIndex.getByIds).toHaveBeenCalledWith(ids)
      expect(vectors).toEqual([
        { id: 'vec-1', values: [0.1, 0.2, 0.3], namespace: 'default', metadata: {} }
      ])
    })
  })

  describe('deleteVectorsByIds', () => {
    it('should delete vectors by IDs', async () => {
      const ids = ['vec-1', 'vec-2']
      const result = await vectorManager.deleteVectorsByIds(ids)

      expect(mockVectorizeIndex.deleteByIds).toHaveBeenCalledWith(ids)
      expect(result).toEqual({ count: 1 })
    })
  })

  describe('upsertVectors', () => {
    it('should upsert vectors', async () => {
      const vectors = [
        { id: 'vec-1', values: [0.1, 0.2, 0.3], namespace: 'test' }
      ]

      await vectorManager.upsertVectors(vectors)

      expect(mockVectorizeIndex.upsert).toHaveBeenCalledWith(vectors)
    })
  })

  describe('findSimilar', () => {
    it('should find similar vectors', async () => {
      const vectorId = 'vec-1'
      const options = { topK: 5, namespace: 'test' }

      const results = await vectorManager.findSimilar(vectorId, options)

      expect(mockVectorizeIndex.getByIds).toHaveBeenCalledWith([vectorId])
      expect(mockVectorizeIndex.query).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3],
        expect.objectContaining({
          topK: 5,
          namespace: 'test',
          returnMetadata: true
        })
      )
      expect(results).toEqual({ matches: [{ id: 'vec-1', score: 0.95 }] })
    })

    it('should handle undefined options in findSimilar', async () => {
      const vectorId = 'vec-1'

      const results = await vectorManager.findSimilar(vectorId, undefined)

      expect(mockVectorizeIndex.query).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3],
        expect.objectContaining({
          topK: 10,
          namespace: 'default',
          returnMetadata: true
        })
      )
      expect(results).toEqual({ matches: [{ id: 'vec-1', score: 0.95 }] })
    })

    it('should exclude self when excludeSelf is true', async () => {
      const vectorId = 'vec-1'
      mockVectorizeIndex.query.mockResolvedValueOnce({
        matches: [
          { id: 'vec-1', score: 1.0 },
          { id: 'vec-2', score: 0.95 },
          { id: 'vec-3', score: 0.90 }
        ]
      })

      const results = await vectorManager.findSimilar(vectorId, {
        topK: 2,
        excludeSelf: true
      })

      expect(results.matches).toHaveLength(2)
      expect(results.matches[0].id).toBe('vec-2')
      expect(results.matches[1].id).toBe('vec-3')
    })

    it('should use default topK when not specified with excludeSelf', async () => {
      const vectorId = 'vec-1'
      mockVectorizeIndex.query.mockResolvedValueOnce({
        matches: Array.from({ length: 12 }, (_, i) => ({
          id: `vec-${i}`,
          score: 1.0 - i * 0.05
        }))
      })

      const results = await vectorManager.findSimilar(vectorId, {
        excludeSelf: true
      })

      expect(mockVectorizeIndex.query).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3],
        expect.objectContaining({ topK: 11 })
      )
      expect(results.matches).toHaveLength(10)
      expect(results.matches.every(m => m.id !== vectorId)).toBe(true)
    })

    it('should throw error if vector not found', async () => {
      mockVectorizeIndex.getByIds.mockResolvedValueOnce([])

      await expect(vectorManager.findSimilar('non-existent')).rejects.toThrow(
        'Vector non-existent not found'
      )
    })
  })

  describe('batchQuery', () => {
    it('should perform batch queries', async () => {
      const queries = [
        { vector: [0.1, 0.2], options: { topK: 3 } },
        { vector: [0.3, 0.4], options: { topK: 5 } }
      ]

      mockVectorizeIndex.query
        .mockResolvedValueOnce({ matches: [{ id: 'vec-1', score: 0.9 }] })
        .mockResolvedValueOnce({ matches: [{ id: 'vec-2', score: 0.8 }] })

      const results = await vectorManager.batchQuery(queries)

      expect(results).toHaveLength(2)
      expect(mockVectorizeIndex.query).toHaveBeenCalledTimes(2)
      expect(mockVectorizeIndex.query).toHaveBeenCalledWith([0.1, 0.2], { topK: 3 })
      expect(mockVectorizeIndex.query).toHaveBeenCalledWith([0.3, 0.4], { topK: 5 })
    })
  })

  describe('createVectorAsync', () => {
    it('should create vector asynchronously using workflow', async () => {
      const text = 'Test text'
      const model = 'test-model'
      const namespace = 'test-namespace'
      const metadata = { key: 'value' }

      const result = await vectorManager.createVectorAsync(text, model, namespace, metadata)

      // Should first call EMBEDDINGS_WORKFLOW to generate embedding
      expect(mockEnv.EMBEDDINGS_WORKFLOW.create).toHaveBeenCalledWith({
        id: expect.stringContaining('embed_vec_create_'),
        params: {
          text,
          model
        }
      })

      // Then call VECTOR_OPERATIONS_WORKFLOW with the embedding
      expect(mockEnv.VECTOR_OPERATIONS_WORKFLOW.create).toHaveBeenCalledWith({
        id: expect.stringContaining('vec_create_'),
        params: {
          type: 'create',
          embedding: [0.1, 0.2, 0.3],
          namespace,
          metadata: {
            ...metadata,
            text,
            model: '@cf/baai/bge-base-en-v1.5'
          }
        }
      })

      expect(result).toEqual({
        jobId: expect.stringContaining('vec_create_'),
        workflowId: 'workflow-123',
        status: 'processing'
      })

      expect(vectorManager.state.vectorJobs[result.jobId]).toMatchObject({
        type: 'create',
        status: 'pending',
        text,
        model,
        namespace,
        metadata
      })
    })

    it('should handle embedding generation failure', async () => {
      const text = 'Test text'
      
      // Mock embedding generation to fail
      mockEnv.EMBEDDINGS_WORKFLOW.create.mockResolvedValueOnce({
        get: vi.fn().mockResolvedValue({
          success: false,
          error: 'Failed to generate embedding'
        })
      })

      await expect(vectorManager.createVectorAsync(text)).rejects.toThrow(
        'Failed to generate embedding: Failed to generate embedding'
      )
      
      // Should not call VECTOR_OPERATIONS_WORKFLOW when embedding fails
      expect(mockEnv.VECTOR_OPERATIONS_WORKFLOW.create).not.toHaveBeenCalled()
    })

    it('should handle embedding generation failure without error message', async () => {
      const text = 'Test text'
      
      // Mock embedding generation to fail without error message
      mockEnv.EMBEDDINGS_WORKFLOW.create.mockResolvedValueOnce({
        get: vi.fn().mockResolvedValue({
          success: false
          // No error field
        })
      })

      await expect(vectorManager.createVectorAsync(text)).rejects.toThrow(
        'Failed to generate embedding: Unknown error'
      )
      
      // Should not call VECTOR_OPERATIONS_WORKFLOW when embedding fails
      expect(mockEnv.VECTOR_OPERATIONS_WORKFLOW.create).not.toHaveBeenCalled()
    })
  })

  describe('deleteVectorsAsync', () => {
    it('should delete vectors asynchronously using workflow', async () => {
      const vectorIds = ['vec-1', 'vec-2', 'vec-3']

      const result = await vectorManager.deleteVectorsAsync(vectorIds)

      expect(mockEnv.VECTOR_OPERATIONS_WORKFLOW.create).toHaveBeenCalledWith({
        id: expect.stringContaining('vec_delete_'),
        params: {
          type: 'delete',
          vectorIds
        }
      })

      expect(result).toEqual({
        jobId: expect.stringContaining('vec_delete_'),
        workflowId: 'workflow-123',
        status: 'processing'
      })

      expect(vectorManager.state.vectorJobs[result.jobId]).toMatchObject({
        type: 'delete',
        status: 'pending',
        vectorIds
      })
    })
  })

  describe('getWorkflowStatus', () => {
    it('should get workflow status', async () => {
      const expectedStatus = { status: 'completed', output: { success: true } }
      mockWorkflow.status.mockResolvedValueOnce(expectedStatus)

      const status = await vectorManager.getWorkflowStatus('workflow-123')

      expect(mockEnv.VECTOR_OPERATIONS_WORKFLOW.get).toHaveBeenCalledWith('workflow-123')
      expect(status).toEqual(expectedStatus)
    })
  })

  describe('job management', () => {
    it('should get job status', async () => {
      // Create test jobs
      await vectorManager.createVectorAsync('text1')
      const { jobId } = await vectorManager.createVectorAsync('text2')

      const job = await vectorManager.getJobStatus(jobId)
      expect(job).toBeDefined()
      expect(job?.id).toBe(jobId)
    })

    it('should get all jobs', async () => {
      // Create test jobs
      await vectorManager.createVectorAsync('text1')
      await vectorManager.createVectorAsync('text2')
      await vectorManager.deleteVectorsAsync(['vec-3'])

      const jobs = await vectorManager.getAllJobs()
      expect(jobs).toHaveLength(3)
      expect(jobs.filter(j => j.type === 'create')).toHaveLength(2)
      expect(jobs.filter(j => j.type === 'delete')).toHaveLength(1)
    })

    it('should cleanup old jobs', async () => {
      // Create test jobs
      await vectorManager.createVectorAsync('text1')
      await vectorManager.createVectorAsync('text2')
      await vectorManager.deleteVectorsAsync(['vec-3'])

      // Make jobs old
      const jobs = await vectorManager.getAllJobs()
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()

      jobs.forEach(job => {
        job.createdAt = oldTime
        job.status = 'completed'
        vectorManager.state.vectorJobs[job.id] = job
      })

      const deletedCount = await vectorManager.cleanupOldJobs(24)

      expect(deletedCount).toBe(3)
      expect(await vectorManager.getAllJobs()).toHaveLength(0)
    })

    it('should return 0 when no old jobs to cleanup', async () => {
      // Create recent jobs
      await vectorManager.createVectorAsync('text1')
      await vectorManager.createVectorAsync('text2')

      const deletedCount = await vectorManager.cleanupOldJobs(24)

      expect(deletedCount).toBe(0)
      expect(await vectorManager.getAllJobs()).toHaveLength(2)
    })

    it('should use default hours when not specified', async () => {
      // Create old job
      await vectorManager.createVectorAsync('text1')
      const jobs = await vectorManager.getAllJobs()

      // Make job 25 hours old (older than default 24 hours)
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      jobs[0].createdAt = oldTime
      jobs[0].status = 'completed'
      vectorManager.state.vectorJobs[jobs[0].id] = jobs[0]

      const deletedCount = await vectorManager.cleanupOldJobs()

      expect(deletedCount).toBe(1)
      expect(await vectorManager.getAllJobs()).toHaveLength(0)
    })

    it('should not cleanup jobs that are still processing', async () => {
      // Create job and keep it as processing
      await vectorManager.createVectorAsync('text1')
      const jobs = await vectorManager.getAllJobs()

      // Make job old but keep status as processing
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      jobs[0].createdAt = oldTime
      jobs[0].status = 'processing'
      vectorManager.state.vectorJobs[jobs[0].id] = jobs[0]

      const deletedCount = await vectorManager.cleanupOldJobs(24)

      expect(deletedCount).toBe(0)
      expect(await vectorManager.getAllJobs()).toHaveLength(1)
    })
  })

  describe('processFileAsync', () => {
    it('should process file asynchronously', async () => {
      const fileData = 'base64data'
      const fileName = 'test.pdf'
      const fileType = 'application/pdf'
      const fileSize = 1024
      const namespace = 'files'
      const metadata = { uploaded_by: 'user-1' }

      const result = await vectorManager.processFileAsync(
        fileData,
        fileName,
        fileType,
        fileSize,
        namespace,
        metadata
      )

      expect(mockEnv.FILE_PROCESSING_WORKFLOW.create).toHaveBeenCalledWith({
        id: expect.stringContaining('file_process_'),
        params: {
          fileData,
          fileName,
          fileType,
          fileSize,
          namespace,
          metadata
        }
      })

      expect(result).toEqual({
        jobId: expect.stringContaining('file_process_'),
        workflowId: 'workflow-123',
        status: 'processing'
      })

      const job = await vectorManager.getFileProcessingJob(result.jobId)
      expect(job).toMatchObject({
        status: 'pending',
        fileName,
        fileType,
        fileSize,
        namespace,
        metadata
      })
    })
  })

  describe('file processing job management', () => {
    it('should get file processing job', async () => {
      // Create test file processing jobs
      await vectorManager.processFileAsync('data1', 'file1.pdf', 'application/pdf', 1024)
      await vectorManager.processFileAsync('data2', 'file2.txt', 'text/plain', 512)

      const jobs = await vectorManager.getAllFileProcessingJobs()
      const jobId = jobs[0].id

      const job = await vectorManager.getFileProcessingJob(jobId)
      expect(job).toBeDefined()
      expect(job?.fileName).toBe('file1.pdf')
    })

    it('should get all file processing jobs', async () => {
      // Create test file processing jobs
      await vectorManager.processFileAsync('data1', 'file1.pdf', 'application/pdf', 1024)
      await vectorManager.processFileAsync('data2', 'file2.txt', 'text/plain', 512)

      const jobs = await vectorManager.getAllFileProcessingJobs()
      expect(jobs).toHaveLength(2)
      expect(jobs[0].fileName).toBe('file1.pdf')
      expect(jobs[1].fileName).toBe('file2.txt')
    })

    it('should get file processing workflow status', async () => {
      const expectedStatus = { status: 'completed', output: { extractedText: 'Test content' } }
      mockWorkflow.status.mockResolvedValueOnce(expectedStatus)

      const status = await vectorManager.getFileProcessingWorkflowStatus('workflow-456')

      expect(mockEnv.FILE_PROCESSING_WORKFLOW.get).toHaveBeenCalledWith('workflow-456')
      expect(status).toEqual(expectedStatus)
    })

    it('should cleanup old file processing jobs', async () => {
      // Create test file processing jobs
      await vectorManager.processFileAsync('data1', 'file1.pdf', 'application/pdf', 1024)
      await vectorManager.processFileAsync('data2', 'file2.txt', 'text/plain', 512)

      // Make jobs old
      const jobs = await vectorManager.getAllFileProcessingJobs()
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()

      jobs.forEach(job => {
        job.createdAt = oldTime
        job.status = 'completed'
        vectorManager.state.fileProcessingJobs[job.id] = job
      })

      const deletedCount = await vectorManager.cleanupOldFileProcessingJobs(24)

      expect(deletedCount).toBe(2)
      expect(await vectorManager.getAllFileProcessingJobs()).toHaveLength(0)
    })

    it('should return 0 when no old file processing jobs to cleanup', async () => {
      // Create recent jobs
      await vectorManager.processFileAsync('data1', 'file1.pdf', 'application/pdf', 1024)
      await vectorManager.processFileAsync('data2', 'file2.txt', 'text/plain', 512)

      const deletedCount = await vectorManager.cleanupOldFileProcessingJobs(24)

      expect(deletedCount).toBe(0)
      expect(await vectorManager.getAllFileProcessingJobs()).toHaveLength(2)
    })

    it('should use default hours for file processing cleanup', async () => {
      // Create old job
      await vectorManager.processFileAsync('data1', 'file1.pdf', 'application/pdf', 1024)
      const jobs = await vectorManager.getAllFileProcessingJobs()

      // Make job 25 hours old (older than default 24 hours)
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      jobs[0].createdAt = oldTime
      jobs[0].status = 'completed'
      vectorManager.state.fileProcessingJobs[jobs[0].id] = jobs[0]

      const deletedCount = await vectorManager.cleanupOldFileProcessingJobs()

      expect(deletedCount).toBe(1)
      expect(await vectorManager.getAllFileProcessingJobs()).toHaveLength(0)
    })

    it('should not cleanup file processing jobs that are still processing', async () => {
      // Create job
      await vectorManager.processFileAsync('data1', 'file1.pdf', 'application/pdf', 1024)
      const jobs = await vectorManager.getAllFileProcessingJobs()

      // Make job old but keep status as processing
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      jobs[0].createdAt = oldTime
      jobs[0].status = 'processing'
      vectorManager.state.fileProcessingJobs[jobs[0].id] = jobs[0]

      const deletedCount = await vectorManager.cleanupOldFileProcessingJobs(24)

      expect(deletedCount).toBe(0)
      expect(await vectorManager.getAllFileProcessingJobs()).toHaveLength(1)
    })
  })

  describe('private methods', () => {
    it('should update job status correctly', () => {
      // Create a job first
      const jobId = 'test-job-123'
      vectorManager.state.vectorJobs[jobId] = {
        id: jobId,
        type: 'create',
        status: 'pending',
        createdAt: new Date().toISOString()
      }

        // Update status
        ; (vectorManager as any).updateJobStatus(jobId, 'completed', {
          completedAt: new Date().toISOString(),
          vectorId: 'vec-123'
        })

      const job = vectorManager.state.vectorJobs[jobId]
      expect(job.status).toBe('completed')
      expect(job.completedAt).toBeDefined()
      expect(job.vectorId).toBe('vec-123')
    })

    it('should do nothing when updating non-existent job', () => {
      const initialState = { ...vectorManager.state }

        ; (vectorManager as any).updateJobStatus('non-existent-job', 'completed')

      expect(vectorManager.state).toEqual(initialState)
    })

    it('should update file processing job status correctly', () => {
      const jobId = 'file-job-123'
      vectorManager.state.fileProcessingJobs[jobId] = {
        id: jobId,
        status: 'pending',
        createdAt: new Date().toISOString(),
        fileName: 'test.pdf',
        fileType: 'application/pdf',
        fileSize: 1024
      }

        ; (vectorManager as any).updateFileProcessingJobStatus(jobId, 'completed', {
          completedAt: new Date().toISOString(),
          vectorIds: ['vec-1', 'vec-2'],
          extractedText: 'Test content'
        })

      const job = vectorManager.state.fileProcessingJobs[jobId]
      expect(job.status).toBe('completed')
      expect(job.completedAt).toBeDefined()
      expect(job.vectorIds).toEqual(['vec-1', 'vec-2'])
      expect(job.extractedText).toBe('Test content')
    })

    it('should do nothing when updating non-existent file processing job', () => {
      const initialState = { ...vectorManager.state }

        ; (vectorManager as any).updateFileProcessingJobStatus('non-existent-job', 'completed')

      expect(vectorManager.state).toEqual(initialState)
    })
  })

  describe('listVectors', () => {
    it('should return empty vectors list', async () => {
      const options = {
        namespace: 'test-namespace',
        limit: 10,
        cursor: 'test-cursor'
      }

      const result = await vectorManager.listVectors(options)

      expect(result).toEqual({
        vectors: [],
        count: 0,
        nextCursor: undefined
      })
    })

    it('should handle options without parameters', async () => {
      const result = await vectorManager.listVectors({})

      expect(result).toEqual({
        vectors: [],
        count: 0,
        nextCursor: undefined
      })
    })
  })
})