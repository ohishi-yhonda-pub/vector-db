/**
 * Embedding generation functions
 */

import { z } from '@hono/zod-openapi'
import { EmbeddingRequestSchema, BatchEmbeddingRequestSchema } from './schemas'

// Type for AI embedding result
interface EmbeddingResult {
  data?: number[][]
  shape?: number[]
}

/**
 * Generate embedding for a single text
 */
export const generateEmbedding = async (c: any) => {
  try {
    const body = await c.req.json()
    const parsed = EmbeddingRequestSchema.parse(body)
    
    const result = await c.env.AI.run(
      '@cf/baai/bge-base-en-v1.5',
      { text: [parsed.text] }
    ) as EmbeddingResult
    
    const embedding = result.data?.[0]
    if (!embedding) {
      throw new Error('Failed to generate embedding')
    }
    
    return c.json({
      success: true,
      data: {
        embedding,
        model: c.env.DEFAULT_EMBEDDING_MODEL,
        dimensions: embedding.length
      }
    })
  } catch (err) {
    console.error('Embedding generation error:', err)
    if (err instanceof z.ZodError) {
      return c.json({ success: false, error: `Invalid request: ${err.issues[0].message}` }, 400)
    }
    if (err instanceof Error) {
      return c.json({ success: false, error: err.message }, 500)
    }
    return c.json({ success: false, error: String(err) }, 500)
  }
}

/**
 * Generate embeddings for multiple texts
 */
export const batchEmbedding = async (c: any) => {
  try {
    const body = await c.req.json()
    const parsed = BatchEmbeddingRequestSchema.parse(body)
    
    // Process in parallel but with a reasonable concurrency limit
    const batchSize = 10
    const embeddings: number[][] = []
    
    for (let i = 0; i < parsed.texts.length; i += batchSize) {
      const batch = parsed.texts.slice(i, i + batchSize)
      const promises = batch.map(text => 
        c.env.AI.run(
          '@cf/baai/bge-base-en-v1.5',
          { text: [text] }
        ) as Promise<EmbeddingResult>
      )
      
      const results = await Promise.all(promises)
      for (const result of results) {
        const embedding = result.data?.[0]
        if (embedding) {
          embeddings.push(embedding)
        }
      }
    }
    
    if (embeddings.length === 0) {
      throw new Error('Failed to generate embeddings')
    }
    
    return c.json({
      success: true,
      data: {
        embeddings,
        count: embeddings.length,
        model: c.env.DEFAULT_EMBEDDING_MODEL,
        dimensions: embeddings[0].length
      }
    })
  } catch (err) {
    console.error('Batch embedding error:', err)
    if (err instanceof z.ZodError) {
      return c.json({ success: false, error: `Invalid request: ${err.issues[0].message}` }, 400)
    }
    if (err instanceof Error) {
      return c.json({ success: false, error: err.message }, 500)
    }
    return c.json({ success: false, error: String(err) }, 500)
  }
}