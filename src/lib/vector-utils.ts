/**
 * Common utilities for vector operations
 * Shared between direct API calls and Workflows
 */

import { createDbClient, vectors } from '../db'

/**
 * Generate a unique vector ID
 */
export function generateVectorId(): string {
  return `vec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Generate embedding from text using Workers AI
 */
export async function generateEmbeddingFromText(
  ai: any,
  text: string,
  model: string = '@cf/baai/bge-base-en-v1.5'
): Promise<number[]> {
  const result = await ai.run(model, { text: [text] }) as { data?: number[][] }
  
  const embedding = result.data?.[0]
  if (!embedding) {
    throw new Error('Failed to generate embedding')
  }
  
  return embedding
}

/**
 * Store vector in Vectorize index
 */
export async function storeInVectorize(
  vectorizeIndex: any,
  id: string,
  values: number[],
  metadata?: Record<string, any>,
  text?: string
): Promise<void> {
  // Include text in metadata if provided
  const enrichedMetadata = text 
    ? { ...metadata, text }
    : metadata || {}
    
  // Let Vectorize handle size validation - it will throw if metadata is too large
  await vectorizeIndex.insert([{
    id,
    values,
    metadata: enrichedMetadata
  }])
}

/**
 * Store vector metadata in D1 database
 */
export async function storeVectorMetadata(
  db: D1Database,
  id: string,
  dimensions: number,
  metadata?: Record<string, any>
): Promise<void> {
  const dbClient = createDbClient(db)
  await dbClient.insert(vectors).values({
    id,
    dimensions,
    metadata
  }).onConflictDoUpdate({
    target: vectors.id,
    set: {
      dimensions,
      metadata,
      updatedAt: new Date()
    }
  })
}

/**
 * Complete flow: text to vector with storage
 * Used by both API endpoints and Workflows
 */
export async function createVectorFromTextComplete(
  env: Env,
  text: string,
  customId?: string,
  metadata?: Record<string, any>
): Promise<{ id: string; embedding: number[]; error?: string }> {
  // Generate embedding
  const embedding = await generateEmbeddingFromText(env.AI, text)
  
  // Generate or use provided ID
  const id = customId || generateVectorId()
  
  try {
    // Store in Vectorize with text included in metadata
    await storeInVectorize(env.VECTORIZE_INDEX, id, embedding, metadata, text)
    
    // Store metadata in D1 (text is already in metadata)
    const enrichedMetadata = { ...metadata, text }
    await storeVectorMetadata(env.DB, id, embedding.length, enrichedMetadata)
    
    return { id, embedding }
  } catch (error: any) {
    // If Vectorize fails, still store in D1 with full text but mark as failed
    const { createDbClient, workflows } = await import('../db')
    const db = createDbClient(env.DB)
    
    // Store failure in workflows table
    await db.insert(workflows).values({
      id: `wf_failed_${id}_${Date.now()}`,
      vectorId: id,
      status: 'failed',
      input: { text, metadata },
      error: error.message || 'Failed to store in Vectorize',
      output: { embedding, stored_in_d1: true }
    })
    
    // Still store in D1 vectors table for reference
    const enrichedMetadata = { ...metadata, text, vectorize_failed: true }
    await storeVectorMetadata(env.DB, id, embedding.length, enrichedMetadata)
    
    return { id, embedding, error: error.message || 'Failed to store in Vectorize' }
  }
}