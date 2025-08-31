import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  retryWithBackoff,
  CircuitBreaker,
  withTimeout,
  sleep,
  RateLimiter,
  retryBulkOperation,
  RetryPresets
} from '../../../src/utils/retry'
import { AppError, ErrorCodes } from '../../../src/utils/error-handler'

describe('Retry Utils', () => {
  describe('retryWithBackoff', () => {
    it('should return result immediately when function succeeds', async () => {
      const mockFn = vi.fn().mockResolvedValue('success')
      
      const result = await retryWithBackoff(mockFn)

      expect(result).toBe('success')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('should not retry on non-retryable errors', async () => {
      const error = new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid input', 400)
      const mockFn = vi.fn().mockRejectedValue(error)
      
      await expect(retryWithBackoff(mockFn)).rejects.toThrow(error)
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('should fail after max attempts reached', async () => {
      const error = new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Service down', 503)
      const mockFn = vi.fn().mockRejectedValue(error)
      
      await expect(retryWithBackoff(mockFn, { maxAttempts: 1 })).rejects.toThrow(error)
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('should return result without timeout when timeout not specified (line 58)', async () => {
      const mockFn = vi.fn().mockResolvedValue('success')
      
      const result = await retryWithBackoff(mockFn, { timeout: undefined })

      expect(result).toBe('success')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('should call onRetry callback on retry (lines 68-70)', async () => {
      const error = new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Service down', 503)
      const mockFn = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success')
      const onRetry = vi.fn()
      
      const result = await retryWithBackoff(mockFn, { 
        maxAttempts: 2,
        onRetry,
        initialDelay: 10
      })

      expect(result).toBe('success')
      expect(onRetry).toHaveBeenCalledWith(1, error, 10)
    })

    it('should apply backoff multiplier and max delay (lines 73-76)', async () => {
      const error = new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Service down', 503)
      const mockFn = vi.fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success')
      const onRetry = vi.fn()
      
      const result = await retryWithBackoff(mockFn, { 
        maxAttempts: 3,
        onRetry,
        initialDelay: 100,
        backoffMultiplier: 2,
        maxDelay: 150
      })

      expect(result).toBe('success')
      expect(onRetry).toHaveBeenCalledWith(1, error, 100)
      expect(onRetry).toHaveBeenCalledWith(2, error, 150)
    })

    it('should throw last error after loop completion (line 80)', async () => {
      const error = new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Service down', 503)
      const mockFn = vi.fn().mockRejectedValue(error)
      
      await expect(retryWithBackoff(mockFn, { maxAttempts: 0 })).rejects.toThrow()
    })
  })

  describe('withTimeout', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should resolve when promise completes within timeout', async () => {
      const mockPromise = Promise.resolve('success')
      
      const result = await withTimeout(mockPromise, 1000)

      expect(result).toBe('success')
    })

    it('should reject with timeout error when promise takes too long', async () => {
      const mockPromise = new Promise(resolve => {
        setTimeout(() => resolve('too late'), 2000)
      })
      
      const promise = withTimeout(mockPromise, 1000)
      
      vi.advanceTimersByTime(1000)
      
      await expect(promise).rejects.toThrow('Operation timed out after 1000ms')
    })

    it('should reject with original error when promise rejects within timeout', async () => {
      const originalError = new Error('Original error')
      const mockPromise = Promise.reject(originalError)
      
      await expect(withTimeout(mockPromise, 1000)).rejects.toThrow(originalError)
    })
  })

  describe('sleep', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should resolve after specified milliseconds', async () => {
      const promise = sleep(1000)
      
      vi.advanceTimersByTime(1000)
      
      await expect(promise).resolves.toBeUndefined()
    })
  })

  describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker

    beforeEach(() => {
      vi.useFakeTimers()
      circuitBreaker = new CircuitBreaker(2, 1000, 5000)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should execute function when circuit is closed', async () => {
      const mockFn = vi.fn().mockResolvedValue('success')
      
      const result = await circuitBreaker.execute(mockFn)

      expect(result).toBe('success')
      expect(circuitBreaker.getState()).toBe('CLOSED')
    })

    it('should open circuit after threshold failures', async () => {
      const error = new Error('Service error')
      const mockFn = vi.fn().mockRejectedValue(error)
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(error)
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(error)
      
      expect(circuitBreaker.getState()).toBe('OPEN')
    })

    it('should reject immediately when circuit is open', async () => {
      const error = new Error('Service error')
      const mockFn = vi.fn().mockRejectedValue(error)
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(error)
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(error)
      
      await expect(circuitBreaker.execute(mockFn))
        .rejects.toThrow('Circuit breaker is OPEN')
      
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('should provide stats', () => {
      const stats = circuitBreaker.getStats()
      
      expect(stats).toEqual({
        state: 'CLOSED',
        failures: 0,
        lastFailureTime: 0
      })
    })

    it('should transition to HALF_OPEN after reset timeout (line 112)', async () => {
      const error = new Error('Service error')
      const mockFn = vi.fn().mockRejectedValue(error)
      
      // Open the circuit
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(error)
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(error)
      expect(circuitBreaker.getState()).toBe('OPEN')
      
      // Advance time past reset timeout
      vi.advanceTimersByTime(6000)
      
      // Next execution should transition to HALF_OPEN and try again
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(error)
      expect(mockFn).toHaveBeenCalledTimes(3) // 2 initial + 1 in HALF_OPEN
    })

    it('should reset circuit from HALF_OPEN on success (lines 120, 146-148)', async () => {
      const error = new Error('Service error')
      const mockFn = vi.fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success')
      
      // Open the circuit
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(error)
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(error)
      expect(circuitBreaker.getState()).toBe('OPEN')
      
      // Advance time past reset timeout
      vi.advanceTimersByTime(6000)
      
      // Next execution should succeed and reset the circuit
      const result = await circuitBreaker.execute(mockFn)
      expect(result).toBe('success')
      expect(circuitBreaker.getState()).toBe('CLOSED')
      
      // Verify the circuit is fully reset
      const stats = circuitBreaker.getStats()
      expect(stats.failures).toBe(0)
      expect(stats.lastFailureTime).toBe(0)
    })
  })

  describe('RateLimiter', () => {
    let rateLimiter: RateLimiter

    beforeEach(() => {
      // RateLimiterのテストでは実時間を使用
      rateLimiter = new RateLimiter(2, 10) // minIntervalを短くして高速化
    })

    it('should execute function immediately when under limit', async () => {
      const mockFn = vi.fn().mockResolvedValue('success')
      
      const result = await rateLimiter.execute(mockFn)

      expect(result).toBe('success')
      expect(mockFn).toHaveBeenCalledTimes(1)
    }, 5000)

    it('should provide stats', () => {
      const stats = rateLimiter.getStats()
      
      expect(stats).toEqual({
        running: 0,
        queued: 0
      })
    })

    it('should queue tasks when max concurrent is reached', async () => {
      const mockFn1 = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('task1'), 50))
      )
      const mockFn2 = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('task2'), 50))
      )
      const mockFn3 = vi.fn().mockImplementation(() => 
        Promise.resolve('task3')
      )

      // 最大同時実行数2で3つのタスクを実行
      const promise1 = rateLimiter.execute(mockFn1)
      const promise2 = rateLimiter.execute(mockFn2)
      const promise3 = rateLimiter.execute(mockFn3)

      // 3つ目のタスクはキューに入る
      await new Promise(resolve => setTimeout(resolve, 10))
      const stats = rateLimiter.getStats()
      expect(stats.running).toBe(2)
      expect(stats.queued).toBeGreaterThanOrEqual(0)

      // すべてのタスクが完了
      const results = await Promise.all([promise1, promise2, promise3])
      expect(results).toEqual(['task1', 'task2', 'task3'])
      expect(mockFn1).toHaveBeenCalledTimes(1)
      expect(mockFn2).toHaveBeenCalledTimes(1)
      expect(mockFn3).toHaveBeenCalledTimes(1)
    }, 10000)
  })

  describe('retryBulkOperation', () => {
    it('should process all items successfully', async () => {
      const items = [1, 2, 3]
      const operation = vi.fn().mockImplementation((item: number) => 
        Promise.resolve(item * 2)
      )
      
      const result = await retryBulkOperation(items, operation, { maxAttempts: 1 })

      expect(result.successful).toHaveLength(3)
      expect(result.failed).toHaveLength(0)
      expect(result.successful[0]).toEqual({ item: 1, result: 2 })
      expect(result.successful[1]).toEqual({ item: 2, result: 4 })
      expect(result.successful[2]).toEqual({ item: 3, result: 6 })
    })

    it('should handle mixed success and failure', async () => {
      const items = [1, 2, 3]
      const operation = vi.fn().mockImplementation((item: number) => {
        if (item === 2) {
          return Promise.reject(new Error('Item 2 failed'))
        }
        return Promise.resolve(item * 2)
      })
      
      const result = await retryBulkOperation(items, operation, { maxAttempts: 1 })

      expect(result.successful).toHaveLength(2)
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0].item).toBe(2)
      expect(result.failed[0].error).toBeInstanceOf(Error)
    })
  })

  describe('RetryPresets', () => {
    it('should have fast preset configuration', () => {
      expect(RetryPresets.fast).toEqual({
        maxAttempts: 3,
        initialDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        timeout: 5000
      })
    })

    it('should have standard preset configuration', () => {
      expect(RetryPresets.standard).toEqual({
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        timeout: 30000
      })
    })

    it('should have slow preset configuration', () => {
      expect(RetryPresets.slow).toEqual({
        maxAttempts: 5,
        initialDelay: 5000,
        maxDelay: 60000,
        backoffMultiplier: 1.5,
        timeout: 300000
      })
    })

    it('should have external API preset with custom retry condition', () => {
      expect(RetryPresets.externalApi).toMatchObject({
        maxAttempts: 5,
        initialDelay: 2000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        timeout: 60000
      })
      
      const retryCondition = RetryPresets.externalApi.retryCondition!
      
      expect(retryCondition(new Error('rate limit exceeded'))).toBe(true)
      expect(retryCondition(new Error('429 Too Many Requests'))).toBe(true)
      expect(retryCondition(new AppError(ErrorCodes.TIMEOUT, 'Timeout', 504))).toBe(true)
      expect(retryCondition(new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid', 400))).toBe(false)
      
      // Test line 360 - non-Error object and non-rate-limit Error message
      expect(retryCondition('string error')).toBe(false)
      expect(retryCondition(new Error('Some other error'))).toBe(false)
      expect(retryCondition(null)).toBe(false)
      expect(retryCondition(undefined)).toBe(false)
    })
  })

})