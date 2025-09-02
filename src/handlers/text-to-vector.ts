/**
 * Handler for text-to-vector conversion using Cloudflare Workflow
 */

import { TextToVectorWorkflow } from '../workflows/text-to-vector'
import { createDbClient, workflows } from '../db'

export const createVectorFromText = async (c: any) => {
  try {
    const body = await c.req.json()
    
    // Validate input
    if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
      return c.json({ 
        success: false, 
        error: 'Text is required and must be a non-empty string' 
      }, 400)
    }

    // Get the workflow binding
    const workflow = c.env.TEXT_TO_VECTOR_WORKFLOW as any
    
    // Create workflow instance with input
    const instance = await workflow.create({
      params: {
        text: body.text,
        id: body.id,
        metadata: body.metadata
      }
    })

    // Save workflow info to D1
    const db = createDbClient(c.env.DB)
    await db.insert(workflows).values({
      id: instance.id,
      vectorId: body.id || null,
      status: 'started',
      input: {
        text: body.text,
        id: body.id,
        metadata: body.metadata
      },
      output: null,
      error: null
    })

    // Return workflow information
    return c.json({
      success: true,
      data: {
        workflowId: instance.id,
        vectorId: body.id || 'pending',
        status: 'started'
      },
      message: 'Text to vector workflow started successfully'
    })
  } catch (err) {
    console.error('Text to vector workflow error:', err)
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ success: false, error: message }, 500)
  }
}

/**
 * List all workflows from D1 database
 */
export const listWorkflows = async (c: any) => {
  try {
    const db = createDbClient(c.env.DB)
    
    // Get query parameters for filtering and pagination
    const query = c.req.query()
    const limit = parseInt(query.limit || '100')
    const offset = parseInt(query.offset || '0')
    const status = query.status // Optional filter by status
    
    // Build query
    let workflowQuery = db.select().from(workflows)
    
    // Add status filter if provided
    if (status) {
      const { eq } = await import('drizzle-orm')
      workflowQuery = workflowQuery.where(eq(workflows.status, status))
    }
    
    // Add pagination and ordering
    const { desc } = await import('drizzle-orm')
    const workflowsList = await workflowQuery
      .orderBy(desc(workflows.createdAt))
      .limit(limit)
      .offset(offset)
    
    // Get total count
    const { count } = await import('drizzle-orm')
    const [totalResult] = await db.select({ count: count() }).from(workflows)
    const total = totalResult?.count || 0
    
    // Map workflows to response format
    const mappedWorkflows = workflowsList.map(w => ({
      id: w.id,
      vectorId: w.vectorId,
      status: w.status,
      input: w.input,
      output: w.output,
      error: w.error,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString()
    }))
    
    return c.json({
      success: true,
      data: {
        workflows: mappedWorkflows,
        total,
        limit,
        offset
      }
    })
  } catch (err) {
    console.error('List workflows error:', err)
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ success: false, error: message }, 500)
  }
}

/**
 * Get workflow status
 */
export const getWorkflowStatus = async (c: any) => {
  try {
    const workflowId = c.req.param('workflowId')
    const workflow = c.env.TEXT_TO_VECTOR_WORKFLOW as any
    
    const instance = await workflow.get(workflowId)
    const status = await instance.status()
    
    // Update status in D1
    const db = createDbClient(c.env.DB)
    const { eq } = await import('drizzle-orm')
    await db.update(workflows)
      .set({
        status: status.status,
        output: status.output,
        error: status.error || null,
        updatedAt: new Date()
      })
      .where(eq(workflows.id, workflowId))
    
    return c.json({
      success: true,
      data: {
        workflowId,
        status: status.status,
        output: status.output
      }
    })
  } catch (err) {
    console.error('Get workflow status error:', err)
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ success: false, error: message }, 500)
  }
}