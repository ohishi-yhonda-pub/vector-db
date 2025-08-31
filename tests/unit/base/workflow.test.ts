import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers'
import { BaseWorkflow, WorkflowStatus, WorkflowResult, StepResult } from '../../../src/base/workflow'
import { AppError, ErrorCodes } from '../../../src/utils/error-handler'
import { RetryPresets } from '../../../src/utils/retry'

// Mock cloudflare:workers
vi.mock('cloudflare:workers', () => ({
  WorkflowEntrypoint: class {
    constructor(public ctx: any, public env: any) {}
  },
  WorkflowStep: {},
  WorkflowEvent: {}
}))

// Mock error handler
vi.mock('../../../src/utils/error-handler', () => ({
  AppError: class extends Error {
    constructor(public code: string, message: string, public statusCode: number, public originalError?: any) {
      super(message)
      this.name = 'AppError'
    }
  },
  ErrorCodes: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    WORKFLOW_ERROR: 'WORKFLOW_ERROR'
  },
  logError: vi.fn(),
  getErrorMessage: vi.fn((error: any) => {
    if (error instanceof Error) return error.message
    return String(error)
  })
}))

// Mock retry
vi.mock('../../../src/utils/retry', () => ({
  RetryPresets: {
    standard: { maxAttempts: 3, delay: 1000 },
    aggressive: { maxAttempts: 5, delay: 500 },
    conservative: { maxAttempts: 2, delay: 2000 }
  },
  retryWithBackoff: vi.fn(async (fn, config) => {
    let attempt = 0
    let lastError: any
    
    while (attempt < (config?.maxAttempts || 3)) {
      try {
        return await fn()
      } catch (error) {
        lastError = error
        attempt++
        
        if (attempt < (config?.maxAttempts || 3) && config?.onRetry) {
          config.onRetry(attempt, error, config.baseDelay || 1000)
        }
      }
    }
    
    throw lastError
  })
}))

// Mock logging
vi.mock('../../../src/middleware/logging', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
}))

// Test implementation of BaseWorkflow
class TestWorkflow extends BaseWorkflow<{ input: string }, { output: string }> {
  protected async execute(params: { input: string }, step: WorkflowStep): Promise<{ output: string }> {
    return { output: params.input.toUpperCase() }
  }
}

describe('BaseWorkflow', () => {
  let workflow: TestWorkflow
  let mockCtx: any
  let mockEnv: any
  let mockStep: any
  let mockEvent: WorkflowEvent<{ input: string }>
  let mockLogger: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    }
    
    mockCtx = {}
    mockEnv = {}
    mockStep = {
      do: vi.fn(async (name, fn) => fn()),
      sleep: vi.fn()
    }
    mockEvent = {
      payload: { input: 'test' },
      timestamp: new Date()
    } as WorkflowEvent<{ input: string }>

    workflow = new TestWorkflow(mockCtx, mockEnv)
    // Override logger for testing
    ;(workflow as any).logger = mockLogger
  })

  describe('run', () => {
    it('should execute workflow successfully', async () => {
      const result = await workflow.run(mockEvent, mockStep)

      expect(result).toMatchObject({
        success: true,
        status: WorkflowStatus.COMPLETED,
        data: { output: 'TEST' },
        startedAt: expect.any(String),
        completedAt: expect.any(String),
        duration: expect.any(Number)
      })
    })

    it('should handle workflow execution errors', async () => {
      class ErrorWorkflow extends BaseWorkflow<{ input: string }, { output: string }> {
        protected async execute(): Promise<{ output: string }> {
          throw new Error('Execution failed')
        }
      }

      const errorWorkflow = new ErrorWorkflow(mockCtx, mockEnv)
      const result = await errorWorkflow.run(mockEvent, mockStep)

      expect(result).toMatchObject({
        success: false,
        status: WorkflowStatus.FAILED,
        error: 'Execution failed',
        startedAt: expect.any(String),
        completedAt: expect.any(String),
        duration: expect.any(Number)
      })
    })

    it('should track metadata during execution', async () => {
      class MetadataWorkflow extends BaseWorkflow<{ input: string }, { output: string }> {
        protected async execute(params: { input: string }, step: WorkflowStep): Promise<{ output: string }> {
          this.setMetadata('testKey', 'testValue')
          this.setMetadata('count', 42)
          return { output: params.input }
        }
      }

      const metadataWorkflow = new MetadataWorkflow(mockCtx, mockEnv)
      const result = await metadataWorkflow.run(mockEvent, mockStep)

      expect(result.metadata).toEqual({
        testKey: 'testValue',
        count: 42
      })
    })
  })

  describe('executeStep', () => {
    it('should execute step successfully', async () => {
      const stepFn = vi.fn().mockResolvedValue('step result')
      const result = await (workflow as any).executeStep(
        mockStep,
        'test-step',
        stepFn
      )

      expect(result).toEqual({
        success: true,
        data: 'step result'
      })
      expect(mockStep.do).toHaveBeenCalledWith('TestWorkflow.test-step', expect.any(Function))
    })

    it('should handle step with retry configuration', async () => {
      const stepFn = vi.fn().mockResolvedValue('step result')
      const result = await (workflow as any).executeStep(
        mockStep,
        'retry-step',
        stepFn,
        { retry: true }
      )

      expect(result.success).toBe(true)
      expect(result.data).toBe('step result')
    })

    it('should handle step with custom retry config', async () => {
      const stepFn = vi.fn().mockResolvedValue('step result')
      const customRetry = { maxAttempts: 5, delay: 1000 }
      
      const result = await (workflow as any).executeStep(
        mockStep,
        'custom-retry-step',
        stepFn,
        { retry: customRetry }
      )

      expect(result.success).toBe(true)
    })

    it('should handle critical step failure', async () => {
      const stepFn = vi.fn().mockRejectedValue(new Error('Step failed'))
      
      await expect(
        (workflow as any).executeStep(mockStep, 'critical-step', stepFn)
      ).rejects.toThrow('Critical step failed')
    })

    it('should handle non-critical step failure', async () => {
      const stepFn = vi.fn().mockRejectedValue(new Error('Step failed'))
      
      const result = await (workflow as any).executeStep(
        mockStep,
        'non-critical-step',
        stepFn,
        { critical: false }
      )

      expect(result).toEqual({
        success: false,
        error: 'Step failed'
      })
    })

    it('should handle step with timeout', async () => {
      const stepFn = vi.fn().mockResolvedValue('result')
      
      const result = await (workflow as any).executeStep(
        mockStep,
        'timeout-step',
        stepFn,
        { timeout: 5000 }
      )

      expect(result.success).toBe(true)
    })

    it('should disable retry when retry is false', async () => {
      const stepFn = vi.fn().mockResolvedValue('result')
      
      const result = await (workflow as any).executeStep(
        mockStep,
        'no-retry-step',
        stepFn,
        { retry: false }
      )

      expect(result.success).toBe(true)
    })

    it('should log retry attempts with backoff', async () => {
      let callCount = 0
      const stepFn = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount < 3) {
          throw new Error('Temporary failure')
        }
        return 'success'
      })
      
      const result = await (workflow as any).executeStep(
        mockStep,
        'retry-step',
        stepFn,
        { 
          retry: {
            maxAttempts: 3,
            baseDelay: 10,
            maxDelay: 100
          }
        }
      )

      expect(result.success).toBe(true)
      expect(result.data).toBe('success')
      expect(callCount).toBe(3)
      expect(mockLogger.warn).toHaveBeenCalledTimes(2)
      expect(mockLogger.warn).toHaveBeenCalledWith('Step retry: retry-step', expect.objectContaining({
        attempt: 1,
        error: 'Temporary failure',
        delay: expect.any(Number)
      }))
    })
  })

  describe('executeParallelSteps', () => {
    it('should execute parallel steps successfully', async () => {
      const tasks = [
        { name: 'task1', fn: vi.fn().mockResolvedValue('result1') },
        { name: 'task2', fn: vi.fn().mockResolvedValue('result2') },
        { name: 'task3', fn: vi.fn().mockResolvedValue('result3') }
      ]

      const results = await (workflow as any).executeParallelSteps(mockStep, tasks)

      expect(results).toHaveLength(3)
      expect(results[0]).toEqual({ success: true, data: 'result1' })
      expect(results[1]).toEqual({ success: true, data: 'result2' })
      expect(results[2]).toEqual({ success: true, data: 'result3' })
    })

    it('should handle mixed success and failure in parallel steps', async () => {
      const tasks = [
        { name: 'success', fn: vi.fn().mockResolvedValue('ok') },
        { name: 'failure', fn: vi.fn().mockRejectedValue(new Error('failed')), critical: false },
        { name: 'success2', fn: vi.fn().mockResolvedValue('ok2') }
      ]

      const results = await (workflow as any).executeParallelSteps(mockStep, tasks)

      expect(results).toHaveLength(3)
      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(false)
      expect(results[2].success).toBe(true)
    })
  })

  describe('executeConditionalStep', () => {
    it('should execute step when condition is true', async () => {
      const stepFn = vi.fn().mockResolvedValue('result')
      const condition = vi.fn().mockReturnValue(true)

      const result = await (workflow as any).executeConditionalStep(
        mockStep,
        'conditional-step',
        condition,
        stepFn
      )

      expect(condition).toHaveBeenCalled()
      expect(stepFn).toHaveBeenCalled()
      expect(result).toEqual({ success: true, data: 'result' })
    })

    it('should skip step when condition is false', async () => {
      const stepFn = vi.fn().mockResolvedValue('result')
      const condition = vi.fn().mockReturnValue(false)

      const result = await (workflow as any).executeConditionalStep(
        mockStep,
        'conditional-step',
        condition,
        stepFn
      )

      expect(condition).toHaveBeenCalled()
      expect(stepFn).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

    it('should handle async condition', async () => {
      const stepFn = vi.fn().mockResolvedValue('result')
      const condition = vi.fn().mockResolvedValue(true)

      const result = await (workflow as any).executeConditionalStep(
        mockStep,
        'async-conditional',
        condition,
        stepFn
      )

      expect(result).toEqual({ success: true, data: 'result' })
    })
  })

  describe('sleep', () => {
    it('should call step.sleep with correct duration', async () => {
      await (workflow as any).sleep(mockStep, 1000, 'test reason')

      expect(mockStep.sleep).toHaveBeenCalledWith('1000')
    })

    it('should handle sleep without reason', async () => {
      await (workflow as any).sleep(mockStep, 500)

      expect(mockStep.sleep).toHaveBeenCalledWith('500')
    })
  })

  describe('callWorkflow', () => {
    it('should call external workflow successfully', async () => {
      const mockWorkflow = {
        create: vi.fn().mockResolvedValue({
          status: vi.fn().mockResolvedValue({
            status: 'complete',
            output: { result: 'external result' }
          })
        })
      }

      mockStep.do.mockImplementation(async (name, fn) => fn())

      const result = await (workflow as any).callWorkflow(
        mockStep,
        mockWorkflow,
        { param: 'value' },
        'external-workflow'
      )

      expect(result).toEqual({ result: 'external result' })
      expect(mockWorkflow.create).toHaveBeenCalledWith({ params: { param: 'value' } })
    })

    it('should handle external workflow failure', async () => {
      const mockWorkflow = {
        create: vi.fn().mockResolvedValue({
          status: vi.fn().mockResolvedValue({
            status: 'failed',
            error: 'External workflow failed'
          })
        })
      }

      mockStep.do.mockImplementation(async (name, fn) => fn())

      await expect(
        (workflow as any).callWorkflow(mockStep, mockWorkflow, {}, 'failed-workflow')
      ).rejects.toThrow('Called workflow failed: failed-workflow')
    })
  })

  describe('metadata methods', () => {
    it('should set and get metadata', async () => {
      // Test metadata is set during workflow execution
      class MetadataTestWorkflow extends BaseWorkflow<{ input: string }, { output: string }> {
        protected async execute(params: { input: string }, step: WorkflowStep): Promise<{ output: string }> {
          this.setMetadata('key1', 'value1')
          this.setMetadata('key2', { nested: 'object' })
          
          const value1 = this.getMetadata('key1')
          const value2 = this.getMetadata('key2')
          const nonexistent = this.getMetadata('nonexistent')
          
          expect(value1).toBe('value1')
          expect(value2).toEqual({ nested: 'object' })
          expect(nonexistent).toBeUndefined()
          
          return { output: 'done' }
        }
      }
      
      const testWorkflow = new MetadataTestWorkflow(mockCtx, mockEnv)
      const result = await testWorkflow.run(mockEvent, mockStep)
      
      expect(result.metadata).toEqual({
        key1: 'value1',
        key2: { nested: 'object' }
      })
    })
  })

  describe('reportProgress', () => {
    it('should report progress with message', async () => {
      class ProgressTestWorkflow extends BaseWorkflow<{ input: string }, { output: string }> {
        protected async execute(params: { input: string }, step: WorkflowStep): Promise<{ output: string }> {
          this.reportProgress(5, 10, 'Processing items')
          return { output: 'done' }
        }
      }
      
      const testWorkflow = new ProgressTestWorkflow(mockCtx, mockEnv)
      const result = await testWorkflow.run(mockEvent, mockStep)
      
      expect(result.metadata?.progress).toEqual({
        current: 5,
        total: 10,
        percentage: 50,
        message: 'Processing items'
      })
    })

    it('should report progress without message', async () => {
      class ProgressTestWorkflow extends BaseWorkflow<{ input: string }, { output: string }> {
        protected async execute(params: { input: string }, step: WorkflowStep): Promise<{ output: string }> {
          this.reportProgress(75, 100)
          return { output: 'done' }
        }
      }
      
      const testWorkflow = new ProgressTestWorkflow(mockCtx, mockEnv)
      const result = await testWorkflow.run(mockEvent, mockStep)
      
      expect(result.metadata?.progress).toEqual({
        current: 75,
        total: 100,
        percentage: 75,
        message: undefined
      })
    })

    it('should calculate percentage correctly', async () => {
      class ProgressTestWorkflow extends BaseWorkflow<{ input: string }, { output: string }> {
        protected async execute(params: { input: string }, step: WorkflowStep): Promise<{ output: string }> {
          this.reportProgress(33, 100)
          const progress1 = this.getMetadata('progress')
          expect(progress1.percentage).toBe(33)
          
          this.reportProgress(2, 3)
          const progress2 = this.getMetadata('progress')
          expect(progress2.percentage).toBe(67)
          
          return { output: 'done' }
        }
      }
      
      const testWorkflow = new ProgressTestWorkflow(mockCtx, mockEnv)
      await testWorkflow.run(mockEvent, mockStep)
    })
  })

  describe('handleError', () => {
    it('should rethrow AppError', () => {
      const appError = new AppError(
        ErrorCodes.VALIDATION_ERROR,
        'Validation failed',
        400
      )

      expect(() => {
        (workflow as any).handleError(appError, 'test-context')
      }).toThrow(appError)
    })

    it('should wrap non-AppError in AppError', () => {
      const regularError = new Error('Regular error')

      expect(() => {
        (workflow as any).handleError(regularError, 'test-context')
      }).toThrow('Workflow error in test-context: Regular error')
    })

    it('should handle non-Error objects', () => {
      expect(() => {
        (workflow as any).handleError('string error', 'test-context')
      }).toThrow('Workflow error in test-context: string error')
    })
  })
})