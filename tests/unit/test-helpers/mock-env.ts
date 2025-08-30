import type { Workflow } from 'cloudflare:workers'

/**
 * Create a mock environment object for testing
 * @param overrides - Optional overrides for specific environment values
 */
export function createMockEnv(overrides?: Partial<Env>): Env {
  return {
    ENVIRONMENT: 'development' as const,
    DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
    DEFAULT_TEXT_GENERATION_MODEL: '@cf/google/gemma-3-12b-it',
    IMAGE_ANALYSIS_PROMPT: 'Describe this image in detail. Include any text visible in the image.',
    IMAGE_ANALYSIS_MAX_TOKENS: '512',
    TEXT_EXTRACTION_MAX_TOKENS: '1024',
    NOTION_API_KEY: 'test-notion-api-key',
    AI: {} as any,
    VECTORIZE_INDEX: {} as any,
    VECTOR_CACHE: {} as any,
    NOTION_MANAGER: {} as any,
    AI_EMBEDDINGS: {} as any,
    DB: {} as any,
    EMBEDDINGS_WORKFLOW: {} as Workflow,
    BATCH_EMBEDDINGS_WORKFLOW: {} as any,
    VECTOR_OPERATIONS_WORKFLOW: {} as any,
    FILE_PROCESSING_WORKFLOW: {} as any,
    NOTION_SYNC_WORKFLOW: {} as any,
    ...overrides
  }
}