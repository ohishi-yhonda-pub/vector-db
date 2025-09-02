/**
 * Vector operations (CRUD and search)
 */

import { z } from '@hono/zod-openapi'
import { CreateVectorSchema, SearchSchema, DeleteAllVectorsRequestSchema, ListVectorsRequestSchema } from './schemas'
import { createDbClient, vectors } from './db'
import { eq, inArray, count, desc } from 'drizzle-orm'

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `vec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create a new vector
 */
export const createVector = async (c: any) => {
  try {
    const body = await c.req.json()
    const parsed = CreateVectorSchema.parse(body)
    const id = parsed.id || generateId()
    
    // Insert vector into Vectorize
    await c.env.VECTORIZE_INDEX.insert([{
      id,
      values: parsed.values,
      metadata: parsed.metadata || {}
    }])
    
    // Save metadata to D1 database
    const db = createDbClient(c.env.DB)
    await db.insert(vectors).values({
      id,
      dimensions: parsed.values.length,
      metadata: parsed.metadata
    }).onConflictDoUpdate({
      target: vectors.id,
      set: {
        dimensions: parsed.values.length,
        metadata: parsed.metadata,
        updatedAt: new Date()
      }
    })
    
    return c.json({
      success: true,
      data: { id },
      message: 'Vector created successfully'
    })
  } catch (err) {
    console.error('Create vector error:', err)
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
 * Get vector by ID
 */
export const getVector = async (c: any, id: string) => {
  try {
    const vectors = await c.env.VECTORIZE_INDEX.getByIds([id])
    
    if (!vectors || vectors.length === 0) {
      return c.json({ success: false, error: 'Vector not found' }, 404)
    }
    
    return c.json({
      success: true,
      data: vectors[0]
    })
  } catch (err) {
    console.error('Get vector error:', err)
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ success: false, error: message }, 500)
  }
}

/**
 * Delete vector by ID
 */
export const deleteVector = async (c: any, id: string) => {
  try {
    const result = await c.env.VECTORIZE_INDEX.deleteByIds([id])
    
    if (result.count === 0) {
      return c.json({ success: false, error: 'Vector not found' }, 404)
    }
    
    // Also delete from D1 database
    const db = createDbClient(c.env.DB)
    await db.delete(vectors).where(eq(vectors.id, id))
    
    return c.json({
      success: true,
      data: { deleted: true },
      message: 'Vector deleted successfully'
    })
  } catch (err) {
    console.error('Delete vector error:', err)
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ success: false, error: message }, 500)
  }
}

/**
 * Search vectors
 */
export const searchVectors = async (c: any) => {
  try {
    const body = await c.req.json()
    const parsed = SearchSchema.parse(body)
    
    let queryVector: number[]
    
    if (parsed.vector) {
      queryVector = parsed.vector
    } else if (parsed.text) {
      // Generate embedding for text search
      const result = await c.env.AI.run(
        '@cf/baai/bge-base-en-v1.5',
        { text: [parsed.text] }
      ) as { data?: number[][] }
      const embedding = result.data?.[0]
      if (!embedding) {
        throw new Error('Failed to generate search embedding')
      }
      queryVector = embedding
    } else {
      return c.json({ success: false, error: 'Either vector or text must be provided' }, 400)
    }
    
    const results = await c.env.VECTORIZE_INDEX.query(queryVector, {
      topK: parsed.topK,
      filter: parsed.filter
    })
    
    return c.json({
      success: true,
      data: {
        matches: results.matches,
        count: results.count
      }
    })
  } catch (err) {
    console.error('Search error:', err)
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
 * Batch create vectors
 */
export const batchCreateVectors = async (c: any) => {
  try {
    const body = await c.req.json() as any[]
    
    if (!Array.isArray(body) || body.length === 0) {
      return c.json({ success: false, error: 'Request body must be a non-empty array' }, 400)
    }
    
    const vectorsData = body.map(item => ({
      id: item.id || generateId(),
      values: item.values,
      metadata: item.metadata || {}
    }))
    
    // Insert vectors into Vectorize
    await c.env.VECTORIZE_INDEX.insert(vectorsData)
    
    // Save metadata to D1 database
    const db = createDbClient(c.env.DB)
    const vectorMetadata = vectorsData.map(vector => ({
      id: vector.id,
      dimensions: vector.values.length,
      metadata: vector.metadata
    }))
    
    // Batch insert into D1 using upsert for duplicates
    for (const metadata of vectorMetadata) {
      await db.insert(vectors).values(metadata).onConflictDoUpdate({
        target: vectors.id,
        set: {
          dimensions: metadata.dimensions,
          metadata: metadata.metadata,
          updatedAt: new Date()
        }
      })
    }
    
    return c.json({
      success: true,
      data: {
        count: vectorsData.length,
        ids: vectorsData.map(v => v.id)
      },
      message: `${vectorsData.length} vectors created successfully`
    })
  } catch (err) {
    console.error('Batch create error:', err)
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ success: false, error: message }, 500)
  }
}


/**
 * List vectors with pagination from D1 database
 */
export const listVectors = async (c: any) => {
  try {
    const query = c.req.query()
    const parsed = ListVectorsRequestSchema.parse(query)
    
    const db = createDbClient(c.env.DB)
    
    // Get total count
    const [totalResult] = await db.select({ count: count() }).from(vectors)
    const total = totalResult?.count || 0
    
    // Get paginated results
    const vectorsList = await db.select()
      .from(vectors)
      .limit(parsed.limit)
      .offset(parsed.offset)
      .orderBy(desc(vectors.createdAt))
    
    return c.json({
      success: true,
      data: {
        vectors: vectorsList.map(v => ({
          id: v.id,
          dimensions: v.dimensions,
          metadata: v.metadata,
          createdAt: v.createdAt.toISOString(),
          updatedAt: v.updatedAt.toISOString()
        })),
        total,
        limit: parsed.limit,
        offset: parsed.offset
      }
    })
  } catch (err) {
    console.error('List vectors error:', err)
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
 * Delete multiple vectors by IDs
 */
export const deleteAllVectors = async (c: any) => {
  try {
    const body = await c.req.json()
    const parsed = DeleteAllVectorsRequestSchema.parse(body)
    
    const deleteResult = await c.env.VECTORIZE_INDEX.deleteByIds(parsed.vectorIds)
    const deletedCount = deleteResult.count || parsed.vectorIds.length
    
    // Also delete from D1 database
    const db = createDbClient(c.env.DB)
    await db.delete(vectors).where(inArray(vectors.id, parsed.vectorIds))
    
    return c.json({
      success: true,
      data: {
        deletedCount,
        batchCount: 1
      },
      message: `${deletedCount} vectors deleted successfully`
    })
  } catch (err) {
    console.error('Delete vectors error:', err)
    if (err instanceof z.ZodError) {
      return c.json({ success: false, error: `Invalid request: ${err.issues[0].message}` }, 400)
    }
    if (err instanceof Error) {
      return c.json({ success: false, error: err.message }, 500)
    }
    return c.json({ success: false, error: String(err) }, 500)
  }
}