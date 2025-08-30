import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VectorManager } from '../../../src/durable-objects/vector-manager'
import { setupDurableObjectTest } from '../test-helpers'

// Mock the Agent class
vi.mock('agents', () => ({
  Agent: class {
    constructor(public ctx: any, public env: any) {
      this.state = {
        searchHistory: [],
        vectorJobs: {},
        fileProcessingJobs: {},
        recentVectors: []
      }
    }
    state: any
    setState(newState: any) {
      this.state = { ...this.state, ...newState }
    }
  }
}))

describe('VectorManager Durable Object', () => {
  let vectorManager: VectorManager
  let testSetup: ReturnType<typeof setupDurableObjectTest>
  let jobCounter = 0

  beforeEach(() => {
    vi.clearAllMocks()
    jobCounter = 0
    testSetup = setupDurableObjectTest()
    
    // Configure specific mock behaviors for this test
    testSetup.mockWorkflow.create.mockResolvedValue({
      id: 'embedding-workflow-123'
    })
    testSetup.mockWorkflow.id = 'workflow-123'
    testSetup.mockWorkflow.status = vi.fn().mockResolvedValue({ status: 'complete' })
    
    testSetup.mockVectorizeIndex.insert.mockResolvedValue(undefined)
    testSetup.mockVectorizeIndex.query.mockResolvedValue({
      matches: [{ id: 'vec-1', score: 0.95 }]
    })
    testSetup.mockVectorizeIndex.getByIds.mockResolvedValue([
      { id: 'vec-1', values: [0.1, 0.2, 0.3], namespace: 'default', metadata: {} }
    ])
    testSetup.mockVectorizeIndex.deleteByIds.mockResolvedValue({ count: 1 })
    testSetup.mockVectorizeIndex.upsert.mockResolvedValue(undefined)
    
    testSetup.mockEnv.EMBEDDINGS_WORKFLOW = {
      create: vi.fn().mockResolvedValue({
        id: 'embedding-workflow-123'
      }),
      get: vi.fn().mockResolvedValue({
        status: vi.fn().mockResolvedValue({
          status: 'complete',
          output: {
            success: true,
            embedding: [0.1, 0.2, 0.3],
            model: '@cf/baai/bge-base-en-v1.5'
          }
        })
      })
    }
    
    testSetup.mockEnv.VECTOR_OPERATIONS_WORKFLOW = {
      create: vi.fn().mockResolvedValue({
        id: 'workflow-123',
        status: vi.fn().mockResolvedValue({ 
          status: 'complete',
          output: {
            success: true,
            vectorId: 'vec-123'
          }
        })
      }),
      get: vi.fn().mockResolvedValue({
        id: 'workflow-123',
        status: vi.fn().mockResolvedValue({ 
          status: 'complete',
          output: {
            success: true,
            vectorId: 'vec-123'
          }
        })
      })
    }
    
    testSetup.mockEnv.FILE_PROCESSING_WORKFLOW = {
      create: vi.fn().mockResolvedValue({
        id: 'workflow-123',
        status: vi.fn().mockResolvedValue({ status: 'complete' })
      }),
      get: vi.fn().mockResolvedValue({
        id: 'workflow-123',
        status: vi.fn().mockResolvedValue({ status: 'complete' })
      })
    }
    
    // Add storage to context
    testSetup.mockCtx.storage = {
      get: vi.fn(),
      put: vi.fn()
    }

    vectorManager = new VectorManager(testSetup.mockCtx, testSetup.mockEnv)
  })

  describe('constructor', () => {
    it('should initialize with correct initial state', () => {
      expect(vectorManager.initialState).toEqual({
        searchHistory: [],
        vectorJobs: {},
        fileProcessingJobs: {},
        recentVectors: []
      })
      expect((vectorManager as any).vectorizeIndex).toBe(testSetup.mockVectorizeIndex)
    })
  })

  describe('insertVectors', () => {
    it('should insert vectors using vectorize index', async () => {
      const vectors = [
        { id: 'vec-1', values: [0.1, 0.2, 0.3], namespace: 'test' }
      ]

      await vectorManager.insertVectors(vectors)

      expect(testSetup.mockVectorizeIndex.insert).toHaveBeenCalledWith(vectors)
    })
  })

  describe('queryVectors', () => {
    it('should query vectors and track search history', async () => {
      const queryVector = [0.1, 0.2, 0.3]
      const options = { topK: 5, namespace: 'test' }

      const results = await vectorManager.queryVectors(queryVector, options)

      expect(testSetup.mockVectorizeIndex.query).toHaveBeenCalledWith(queryVector, options)
      expect(results).toEqual({ matches: [{ id: 'vec-1', score: 0.95 }] })
      expect(testSetup.mockCtx.waitUntil).toHaveBeenCalled()
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

      expect(testSetup.mockVectorizeIndex.getByIds).toHaveBeenCalledWith(ids)
      expect(vectors).toEqual([
        { id: 'vec-1', values: [0.1, 0.2, 0.3], namespace: 'default', metadata: {} }
      ])
    })
  })

  describe('deleteVectorsByIds', () => {
    it('should delete vectors by IDs', async () => {
      const ids = ['vec-1', 'vec-2']
      const result = await vectorManager.deleteVectorsByIds(ids)

      expect(testSetup.mockVectorizeIndex.deleteByIds).toHaveBeenCalledWith(ids)
      expect(result).toEqual({ count: 1 })
    })
  })

  describe('upsertVectors', () => {
    it('should upsert vectors', async () => {
      const vectors = [
        { id: 'vec-1', values: [0.1, 0.2, 0.3], namespace: 'test' }
      ]

      await vectorManager.upsertVectors(vectors)

      expect(testSetup.mockVectorizeIndex.upsert).toHaveBeenCalledWith(vectors)
    })
  })

  describe('findSimilar', () => {
    it('should find similar vectors', async () => {
      const vectorId = 'vec-1'
      const options = { topK: 5, namespace: 'test' }

      const results = await vectorManager.findSimilar(vectorId, options)

      expect(testSetup.mockVectorizeIndex.getByIds).toHaveBeenCalledWith([vectorId])
      expect(testSetup.mockVectorizeIndex.query).toHaveBeenCalledWith(
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

      expect(testSetup.mockVectorizeIndex.query).toHaveBeenCalledWith(
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
      testSetup.mockVectorizeIndex.query.mockResolvedValueOnce({
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
      testSetup.mockVectorizeIndex.query.mockResolvedValueOnce({
        matches: Array.from({ length: 12 }, (_, i) => ({
          id: `vec-${i}`,
          score: 1.0 - i * 0.05
        }))
      })

      const results = await vectorManager.findSimilar(vectorId, {
        excludeSelf: true
      })

      expect(testSetup.mockVectorizeIndex.query).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3],
        expect.objectContaining({ topK: 11 })
      )
      expect(results.matches).toHaveLength(10)
      expect(results.matches.every(m => m.id !== vectorId)).toBe(true)
    })

    it('should throw error if vector not found', async () => {
      testSetup.mockVectorizeIndex.getByIds.mockResolvedValueOnce([])

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

      testSetup.mockVectorizeIndex.query
        .mockResolvedValueOnce({ matches: [{ id: 'vec-1', score: 0.9 }] })
        .mockResolvedValueOnce({ matches: [{ id: 'vec-2', score: 0.8 }] })

      const results = await vectorManager.batchQuery(queries)

      expect(results).toHaveLength(2)
      expect(testSetup.mockVectorizeIndex.query).toHaveBeenCalledTimes(2)
      expect(testSetup.mockVectorizeIndex.query).toHaveBeenCalledWith([0.1, 0.2], { topK: 3 })
      expect(testSetup.mockVectorizeIndex.query).toHaveBeenCalledWith([0.3, 0.4], { topK: 5 })
    })
  })

  describe('createVectorAsync', () => {
    it('should create vector asynchronously using workflow', async () => {
      const text = 'Test text'
      const namespace = 'test-namespace'
      const metadata = { category: 'test' }

      // setTimeoutをモックしてすぐに実行
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        fn()
        return 0 as any
      })

      const result = await vectorManager.createVectorAsync(text, undefined, namespace, metadata)

      expect(result).toMatchObject({
        jobId: expect.stringContaining('vec_create_'),
        status: 'completed'
      })
      expect(testSetup.mockEnv.EMBEDDINGS_WORKFLOW.create).toHaveBeenCalled()
      expect(testSetup.mockEnv.VECTOR_OPERATIONS_WORKFLOW.create).toHaveBeenCalled()
    })

    it('should use default namespace when undefined and handle undefined recentVectors', async () => {
      const text = 'Test text'
      
      // recentVectorsをundefinedに設定
      vectorManager.setState({
        ...vectorManager.state,
        recentVectors: undefined
      })

      // setTimeoutをモックしてすぐに実行
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        fn()
        return 0 as any
      })

      const result = await vectorManager.createVectorAsync(text, undefined, undefined, undefined)

      expect(result).toMatchObject({
        jobId: expect.stringContaining('vec_create_'),
        status: 'completed'
      })
      
      // recentVectorsが初期化され、デフォルトnamespaceが使われることを確認
      expect(vectorManager.state.recentVectors).toBeDefined()
      expect(vectorManager.state.recentVectors!.length).toBeGreaterThan(0)
      expect(vectorManager.state.recentVectors![0].namespace).toBe('default')
    })

    it('should handle embedding workflow failure', async () => {
      testSetup.mockEnv.EMBEDDINGS_WORKFLOW.get.mockResolvedValueOnce({
        status: vi.fn().mockResolvedValue({
          status: 'errored',
          error: 'Embedding failed'
        })
      })

      await expect(
        vectorManager.createVectorAsync('Test text')
      ).rejects.toThrow('Workflow failed: Embedding failed')
    })

    it('should handle embedding workflow failure with undefined error', async () => {
      testSetup.mockEnv.EMBEDDINGS_WORKFLOW.get.mockResolvedValueOnce({
        status: vi.fn().mockResolvedValue({
          status: 'errored',
          error: undefined
        })
      })

      await expect(
        vectorManager.createVectorAsync('Test text')
      ).rejects.toThrow('Workflow failed: Unknown error')
    })

    it('should handle embedding timeout', async () => {
      testSetup.mockEnv.EMBEDDINGS_WORKFLOW.get.mockResolvedValueOnce({
        status: vi.fn().mockResolvedValue({
          status: 'running'
        })
      })

      await expect(
        vectorManager.createVectorAsync('Test text')
      ).rejects.toThrow('Workflow did not complete within timeout')
    })

    it('should handle vector workflow failure', async () => {
      testSetup.mockEnv.VECTOR_OPERATIONS_WORKFLOW.get.mockResolvedValueOnce({
        status: vi.fn().mockResolvedValue({
          status: 'errored',
          error: 'Vector save failed'
        })
      })

      // setTimeoutをモックしてすぐに実行
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        fn()
        return 0 as any
      })

      await expect(
        vectorManager.createVectorAsync('Test text')
      ).rejects.toThrow('Vector workflow failed: Vector save failed')
    })

    it('should handle vector workflow failure with undefined error', async () => {
      testSetup.mockEnv.VECTOR_OPERATIONS_WORKFLOW.get.mockResolvedValueOnce({
        status: vi.fn().mockResolvedValue({
          status: 'errored',
          error: undefined
        })
      })

      // setTimeoutをモックしてすぐに実行
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        fn()
        return 0 as any
      })

      await expect(
        vectorManager.createVectorAsync('Test text')
      ).rejects.toThrow('Vector workflow failed: Unknown error')
    })

    it('should handle unsuccessful embedding result', async () => {
      testSetup.mockEnv.EMBEDDINGS_WORKFLOW.get.mockResolvedValueOnce({
        status: vi.fn().mockResolvedValue({
          status: 'complete',
          output: {
            success: false,
            error: 'Model error'
          }
        })
      })

      // setTimeoutをモックしてすぐに実行
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        fn()
        return 0 as any
      })

      await expect(
        vectorManager.createVectorAsync('Test text')
      ).rejects.toThrow('Failed to generate embedding: Model error')
    })

    it('should handle unsuccessful embedding with undefined error', async () => {
      testSetup.mockEnv.EMBEDDINGS_WORKFLOW.get.mockResolvedValueOnce({
        status: vi.fn().mockResolvedValue({
          status: 'complete',
          output: {
            success: false,
            error: undefined
          }
        })
      })

      // setTimeoutをモックしてすぐに実行
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        fn()
        return 0 as any
      })

      await expect(
        vectorManager.createVectorAsync('Test text')
      ).rejects.toThrow('Failed to generate embedding: Unknown error')
    })

    it('should handle unsuccessful vector result', async () => {
      testSetup.mockEnv.VECTOR_OPERATIONS_WORKFLOW.get.mockResolvedValueOnce({
        status: vi.fn().mockResolvedValue({
          status: 'complete',
          output: {
            success: false,
            error: 'Save error'
          }
        })
      })

      // setTimeoutをモックしてすぐに実行
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        fn()
        return 0 as any
      })

      await expect(
        vectorManager.createVectorAsync('Test text')
      ).rejects.toThrow('Failed to save vector: Save error')
    })

    it('should handle vector workflow timeout', async () => {
      // setTimeoutをモックしてすぐに実行
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        fn()
        return 0 as any
      })

      // Embedding workflow succeeds immediately
      testSetup.mockEnv.EMBEDDINGS_WORKFLOW.get.mockResolvedValueOnce({
        status: vi.fn().mockResolvedValue({
          status: 'complete',
          output: {
            success: true,
            embedding: [0.1, 0.2, 0.3],
            model: '@cf/baai/bge-base-en-v1.5'
          }
        })
      })

      // Vector workflow always returns running status
      testSetup.mockEnv.VECTOR_OPERATIONS_WORKFLOW.get.mockResolvedValueOnce({
        status: vi.fn().mockResolvedValue({
          status: 'running'
        })
      })

      // After timeout, vectorResult is null, so it throws 'Unknown error'
      await expect(
        vectorManager.createVectorAsync('Test text')
      ).rejects.toThrow('Failed to save vector: Unknown error')
    })

    it('should handle null vector result', async () => {
      // Embedding workflow succeeds
      testSetup.mockEnv.EMBEDDINGS_WORKFLOW.get.mockResolvedValueOnce({
        status: vi.fn().mockResolvedValue({
          status: 'complete',
          output: {
            success: true,
            embedding: [0.1, 0.2, 0.3],
            model: '@cf/baai/bge-base-en-v1.5'
          }
        })
      })

      // Vector workflow returns null output
      testSetup.mockEnv.VECTOR_OPERATIONS_WORKFLOW.get.mockResolvedValueOnce({
        status: vi.fn().mockResolvedValue({
          status: 'complete',
          output: null
        })
      })

      // setTimeoutをモックしてすぐに実行
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        fn()
        return 0 as any
      })

      await expect(
        vectorManager.createVectorAsync('Test text')
      ).rejects.toThrow('Failed to save vector: Unknown error')
    })
  })

  describe('deleteVectorsAsync', () => {
    it('should delete vectors asynchronously', async () => {
      const vectorIds = ['vec-1', 'vec-2']
      const result = await vectorManager.deleteVectorsAsync(vectorIds)

      expect(result).toMatchObject({
        jobId: expect.stringContaining('vec_delete_'),
        status: 'processing'
      })
      expect(testSetup.mockEnv.VECTOR_OPERATIONS_WORKFLOW.create).toHaveBeenCalledWith({
        id: result.jobId,
        params: {
          type: 'delete',
          vectorIds
        }
      })
    })
  })

  describe('Job Management', () => {
    it('should get job status', async () => {
      await vectorManager.deleteVectorsAsync(['vec-1'])
      const jobs = await vectorManager.getAllJobs()
      const jobId = jobs[0].id

      const job = await vectorManager.getJobStatus(jobId)
      expect(job).toBeDefined()
      expect(job?.type).toBe('delete')
    })

    it('should get all jobs', async () => {
      await vectorManager.deleteVectorsAsync(['vec-1'])
      await vectorManager.deleteVectorsAsync(['vec-2'])

      const jobs = await vectorManager.getAllJobs()
      expect(jobs).toHaveLength(2)
    })

    it('should cleanup old completed jobs', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      const recentDate = new Date().toISOString()

      vectorManager.setState({
        ...vectorManager.state,
        vectorJobs: {
          'old-job': {
            id: 'old-job',
            type: 'delete',
            status: 'completed',
            createdAt: oldDate
          },
          'recent-job': {
            id: 'recent-job',
            type: 'delete',
            status: 'completed',
            createdAt: recentDate
          },
          'old-pending': {
            id: 'old-pending',
            type: 'delete',
            status: 'pending',
            createdAt: oldDate
          }
        }
      })

      const deletedCount = await vectorManager.cleanupOldJobs(24)
      expect(deletedCount).toBe(1)

      const remainingJobs = await vectorManager.getAllJobs()
      expect(remainingJobs).toHaveLength(2)
    })

    it('should return 0 when no jobs to cleanup', async () => {
      const deletedCount = await vectorManager.cleanupOldJobs(24)
      expect(deletedCount).toBe(0)
    })

    it('should use default parameter when not specified', async () => {
      const deletedCount = await vectorManager.cleanupOldJobs()
      expect(deletedCount).toBe(0)
    })
  })

  describe('File Processing', () => {
    it('should process file asynchronously', async () => {
      const result = await vectorManager.processFileAsync(
        'file content',
        'test.txt',
        'text/plain',
        1024,
        'files',
        { source: 'upload' }
      )

      expect(result).toMatchObject({
        jobId: expect.stringContaining('file_process_'),
        status: 'processing'
      })
      expect(testSetup.mockEnv.FILE_PROCESSING_WORKFLOW.create).toHaveBeenCalled()
    })

    it('should get file processing job status', async () => {
      const result = await vectorManager.processFileAsync(
        'content',
        'test.txt',
        'text/plain',
        100
      )

      const job = await vectorManager.getFileProcessingJob(result.jobId)
      expect(job).toBeDefined()
      expect(job?.fileName).toBe('test.txt')
    })

    it('should get all file processing jobs', async () => {
      await vectorManager.processFileAsync('content1', 'file1.txt', 'text/plain', 100)
      await vectorManager.processFileAsync('content2', 'file2.txt', 'text/plain', 200)

      const jobs = await vectorManager.getAllFileProcessingJobs()
      expect(jobs).toHaveLength(2)
    })

    it('should cleanup old file processing jobs', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()

      vectorManager.setState({
        ...vectorManager.state,
        fileProcessingJobs: {
          'old-job': {
            id: 'old-job',
            status: 'completed',
            createdAt: oldDate,
            fileName: 'old.txt',
            fileType: 'text/plain',
            fileSize: 100
          }
        }
      })

      const deletedCount = await vectorManager.cleanupOldFileProcessingJobs(24)
      expect(deletedCount).toBe(1)
    })

    it('should cleanup old failed file processing jobs', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()

      vectorManager.setState({
        ...vectorManager.state,
        fileProcessingJobs: {
          'failed-job': {
            id: 'failed-job',
            status: 'failed',
            createdAt: oldDate,
            fileName: 'failed.txt',
            fileType: 'text/plain',
            fileSize: 100
          }
        }
      })

      const deletedCount = await vectorManager.cleanupOldFileProcessingJobs(24)
      expect(deletedCount).toBe(1)
    })

    it('should not cleanup recent failed jobs', async () => {
      const recentDate = new Date().toISOString()

      vectorManager.setState({
        ...vectorManager.state,
        fileProcessingJobs: {
          'recent-failed': {
            id: 'recent-failed',
            status: 'failed',
            createdAt: recentDate,
            fileName: 'recent.txt',
            fileType: 'text/plain',
            fileSize: 100
          }
        }
      })

      const deletedCount = await vectorManager.cleanupOldFileProcessingJobs(24)
      expect(deletedCount).toBe(0)
      expect(vectorManager.state.fileProcessingJobs['recent-failed']).toBeDefined()
    })

    it('should return 0 when no file jobs to cleanup', async () => {
      const deletedCount = await vectorManager.cleanupOldFileProcessingJobs(24)
      expect(deletedCount).toBe(0)
    })

    it('should use default parameter for file job cleanup', async () => {
      const deletedCount = await vectorManager.cleanupOldFileProcessingJobs()
      expect(deletedCount).toBe(0)
    })
  })

  describe('Workflow Status', () => {
    it('should get workflow status', async () => {
      const status = await vectorManager.getWorkflowStatus('workflow-123')
      expect(status.status).toBe('complete')
    })

    it('should get file processing workflow status', async () => {
      const status = await vectorManager.getFileProcessingWorkflowStatus('file-workflow-123')
      expect(status.status).toBe('complete')
    })
  })

  describe('Vector List Management', () => {
    it('should list vectors', async () => {
      vectorManager.setState({
        ...vectorManager.state,
        recentVectors: [
          { id: 'vec-1', values: [0.1], namespace: 'default' },
          { id: 'vec-2', values: [0.2], namespace: 'test' },
          { id: 'vec-3', values: [0.3], namespace: 'default' }
        ]
      })

      const result = await vectorManager.listVectors({})
      expect(result.count).toBe(3)
      expect(result.vectors).toHaveLength(3)
    })

    it('should filter vectors by namespace', async () => {
      vectorManager.setState({
        ...vectorManager.state,
        recentVectors: [
          { id: 'vec-1', values: [0.1], namespace: 'default' },
          { id: 'vec-2', values: [0.2], namespace: 'test' },
          { id: 'vec-3', values: [0.3], namespace: 'default' }
        ]
      })

      const result = await vectorManager.listVectors({ namespace: 'default' })
      expect(result.count).toBe(2)
      expect(result.vectors.every(v => v.namespace === 'default')).toBe(true)
    })

    it('should limit vector results', async () => {
      vectorManager.setState({
        ...vectorManager.state,
        recentVectors: Array.from({ length: 10 }, (_, i) => ({
          id: `vec-${i}`,
          values: [i * 0.1],
          namespace: 'default'
        }))
      })

      const result = await vectorManager.listVectors({ limit: 5 })
      expect(result.count).toBe(5)
      expect(result.vectors).toHaveLength(5)
    })

    it('should handle undefined recentVectors in listVectors', async () => {
      vectorManager.setState({
        ...vectorManager.state,
        recentVectors: undefined
      })

      const result = await vectorManager.listVectors({})
      expect(result.count).toBe(0)
      expect(result.vectors).toEqual([])
    })
  })

  describe('Private Methods', () => {
    it('should handle updateJobStatus with non-existent job', () => {
      // privateメソッドにアクセス
      const updateJobStatus = (vectorManager as any).updateJobStatus.bind(vectorManager)
      
      // 存在しないジョブIDで呼び出し（エラーが出ないことを確認）
      expect(() => {
        updateJobStatus('non-existent-job', 'completed')
      }).not.toThrow()
      
      // stateが変更されていないことを確認
      expect(vectorManager.state.vectorJobs).toEqual({})
    })

    it('should update existing job status', () => {
      // privateメソッドにアクセス
      const updateJobStatus = (vectorManager as any).updateJobStatus.bind(vectorManager)
      
      // ジョブを追加
      vectorManager.setState({
        ...vectorManager.state,
        vectorJobs: {
          'job-1': {
            id: 'job-1',
            type: 'delete',
            status: 'processing',
            createdAt: new Date().toISOString()
          }
        }
      })
      
      // ジョブステータスを更新（completedAtを明示的に渡す）
      const completedAt = new Date().toISOString()
      updateJobStatus('job-1', 'completed', { completedAt })
      
      // stateが更新されたことを確認
      expect(vectorManager.state.vectorJobs['job-1'].status).toBe('completed')
      expect(vectorManager.state.vectorJobs['job-1'].completedAt).toBe(completedAt)
    })

    it('should handle updateFileProcessingJobStatus with non-existent job', () => {
      // privateメソッドにアクセス
      const updateFileProcessingJobStatus = (vectorManager as any).updateFileProcessingJobStatus.bind(vectorManager)
      
      // 存在しないジョブIDで呼び出し（エラーが出ないことを確認）
      expect(() => {
        updateFileProcessingJobStatus('non-existent-job', 'completed')
      }).not.toThrow()
      
      // stateが変更されていないことを確認
      expect(vectorManager.state.fileProcessingJobs).toEqual({})
    })

    it('should update existing file processing job status', () => {
      // privateメソッドにアクセス
      const updateFileProcessingJobStatus = (vectorManager as any).updateFileProcessingJobStatus.bind(vectorManager)
      
      // ジョブを追加
      vectorManager.setState({
        ...vectorManager.state,
        fileProcessingJobs: {
          'file-job-1': {
            id: 'file-job-1',
            status: 'processing',
            fileName: 'test.txt',
            fileType: 'text/plain',
            fileSize: 100,
            createdAt: new Date().toISOString()
          }
        }
      })
      
      // ジョブステータスを更新（completedAtとresultを明示的に渡す）
      const completedAt = new Date().toISOString()
      updateFileProcessingJobStatus('file-job-1', 'completed', { 
        completedAt,
        result: { vectorCount: 5 }
      })
      
      // stateが更新されたことを確認
      expect(vectorManager.state.fileProcessingJobs['file-job-1'].status).toBe('completed')
      expect(vectorManager.state.fileProcessingJobs['file-job-1'].completedAt).toBe(completedAt)
      expect((vectorManager.state.fileProcessingJobs['file-job-1'] as any).result).toEqual({ vectorCount: 5 })
    })
  })

  describe('Delete Operations', () => {
    it('should remove deleted vectors from local state', async () => {
      vectorManager.setState({
        ...vectorManager.state,
        recentVectors: [
          { id: 'vec-1', values: [0.1], namespace: 'default' },
          { id: 'vec-2', values: [0.2], namespace: 'default' },
          { id: 'vec-3', values: [0.3], namespace: 'default' }
        ]
      })

      await vectorManager.removeDeletedVectors(['vec-1', 'vec-3'])

      expect(vectorManager.state.recentVectors).toHaveLength(1)
      expect(vectorManager.state.recentVectors![0].id).toBe('vec-2')
    })

    it('should handle uninitialized recentVectors', async () => {
      vectorManager.setState({
        ...vectorManager.state,
        recentVectors: undefined
      })

      await vectorManager.removeDeletedVectors(['vec-1'])
      expect(vectorManager.state.recentVectors).toEqual([])
    })

    it('should delete all vectors', async () => {
      vectorManager.setState({
        ...vectorManager.state,
        recentVectors: [
          { id: 'vec-1', values: [0.1], namespace: 'default' },
          { id: 'vec-2', values: [0.2], namespace: 'test' },
          { id: 'vec-3', values: [0.3], namespace: 'default' }
        ]
      })

      const result = await vectorManager.deleteAllVectors()

      expect(result.success).toBe(true)
      expect(result.deletedCount).toBe(3)
      expect(vectorManager.state.recentVectors).toEqual([])
      expect(testSetup.mockVectorizeIndex.deleteByIds).toHaveBeenCalledWith(['vec-1', 'vec-2', 'vec-3'])
    })

    it('should delete vectors by namespace', async () => {
      vectorManager.setState({
        ...vectorManager.state,
        recentVectors: [
          { id: 'vec-1', values: [0.1], namespace: 'default' },
          { id: 'vec-2', values: [0.2], namespace: 'test' },
          { id: 'vec-3', values: [0.3], namespace: 'default' }
        ]
      })

      const result = await vectorManager.deleteAllVectors('default')

      expect(result.success).toBe(true)
      expect(result.deletedCount).toBe(2)
      expect(vectorManager.state.recentVectors).toHaveLength(1)
      expect(vectorManager.state.recentVectors![0].namespace).toBe('test')
      expect(testSetup.mockVectorizeIndex.deleteByIds).toHaveBeenCalledWith(['vec-1', 'vec-3'])
    })

    it('should handle empty state when deleting all', async () => {
      vectorManager.setState({
        ...vectorManager.state,
        recentVectors: []
      })

      const result = await vectorManager.deleteAllVectors()

      expect(result.success).toBe(true)
      expect(result.deletedCount).toBe(0)
      expect(testSetup.mockVectorizeIndex.deleteByIds).not.toHaveBeenCalled()
    })

    it('should handle uninitialized state when deleting all', async () => {
      vectorManager.setState({
        ...vectorManager.state,
        recentVectors: undefined
      })

      const result = await vectorManager.deleteAllVectors()

      expect(result.success).toBe(true)
      expect(result.deletedCount).toBe(0)
      expect(vectorManager.state.recentVectors).toEqual([])
    })

    it('should continue on vectorize delete error', async () => {
      testSetup.mockVectorizeIndex.deleteByIds.mockRejectedValueOnce(new Error('Delete failed'))

      vectorManager.setState({
        ...vectorManager.state,
        recentVectors: [
          { id: 'vec-1', values: [0.1], namespace: 'default' }
        ]
      })

      const result = await vectorManager.deleteAllVectors()

      expect(result.success).toBe(true)
      expect(result.deletedCount).toBe(0)
      expect(vectorManager.state.recentVectors).toEqual([])
    })

    it('should throw error when state access fails', async () => {
      // Mock state getter to throw an error
      Object.defineProperty(vectorManager, 'state', {
        get: () => {
          throw new Error('State access failed')
        },
        configurable: true
      })

      await expect(vectorManager.deleteAllVectors()).rejects.toThrow('State access failed')
      
      // Restore original state getter
      Object.defineProperty(vectorManager, 'state', {
        get: () => vectorManager['_state'] || { 
          searchHistory: [],
          vectorJobs: {},
          fileProcessingJobs: {},
          recentVectors: []
        },
        set: (value) => { vectorManager['_state'] = value },
        configurable: true
      })
    })
  })
})