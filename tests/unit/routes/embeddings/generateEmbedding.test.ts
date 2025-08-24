import { describe, it, expect, vi } from 'vitest'
import { generateEmbedding } from '../../../../src/routes/api/embeddings/generate'
import type { GenerateEmbedding } from '../../../../src/schemas/embedding.schema'

describe('generateEmbedding function', () => {
  const mockAIEmbeddings = {
    generateEmbedding: vi.fn()
  }

  it('should generate embeddings successfully', async () => {
    const mockResult = {
      jobId: 'job-123',
      workflowId: 'workflow-456',
      status: 'processing'
    }
    
    mockAIEmbeddings.generateEmbedding.mockResolvedValue(mockResult)

    const params: GenerateEmbedding = {
      text: 'Test text for embedding',
      model: '@cf/baai/bge-base-en-v1.5'
    }

    const result = await generateEmbedding(params, mockAIEmbeddings as any)

    expect(mockAIEmbeddings.generateEmbedding).toHaveBeenCalledWith(
      'Test text for embedding',
      '@cf/baai/bge-base-en-v1.5'
    )
    expect(result).toEqual({
      success: true,
      data: mockResult,
      message: 'テキストの処理を開始しました'
    })
  })

  it('should generate embeddings with default model', async () => {
    const mockResult = {
      jobId: 'job-789',
      workflowId: 'workflow-012',
      status: 'processing'
    }
    
    mockAIEmbeddings.generateEmbedding.mockResolvedValue(mockResult)

    const params: GenerateEmbedding = {
      text: 'Test text without model'
    }

    const result = await generateEmbedding(params, mockAIEmbeddings as any)

    expect(mockAIEmbeddings.generateEmbedding).toHaveBeenCalledWith(
      'Test text without model',
      undefined
    )
    expect(result).toEqual({
      success: true,
      data: mockResult,
      message: 'テキストの処理を開始しました'
    })
  })

  it('should handle empty text gracefully', async () => {
    const mockResult = {
      jobId: 'job-empty',
      workflowId: 'workflow-empty',
      status: 'processing'
    }
    
    mockAIEmbeddings.generateEmbedding.mockResolvedValue(mockResult)

    const params: GenerateEmbedding = {
      text: ''
    }

    const result = await generateEmbedding(params, mockAIEmbeddings as any)

    expect(mockAIEmbeddings.generateEmbedding).toHaveBeenCalledWith('', undefined)
    expect(result).toEqual({
      success: true,
      data: mockResult,
      message: 'テキストの処理を開始しました'
    })
  })

  it('should propagate errors from AIEmbeddings', async () => {
    const mockError = new Error('AI service error')
    mockAIEmbeddings.generateEmbedding.mockRejectedValue(mockError)

    const params: GenerateEmbedding = {
      text: 'Test text'
    }

    await expect(generateEmbedding(params, mockAIEmbeddings as any))
      .rejects.toThrow('AI service error')
  })
})