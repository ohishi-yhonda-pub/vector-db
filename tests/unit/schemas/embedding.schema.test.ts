import { describe, it, expect } from 'vitest'
import { GenerateEmbeddingSchema } from '../../../src/schemas/embedding.schema'

describe('GenerateEmbeddingSchema', () => {
  it('should validate valid input with text and model', () => {
    const validInput = {
      text: 'This is a test text',
      model: '@cf/baai/bge-base-en-v1.5'
    }

    const result = GenerateEmbeddingSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validInput)
    }
  })

  it('should validate valid input with only text', () => {
    const validInput = {
      text: 'This is a test text'
    }

    const result = GenerateEmbeddingSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validInput)
    }
  })

  it('should reject input without text field', () => {
    const invalidInput = {
      model: '@cf/baai/bge-base-en-v1.5'
    }

    const result = GenerateEmbeddingSchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['text'])
      expect(result.error.issues[0].code).toBe('invalid_type')
    }
  })

  it('should reject input with empty text', () => {
    const invalidInput = {
      text: '',
      model: '@cf/baai/bge-base-en-v1.5'
    }

    const result = GenerateEmbeddingSchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['text'])
      expect(result.error.issues[0].code).toBe('too_small')
    }
  })

  it('should reject input with non-string text', () => {
    const invalidInput = {
      text: 123,
      model: '@cf/baai/bge-base-en-v1.5'
    }

    const result = GenerateEmbeddingSchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['text'])
      expect(result.error.issues[0].code).toBe('invalid_type')
    }
  })

  it('should reject input with non-string model', () => {
    const invalidInput = {
      text: 'Test text',
      model: 123
    }

    const result = GenerateEmbeddingSchema.safeParse(invalidInput)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['model'])
      expect(result.error.issues[0].code).toBe('invalid_type')
    }
  })

  it('should handle null and undefined values correctly', () => {
    const nullInput = {
      text: 'Test text',
      model: null
    }

    const result = GenerateEmbeddingSchema.safeParse(nullInput)
    expect(result.success).toBe(false)

    const undefinedInput = {
      text: 'Test text',
      model: undefined
    }

    const undefinedResult = GenerateEmbeddingSchema.safeParse(undefinedInput)
    expect(undefinedResult.success).toBe(true)
    if (undefinedResult.success) {
      expect(undefinedResult.data.model).toBeUndefined()
    }
  })
})