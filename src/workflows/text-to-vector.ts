/**
 * Cloudflare Workflow: Text to Vector Pipeline
 * 
 * This workflow converts text to embeddings and stores them as vectors
 * using shared utility functions for consistency and testability
 */

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers'
import {
  generateVectorId,
  generateEmbeddingFromText,
  storeInVectorize,
  storeVectorMetadata
} from '../lib/vector-utils'

// Input type for the workflow
export interface TextToVectorInput {
  text: string
  id?: string
  metadata?: Record<string, any>
}

// Result type
export interface TextToVectorResult {
  success: boolean
  vectorId?: string
  error?: string
  embedding?: number[]
}

export class TextToVectorWorkflow extends WorkflowEntrypoint<Env, TextToVectorInput> {
  async run(event: WorkflowEvent<TextToVectorInput>, step: WorkflowStep) {
    const { text, id, metadata } = event.payload
    let vectorId: string

    try {
      // Step 1: Generate embedding from text using shared utility
      const embedding = await step.do('generate-embedding', async () => {
        return await generateEmbeddingFromText(this.env.AI, text)
      })

      // Step 2: Generate vector ID if not provided using shared utility
      vectorId = await step.do('generate-id', async () => {
        return id || generateVectorId()
      })

      // Step 3: Store vector in Vectorize using shared utility (with text in metadata)
      // This step may fail if metadata is too large
      try {
        await step.do('store-in-vectorize', async () => {
          await storeInVectorize(this.env.VECTORIZE_INDEX, vectorId, embedding, metadata, text)
        })
      } catch (vectorizeError: any) {
        // Vectorize failed (likely due to metadata size), but still save to D1 with error status
        await step.do('store-error-in-d1', async () => {
          const { createDbClient, workflows } = await import('../db')
          const db = createDbClient(this.env.DB)
          
          await db.insert(workflows).values({
            id: `wf_${vectorId}_${Date.now()}`,
            vectorId,
            status: 'failed',
            input: { text, metadata },
            error: vectorizeError.message || 'Failed to store in Vectorize',
            output: { embedding, failureReason: 'vectorize_error' }
          })
        })
        
        // Return failure result with details
        return {
          success: false,
          vectorId,
          error: `Vectorize storage failed: ${vectorizeError.message}`,
          embedding
        }
      }

      // Step 4: Store metadata in D1 using shared utility (with text in metadata)
      await step.do('store-in-d1', async () => {
        const enrichedMetadata = { ...metadata, text }
        await storeVectorMetadata(this.env.DB, vectorId, embedding.length, enrichedMetadata)
      })

      // Return success result
      return {
        success: true,
        vectorId,
        embedding
      }
    } catch (error: any) {
      // General error handling - save to workflows table
      await step.do('store-general-error', async () => {
        const { createDbClient, workflows } = await import('../db')
        const db = createDbClient(this.env.DB)
        
        await db.insert(workflows).values({
          id: `wf_error_${Date.now()}`,
          vectorId: vectorId || 'unknown',
          status: 'failed',
          input: { text, metadata },
          error: error.message || 'Unknown error',
          output: { failureReason: 'general_error' }
        })
      })
      
      return {
        success: false,
        error: error.message || 'Unknown error'
      }
    }
  }
}

export default TextToVectorWorkflow