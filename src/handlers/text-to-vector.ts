/**
 * Handler for text-to-vector conversion using Cloudflare Workflow
 */

import { TextToVectorWorkflow } from '../workflows/text-to-vector'

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
 * Get workflow status
 */
export const getWorkflowStatus = async (c: any) => {
  try {
    const workflowId = c.req.param('workflowId')
    const workflow = c.env.TEXT_TO_VECTOR_WORKFLOW as any
    
    const instance = await workflow.get(workflowId)
    const status = await instance.status()
    
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