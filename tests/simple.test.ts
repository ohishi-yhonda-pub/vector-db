import { describe, it, expect } from 'vitest'

describe('Simple test', () => {
  it('should pass basic test', () => {
    expect(1 + 1).toBe(2)
  })

  it('should test string', () => {
    expect('hello').toBe('hello')
  })
})