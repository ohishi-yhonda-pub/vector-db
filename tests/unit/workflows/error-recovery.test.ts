import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ErrorRecoveryManager, ErrorInfo, RecoveryStrategy } from '../../../src/workflows/error-recovery'
import { AppError, ErrorCodes } from '../../../src/utils/error-handler'

// WorkflowStep のモック
const mockWorkflowStep = {
  do: vi.fn(),
  sleep: vi.fn().mockResolvedValue(undefined)
}

describe('ErrorRecoveryManager', () => {
  let errorRecovery: ErrorRecoveryManager
  let strategy: RecoveryStrategy

  beforeEach(() => {
    strategy = {
      maxRetries: 3,
      retryDelayMs: 1000,
      fallbackEnabled: true,
      skipOnError: false
    }
    errorRecovery = new ErrorRecoveryManager(strategy)
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with default strategy', () => {
      const manager = new ErrorRecoveryManager()
      expect(manager.getAllErrors()).toEqual([])
    })

    it('should initialize with custom strategy', () => {
      const customStrategy = { maxRetries: 5, retryDelayMs: 2000 }
      const manager = new ErrorRecoveryManager(customStrategy)
      expect(manager.getAllErrors()).toEqual([])
    })
  })

  describe('recordError', () => {
    it('should record error information', () => {
      const error = new Error('Test error')
      const errorInfo = errorRecovery.recordError(error, 'test-step', 1)

      expect(errorInfo).toEqual({
        type: 'UNKNOWN_ERROR',
        message: 'Test error',
        stepName: 'test-step',
        timestamp: expect.any(String),
        retryCount: 1,
        recoverable: false
      })

      expect(errorRecovery.getAllErrors()).toHaveLength(1)
    })

    it('should record AppError with correct error code', () => {
      const error = new AppError(ErrorCodes.TIMEOUT, 'Timeout error', 408)
      const errorInfo = errorRecovery.recordError(error, 'timeout-step', 2)

      expect(errorInfo.type).toBe(ErrorCodes.TIMEOUT)
      expect(errorInfo.recoverable).toBe(true)
    })

    it('should record error with default retry count', () => {
      const error = new Error('Test error')
      const errorInfo = errorRecovery.recordError(error, 'test-step')

      expect(errorInfo.retryCount).toBe(0)
    })
  })

  describe('isRecoverable', () => {
    it('should identify recoverable AppErrors', () => {
      const recoverableErrors = [
        new AppError(ErrorCodes.TIMEOUT, 'Timeout', 408),
        new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Service down', 503),
        new AppError(ErrorCodes.EXTERNAL_SERVICE_ERROR, 'External error', 502),
        new AppError(ErrorCodes.NOTION_API_ERROR, 'Notion error', 500)
      ]

      recoverableErrors.forEach(error => {
        expect(errorRecovery.isRecoverable(error)).toBe(true)
      })
    })

    it('should identify non-recoverable AppErrors', () => {
      const nonRecoverableErrors = [
        new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid input', 400),
        new AppError(ErrorCodes.UNAUTHORIZED, 'Unauthorized', 401),
        new AppError(ErrorCodes.NOT_FOUND, 'Not found', 404)
      ]

      nonRecoverableErrors.forEach(error => {
        expect(errorRecovery.isRecoverable(error)).toBe(false)
      })
    })

    it('should identify recoverable errors by message', () => {
      const recoverableMessages = [
        'timeout occurred',
        'network error',
        'connection failed',
        'rate limit exceeded',
        'temporarily unavailable'
      ]

      recoverableMessages.forEach(message => {
        const error = new Error(message)
        expect(errorRecovery.isRecoverable(error)).toBe(true)
      })
    })

    it('should identify non-recoverable errors by message', () => {
      const error = new Error('syntax error')
      expect(errorRecovery.isRecoverable(error)).toBe(false)
    })
  })

  describe('canRetry', () => {
    it('should allow retry for new step', () => {
      expect(errorRecovery.canRetry('new-step')).toBe(true)
    })

    it('should allow retry for recoverable error under max retries', () => {
      const recoverableError = new AppError(ErrorCodes.TIMEOUT, 'Timeout', 408)
      errorRecovery.recordError(recoverableError, 'test-step', 1)

      expect(errorRecovery.canRetry('test-step')).toBe(true)
    })

    it('should not allow retry for non-recoverable error', () => {
      const nonRecoverableError = new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid', 400)
      errorRecovery.recordError(nonRecoverableError, 'test-step', 1)

      expect(errorRecovery.canRetry('test-step')).toBe(false)
    })

    it('should not allow retry when max retries exceeded', () => {
      const recoverableError = new AppError(ErrorCodes.TIMEOUT, 'Timeout', 408)
      errorRecovery.recordError(recoverableError, 'test-step', 3) // Max retries reached

      expect(errorRecovery.canRetry('test-step')).toBe(false)
    })
  })

  describe('getNextRetryCount', () => {
    it('should return 1 for new step', () => {
      expect(errorRecovery.getNextRetryCount('new-step')).toBe(1)
    })

    it('should return incremented retry count', () => {
      const error = new Error('Test error')
      errorRecovery.recordError(error, 'test-step', 1)
      errorRecovery.recordError(error, 'test-step', 2)

      expect(errorRecovery.getNextRetryCount('test-step')).toBe(3)
    })
  })

  describe('getRetryDelay', () => {
    it('should calculate exponential backoff delay', () => {
      expect(errorRecovery.getRetryDelay(1)).toBe(1000) // 1000 * 2^0
      expect(errorRecovery.getRetryDelay(2)).toBe(2000) // 1000 * 2^1
      expect(errorRecovery.getRetryDelay(3)).toBe(4000) // 1000 * 2^2
    })
  })

  describe('executeWithRetry', () => {
    it('should execute operation successfully on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success')
      mockWorkflowStep.do.mockImplementation((name, fn) => fn())

      const result = await errorRecovery.executeWithRetry(
        mockWorkflowStep,
        'test-step',
        operation
      )

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(1)
    })

    it('should retry on recoverable error and succeed', async () => {
      const recoverableError = new AppError(ErrorCodes.TIMEOUT, 'Timeout', 408)
      const operation = vi.fn()
        .mockRejectedValueOnce(recoverableError)
        .mockResolvedValue('success')

      mockWorkflowStep.do.mockImplementation((name, fn) => fn())

      const result = await errorRecovery.executeWithRetry(
        mockWorkflowStep,
        'test-step',
        operation
      )

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(2)
      expect(mockWorkflowStep.sleep).toHaveBeenCalledWith(1000)
    })

    it('should fail after max retries exceeded', async () => {
      const recoverableError = new AppError(ErrorCodes.TIMEOUT, 'Timeout', 408)
      const operation = vi.fn().mockRejectedValue(recoverableError)
      mockWorkflowStep.do.mockImplementation((name, fn) => fn())

      await expect(
        errorRecovery.executeWithRetry(mockWorkflowStep, 'test-step', operation)
      ).rejects.toThrow('Timeout')

      expect(operation).toHaveBeenCalledTimes(3) // Max retries
      expect(errorRecovery.getAllErrors()).toHaveLength(3)
    })

    it('should not retry on non-recoverable error', async () => {
      const nonRecoverableError = new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid', 400)
      const operation = vi.fn().mockRejectedValue(nonRecoverableError)
      mockWorkflowStep.do.mockImplementation((name, fn) => fn())

      await expect(
        errorRecovery.executeWithRetry(mockWorkflowStep, 'test-step', operation)
      ).rejects.toThrow('Invalid')

      expect(operation).toHaveBeenCalledTimes(1)
      expect(errorRecovery.getAllErrors()).toHaveLength(1)
    })
  })

  describe('executeWithFallback', () => {
    it('should execute primary operation successfully', async () => {
      const primaryOperation = vi.fn().mockResolvedValue('primary-success')
      const fallbackOperation = vi.fn()
      mockWorkflowStep.do.mockImplementation((name, fn) => fn())

      const result = await errorRecovery.executeWithFallback(
        mockWorkflowStep,
        'test-step',
        primaryOperation,
        fallbackOperation
      )

      expect(result).toBe('primary-success')
      expect(primaryOperation).toHaveBeenCalledTimes(1)
      expect(fallbackOperation).not.toHaveBeenCalled()
    })

    it('should execute fallback on primary failure', async () => {
      const primaryError = new AppError(ErrorCodes.TIMEOUT, 'Timeout', 408)
      const primaryOperation = vi.fn().mockRejectedValue(primaryError)
      const fallbackOperation = vi.fn().mockResolvedValue('fallback-success')
      mockWorkflowStep.do.mockImplementation((name, fn) => fn())

      const result = await errorRecovery.executeWithFallback(
        mockWorkflowStep,
        'test-step',
        primaryOperation,
        fallbackOperation
      )

      expect(result).toBe('fallback-success')
      expect(fallbackOperation).toHaveBeenCalledTimes(1)
    })

    it('should throw primary error when fallback also fails', async () => {
      const primaryError = new AppError(ErrorCodes.TIMEOUT, 'Primary timeout', 408)
      const fallbackError = new Error('Fallback failed')
      const primaryOperation = vi.fn().mockRejectedValue(primaryError)
      const fallbackOperation = vi.fn().mockRejectedValue(fallbackError)
      mockWorkflowStep.do.mockImplementation((name, fn) => fn())

      await expect(
        errorRecovery.executeWithFallback(
          mockWorkflowStep,
          'test-step',
          primaryOperation,
          fallbackOperation
        )
      ).rejects.toThrow('Primary timeout')
    })

    it('should skip on error when skipOnError is true', async () => {
      const manager = new ErrorRecoveryManager({ ...strategy, skipOnError: true })
      const primaryError = new AppError(ErrorCodes.TIMEOUT, 'Timeout', 408)
      const primaryOperation = vi.fn().mockRejectedValue(primaryError)
      mockWorkflowStep.do.mockImplementation((name, fn) => fn())

      const result = await manager.executeWithFallback(
        mockWorkflowStep,
        'test-step',
        primaryOperation
      )

      expect(result).toBeNull()
    })
  })

  describe('handlePartialSuccess', () => {
    it('should handle mixed success and failure results', () => {
      const results = [
        { success: true, data: 'result1' },
        { success: false, error: new Error('Error2') },
        { success: true, data: 'result3' }
      ]

      const handled = errorRecovery.handlePartialSuccess(results, 'batch-step')

      expect(handled.successful).toEqual(['result1', 'result3'])
      expect(handled.failed).toHaveLength(1)
      expect(handled.hasErrors).toBe(true)
    })

    it('should handle all successful results', () => {
      const results = [
        { success: true, data: 'result1' },
        { success: true, data: 'result2' }
      ]

      const handled = errorRecovery.handlePartialSuccess(results, 'batch-step')

      expect(handled.successful).toEqual(['result1', 'result2'])
      expect(handled.failed).toHaveLength(0)
      expect(handled.hasErrors).toBe(false)
    })

    it('should handle all failed results', () => {
      const results = [
        { success: false, error: new Error('Error1') },
        { success: false, error: new Error('Error2') }
      ]

      const handled = errorRecovery.handlePartialSuccess(results, 'batch-step')

      expect(handled.successful).toHaveLength(0)
      expect(handled.failed).toHaveLength(2)
      expect(handled.hasErrors).toBe(true)
    })
  })

  describe('getErrorSummary', () => {
    beforeEach(() => {
      errorRecovery.recordError(new AppError(ErrorCodes.TIMEOUT, 'Timeout1', 408), 'step1', 1)
      errorRecovery.recordError(new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid', 400), 'step2', 1)
      errorRecovery.recordError(new AppError(ErrorCodes.TIMEOUT, 'Timeout2', 408), 'step1', 2)
    })

    it('should generate error summary', () => {
      const summary = errorRecovery.getErrorSummary()

      expect(summary.totalErrors).toBe(3)
      expect(summary.recoverableErrors).toBe(2)
      expect(summary.unrecoverableErrors).toBe(1)
      expect(summary.stepErrorCounts).toEqual({ step1: 2, step2: 1 })
      expect(summary.mostCommonError).toBe(ErrorCodes.TIMEOUT)
    })
  })

  describe('clearErrors', () => {
    it('should clear all recorded errors', () => {
      errorRecovery.recordError(new Error('Test error'), 'test-step', 1)
      expect(errorRecovery.getAllErrors()).toHaveLength(1)

      errorRecovery.clearErrors()
      expect(errorRecovery.getAllErrors()).toHaveLength(0)
    })
  })

  describe('updateStrategy', () => {
    it('should update recovery strategy', () => {
      const newStrategy = { maxRetries: 5, retryDelayMs: 2000 }
      errorRecovery.updateStrategy(newStrategy)

      expect(errorRecovery.getRetryDelay(1)).toBe(2000) // Using new retryDelayMs
    })

    it('should partially update strategy', () => {
      errorRecovery.updateStrategy({ maxRetries: 5 })

      expect(errorRecovery.getRetryDelay(1)).toBe(1000) // Original retryDelayMs preserved
    })
  })
})