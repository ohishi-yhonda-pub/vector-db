/**
 * ZodError branch coverage tests
 */

import { describe, it, expect, vi } from 'vitest'
import { generateEmbedding, batchEmbedding } from '../src/embeddings'
import { createVector, searchVectors, deleteAllVectors } from '../src/vectors'

describe('ZodError Branch Coverage', () => {
  const mockEnv = {
    AI: { run: vi.fn() },
    VECTORIZE_INDEX: { insert: vi.fn(), query: vi.fn(), list: vi.fn(), deleteByIds: vi.fn() },
    DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5'
  }

  const mockContext = {
    req: {
      json: vi.fn(),
      query: vi.fn()
    },
    json: vi.fn().mockReturnValue({ status: 400 }),
    env: mockEnv
  }

  it('covers ZodError in generateEmbedding', async () => {
    mockContext.req.json.mockResolvedValue({ text: 123 })
    await generateEmbedding(mockContext as any)
    expect(mockContext.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Invalid request:')
      }),
      400
    )
  })

  it('covers ZodError in batchEmbedding', async () => {
    mockContext.req.json.mockResolvedValue({ texts: 'not-array' })
    await batchEmbedding(mockContext as any)
    expect(mockContext.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Invalid request:')
      }),
      400
    )
  })

  it('covers ZodError in createVector', async () => {
    mockContext.req.json.mockResolvedValue({ values: 'not-array' })
    await createVector(mockContext as any)
    expect(mockContext.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Invalid request:')
      }),
      400
    )
  })

  it('covers ZodError in searchVectors', async () => {
    mockContext.req.json.mockResolvedValue({ topK: 'not-number' })
    await searchVectors(mockContext as any)
    expect(mockContext.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Invalid request:')
      }),
      400
    )
  })

  it('covers ZodError in deleteAllVectors', async () => {
    mockContext.req.json.mockResolvedValue({ vectorIds: 'not-array' })
    await deleteAllVectors(mockContext as any)
    expect(mockContext.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Invalid request:')
      }),
      400
    )
  })
})