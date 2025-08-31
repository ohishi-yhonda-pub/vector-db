import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SyncStateMachine, SyncContext, SyncState } from '../../../src/workflows/sync-state-machine'
import { AppError, ErrorCodes } from '../../../src/utils/error-handler'

// WorkflowStep のモック
const mockWorkflowStep = {
  do: vi.fn()
}

describe('SyncStateMachine', () => {
  let syncContext: SyncContext
  let stateMachine: SyncStateMachine
  let consoleLogSpy: any

  beforeEach(() => {
    syncContext = {
      pageId: 'test-page-123',
      includeBlocks: true,
      includeProperties: true,
      namespace: 'test-namespace',
      vectorsCreated: 0,
      propertiesProcessed: 0,
      blocksProcessed: 0,
      errors: []
    }
    stateMachine = new SyncStateMachine(syncContext)
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  describe('constructor', () => {
    it('should initialize with provided context', () => {
      const context = stateMachine.getContext()
      expect(context).toEqual(syncContext)
      expect(stateMachine.getCurrentState()).toBe('initializing')
    })

    it('should create deep copy of context', () => {
      const context = stateMachine.getContext()
      context.pageId = 'modified'
      expect(stateMachine.getContext().pageId).toBe('test-page-123')
    })
  })

  describe('state management', () => {
    it('should get current state', () => {
      expect(stateMachine.getCurrentState()).toBe('initializing')
    })

    it('should set new state', () => {
      stateMachine.setState('fetching_page')
      expect(stateMachine.getCurrentState()).toBe('fetching_page')
    })

    it('should update context', () => {
      stateMachine.updateContext({ vectorsCreated: 5 })
      expect(stateMachine.getContext().vectorsCreated).toBe(5)
    })

    it('should add error to context', () => {
      stateMachine.addError('Test error')
      expect(stateMachine.getContext().errors).toContain('Test error')
    })
  })

  describe('initialize', () => {
    it('should initialize successfully with valid context', async () => {
      mockWorkflowStep.do.mockResolvedValue({
        initialized: true,
        timestamp: expect.any(String)
      })

      const result = await stateMachine.initialize(mockWorkflowStep)

      expect(result.state).toBe('fetching_page')
      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        initialized: true,
        timestamp: expect.any(String)
      })
      expect(mockWorkflowStep.do).toHaveBeenCalledWith('initialize', expect.any(Function))
    })

    it('should fail with invalid page ID', async () => {
      const invalidContext = { ...syncContext, pageId: '' }
      const invalidStateMachine = new SyncStateMachine(invalidContext)
      
      mockWorkflowStep.do.mockImplementation((name, fn) => fn())

      const result = await invalidStateMachine.initialize(mockWorkflowStep)

      expect(result.state).toBe('failed')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Page ID is required')
      expect(invalidStateMachine.getCurrentState()).toBe('failed')
    })

    it('should log initialization details', async () => {
      mockWorkflowStep.do.mockImplementation((name, fn) => fn())

      await stateMachine.initialize(mockWorkflowStep)

      expect(consoleLogSpy).toHaveBeenCalledWith(`[SyncStateMachine] Initializing sync for page: ${syncContext.pageId}`)
      expect(consoleLogSpy).toHaveBeenCalledWith(`[SyncStateMachine] Include blocks: ${syncContext.includeBlocks}`)
      expect(consoleLogSpy).toHaveBeenCalledWith(`[SyncStateMachine] Include properties: ${syncContext.includeProperties}`)
      expect(consoleLogSpy).toHaveBeenCalledWith(`[SyncStateMachine] Namespace: ${syncContext.namespace}`)
    })

    it('should handle workflow step error', async () => {
      const workflowError = new Error('Workflow initialization failed')
      mockWorkflowStep.do.mockRejectedValue(workflowError)

      const result = await stateMachine.initialize(mockWorkflowStep)

      expect(result.state).toBe('failed')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Workflow initialization failed')
      expect(stateMachine.getCurrentState()).toBe('failed')
    })
  })

  describe('fetchPage', () => {
    beforeEach(() => {
      stateMachine.setState('fetching_page')
    })

    it('should fetch page successfully', async () => {
      const pageData = { id: 'test-page-123', title: 'Test Page' }
      const fetchFn = vi.fn().mockResolvedValue(pageData)
      mockWorkflowStep.do.mockResolvedValue(pageData)

      const result = await stateMachine.fetchPage(mockWorkflowStep, fetchFn)

      expect(result.state).toBe('processing_properties')
      expect(result.success).toBe(true)
      expect(result.data).toEqual(pageData)
      expect(mockWorkflowStep.do).toHaveBeenCalledWith('fetch-page', fetchFn)
    })

    it('should fail when page not found', async () => {
      const fetchFn = vi.fn().mockResolvedValue(null)
      mockWorkflowStep.do.mockResolvedValue(null)

      const result = await stateMachine.fetchPage(mockWorkflowStep, fetchFn)

      expect(result.state).toBe('failed')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Page not found')
      expect(stateMachine.getCurrentState()).toBe('failed')
    })

    it('should handle fetch error', async () => {
      const fetchError = new AppError(ErrorCodes.EXTERNAL_SERVICE_ERROR, 'API error', 500)
      const fetchFn = vi.fn().mockRejectedValue(fetchError)
      mockWorkflowStep.do.mockRejectedValue(fetchError)

      const result = await stateMachine.fetchPage(mockWorkflowStep, fetchFn)

      expect(result.state).toBe('failed')
      expect(result.success).toBe(false)
      expect(result.error).toBe('API error')
      expect(stateMachine.getCurrentState()).toBe('failed')
    })
  })

  describe('processProperties', () => {
    beforeEach(() => {
      stateMachine.setState('processing_properties')
    })

    it('should process properties successfully', async () => {
      const processResult = {
        propertiesProcessed: 5,
        vectorsCreated: 10
      }
      const processFn = vi.fn().mockResolvedValue(processResult)
      mockWorkflowStep.do.mockResolvedValue(processResult)

      const result = await stateMachine.processProperties(mockWorkflowStep, processFn)

      expect(result.state).toBe('processing_blocks')
      expect(result.success).toBe(true)
      expect(result.propertiesProcessed).toBe(5)
      expect(result.vectorsCreated).toBe(10)

      const updatedContext = stateMachine.getContext()
      expect(updatedContext.propertiesProcessed).toBe(5)
      expect(updatedContext.vectorsCreated).toBe(10)
      expect(mockWorkflowStep.do).toHaveBeenCalledWith('process-properties', processFn)
    })

    it('should skip processing when includeProperties is false', async () => {
      const noPropertiesContext = { ...syncContext, includeProperties: false }
      const noPropertiesStateMachine = new SyncStateMachine(noPropertiesContext)
      noPropertiesStateMachine.setState('processing_properties')
      const processFn = vi.fn()

      const result = await noPropertiesStateMachine.processProperties(mockWorkflowStep, processFn)

      expect(result.state).toBe('processing_blocks')
      expect(result.success).toBe(true)
      expect(result.propertiesProcessed).toBe(0)
      expect(processFn).not.toHaveBeenCalled()
    })

    it('should handle processing error', async () => {
      const processError = new Error('Property processing failed')
      const processFn = vi.fn().mockRejectedValue(processError)
      mockWorkflowStep.do.mockRejectedValue(processError)

      const result = await stateMachine.processProperties(mockWorkflowStep, processFn)

      expect(result.state).toBe('failed')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Property processing failed')
      expect(stateMachine.getCurrentState()).toBe('failed')
    })

    it('should accumulate counts in context', async () => {
      stateMachine.updateContext({ propertiesProcessed: 3, vectorsCreated: 7 })
      
      const processResult = { propertiesProcessed: 2, vectorsCreated: 4 }
      const processFn = vi.fn().mockResolvedValue(processResult)
      mockWorkflowStep.do.mockResolvedValue(processResult)

      await stateMachine.processProperties(mockWorkflowStep, processFn)

      const context = stateMachine.getContext()
      expect(context.propertiesProcessed).toBe(5) // 3 + 2
      expect(context.vectorsCreated).toBe(11) // 7 + 4
    })
  })

  describe('processBlocks', () => {
    beforeEach(() => {
      stateMachine.setState('processing_blocks')
    })

    it('should process blocks successfully', async () => {
      const processResult = {
        blocksProcessed: 8,
        vectorsCreated: 15
      }
      const processFn = vi.fn().mockResolvedValue(processResult)
      mockWorkflowStep.do.mockResolvedValue(processResult)

      const result = await stateMachine.processBlocks(mockWorkflowStep, processFn)

      expect(result.state).toBe('completing')
      expect(result.success).toBe(true)
      expect(result.blocksProcessed).toBe(8)
      expect(result.vectorsCreated).toBe(15)

      const updatedContext = stateMachine.getContext()
      expect(updatedContext.blocksProcessed).toBe(8)
      expect(updatedContext.vectorsCreated).toBe(15)
      expect(mockWorkflowStep.do).toHaveBeenCalledWith('process-blocks', processFn)
    })

    it('should skip processing when includeBlocks is false', async () => {
      const noBlocksContext = { ...syncContext, includeBlocks: false }
      const noBlocksStateMachine = new SyncStateMachine(noBlocksContext)
      noBlocksStateMachine.setState('processing_blocks')
      const processFn = vi.fn()

      const result = await noBlocksStateMachine.processBlocks(mockWorkflowStep, processFn)

      expect(result.state).toBe('completing')
      expect(result.success).toBe(true)
      expect(result.blocksProcessed).toBe(0)
      expect(processFn).not.toHaveBeenCalled()
    })

    it('should handle processing error', async () => {
      const processError = new Error('Block processing failed')
      const processFn = vi.fn().mockRejectedValue(processError)
      mockWorkflowStep.do.mockRejectedValue(processError)

      const result = await stateMachine.processBlocks(mockWorkflowStep, processFn)

      expect(result.state).toBe('failed')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Block processing failed')
      expect(stateMachine.getCurrentState()).toBe('failed')
    })

    it('should accumulate counts in context', async () => {
      stateMachine.updateContext({ blocksProcessed: 2, vectorsCreated: 5 })
      
      const processResult = { blocksProcessed: 3, vectorsCreated: 6 }
      const processFn = vi.fn().mockResolvedValue(processResult)
      mockWorkflowStep.do.mockResolvedValue(processResult)

      await stateMachine.processBlocks(mockWorkflowStep, processFn)

      const context = stateMachine.getContext()
      expect(context.blocksProcessed).toBe(5) // 2 + 3
      expect(context.vectorsCreated).toBe(11) // 5 + 6
    })
  })

  describe('complete', () => {
    beforeEach(() => {
      stateMachine.setState('completing')
      stateMachine.updateContext({
        vectorsCreated: 25,
        propertiesProcessed: 10,
        blocksProcessed: 15
      })
    })

    it('should complete successfully with summary', async () => {
      const completionSummary = {
        pageId: 'test-page-123',
        vectorsCreated: 25,
        propertiesProcessed: 10,
        blocksProcessed: 15,
        namespace: 'test-namespace',
        completedAt: expect.any(String)
      }
      mockWorkflowStep.do.mockResolvedValue(completionSummary)

      const result = await stateMachine.complete(mockWorkflowStep)

      expect(result.state).toBe('completing')
      expect(result.success).toBe(true)
      expect(result.vectorsCreated).toBe(25)
      expect(result.propertiesProcessed).toBe(10)
      expect(result.blocksProcessed).toBe(15)
      expect(result.data).toEqual(completionSummary)
      expect(mockWorkflowStep.do).toHaveBeenCalledWith('complete', expect.any(Function))
    })

    it('should log completion details', async () => {
      mockWorkflowStep.do.mockImplementation((name, fn) => fn())

      await stateMachine.complete(mockWorkflowStep)

      expect(consoleLogSpy).toHaveBeenCalledWith(`[SyncStateMachine] Sync completed for page: ${syncContext.pageId}`)
      expect(consoleLogSpy).toHaveBeenCalledWith(`[SyncStateMachine] Total vectors created: 25`)
      expect(consoleLogSpy).toHaveBeenCalledWith(`[SyncStateMachine] Properties processed: 10`)
      expect(consoleLogSpy).toHaveBeenCalledWith(`[SyncStateMachine] Blocks processed: 15`)
    })

    it('should handle completion error', async () => {
      const completionError = new Error('Completion failed')
      mockWorkflowStep.do.mockRejectedValue(completionError)

      const result = await stateMachine.complete(mockWorkflowStep)

      expect(result.state).toBe('failed')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Completion failed')
      expect(stateMachine.getCurrentState()).toBe('failed')
    })
  })

  describe('getProgress', () => {
    const states: SyncState[] = ['initializing', 'fetching_page', 'processing_properties', 'processing_blocks', 'completing']

    states.forEach((state, index) => {
      it(`should calculate progress for ${state} state`, () => {
        stateMachine.setState(state)
        const progress = stateMachine.getProgress()

        expect(progress.current).toBe(index + 1)
        expect(progress.total).toBe(5)
        expect(progress.percentage).toBe(Math.round(((index + 1) / 5) * 100))
      })
    })

    it('should handle failed state', () => {
      stateMachine.setState('failed')
      const progress = stateMachine.getProgress()

      expect(progress.current).toBe(0) // Failed state not in progress steps
      expect(progress.total).toBe(5)
      expect(progress.percentage).toBe(0) // 0% for failed state
    })
  })

  describe('context management', () => {
    it('should return deep copy of context', () => {
      const context1 = stateMachine.getContext()
      const context2 = stateMachine.getContext()

      expect(context1).toEqual(context2)
      expect(context1).not.toBe(context2) // Different objects
    })

    it('should update context without affecting returned copies', () => {
      const originalContext = stateMachine.getContext()
      stateMachine.updateContext({ vectorsCreated: 100 })
      
      expect(originalContext.vectorsCreated).toBe(0) // Original copy unchanged
      expect(stateMachine.getContext().vectorsCreated).toBe(100) // Current context updated
    })
  })
})