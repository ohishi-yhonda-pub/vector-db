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

    // Step 1: Generate embedding from text using shared utility
    const embedding = await step.do('generate-embedding', async () => {
      return await generateEmbeddingFromText(this.env.AI, text)
    })

    // Step 2: Generate vector ID if not provided using shared utility
    const vectorId = await step.do('generate-id', async () => {
      return id || generateVectorId()
    })

    // Step 3: Store vector in Vectorize using shared utility
    await step.do('store-in-vectorize', async () => {
      await storeInVectorize(this.env.VECTORIZE_INDEX, vectorId, embedding, metadata)
    })

    // Step 4: Store metadata in D1 using shared utility
    await step.do('store-in-d1', async () => {
      await storeVectorMetadata(this.env.DB, vectorId, embedding.length, metadata)
    })

    // Return success result
    return {
      success: true,
      vectorId,
      embedding
    }
  }
}

export default TextToVectorWorkflow