import { vi } from 'vitest'
import { OpenAPIHono } from '@hono/zod-openapi'
import { createMockEnv } from './mock-env'
import { 
  createMockVectorManager, 
  createMockNotionManager,
  createMockVectorizeIndex,
  createMockDurableObjectNamespace 
} from './mock-durable-objects'
import { createMockWorkflow, createMockWorkflowStep } from './mock-workflows'

/**
 * Common test scenario setup for vector routes
 */
export function setupVectorRouteTest() {
  const mockVectorManager = createMockVectorManager()
  const mockVectorizeIndex = createMockVectorizeIndex()
  const mockVectorCacheNamespace = createMockDurableObjectNamespace(mockVectorManager)
  
  const mockEnv = createMockEnv({
    VECTOR_CACHE: mockVectorCacheNamespace as any,
    VECTORIZE_INDEX: mockVectorizeIndex as any
  })
  
  const app = new OpenAPIHono<{ Bindings: Env }>()
  
  return {
    app,
    mockEnv,
    mockVectorManager,
    mockVectorizeIndex,
    mockVectorCacheNamespace
  }
}

/**
 * Common test scenario setup for Notion routes
 */
export function setupNotionRouteTest() {
  const mockNotionManager = createMockNotionManager()
  const mockNotionManagerNamespace = createMockDurableObjectNamespace(mockNotionManager, 'notion')
  
  const mockEnv = createMockEnv({
    NOTION_MANAGER: mockNotionManagerNamespace as any,
    NOTION_API_KEY: 'test-notion-api-key'
  })
  
  const app = new OpenAPIHono<{ Bindings: Env }>()
  
  return {
    app,
    mockEnv,
    mockNotionManager,
    mockNotionManagerNamespace
  }
}

/**
 * Common test scenario setup for search routes
 */
export function setupSearchRouteTest() {
  const mockVectorManager = createMockVectorManager()
  const mockVectorizeIndex = createMockVectorizeIndex()
  const mockVectorCacheNamespace = createMockDurableObjectNamespace(mockVectorManager)
  
  const mockEnv = createMockEnv({
    VECTOR_CACHE: mockVectorCacheNamespace as any,
    VECTORIZE_INDEX: mockVectorizeIndex as any
  })
  
  const app = new OpenAPIHono<{ Bindings: Env }>()
  
  return {
    app,
    mockEnv,
    mockVectorManager,
    mockVectorizeIndex,
    mockVectorCacheNamespace
  }
}

/**
 * Common test scenario setup for file processing routes
 */
export function setupFileProcessingRouteTest() {
  const mockVectorManager = createMockVectorManager()
  const mockVectorCacheNamespace = createMockDurableObjectNamespace(mockVectorManager)
  
  const mockFileProcessingWorkflow = {
    create: vi.fn(),
    get: vi.fn()
  }
  
  const mockEnv = createMockEnv({
    VECTOR_CACHE: mockVectorCacheNamespace as any,
    FILE_PROCESSING_WORKFLOW: mockFileProcessingWorkflow as any
  })
  
  const app = new OpenAPIHono<{ Bindings: Env }>()
  
  return {
    app,
    mockEnv,
    mockVectorManager,
    mockVectorCacheNamespace,
    mockFileProcessingWorkflow
  }
}

/**
 * Common test scenario setup for embeddings routes
 */
export function setupEmbeddingsRouteTest() {
  const mockEmbeddingsWorkflow = {
    create: vi.fn(),
    get: vi.fn()
  }
  
  const mockBatchEmbeddingsWorkflow = {
    create: vi.fn(),
    get: vi.fn()
  }
  
  const mockEnv = createMockEnv({
    EMBEDDINGS_WORKFLOW: mockEmbeddingsWorkflow as any,
    BATCH_EMBEDDINGS_WORKFLOW: mockBatchEmbeddingsWorkflow as any
  })
  
  const app = new OpenAPIHono<{ Bindings: Env }>()
  
  return {
    app,
    mockEnv,
    mockEmbeddingsWorkflow,
    mockBatchEmbeddingsWorkflow
  }
}

/**
 * Setup for Durable Object tests
 */
export function setupDurableObjectTest() {
  const mockVectorizeIndex = createMockVectorizeIndex()
  const mockWorkflow = createMockWorkflow()
  const mockWorkflowStep = createMockWorkflowStep()
  
  // Mock Date.now for consistent test results
  let mockDateNow = 1000000000000
  vi.spyOn(Date, 'now').mockImplementation(() => mockDateNow++)
  
  const mockEnv = createMockEnv({
    VECTORIZE_INDEX: mockVectorizeIndex as any,
    EMBEDDINGS_WORKFLOW: mockWorkflow as any,
    BATCH_EMBEDDINGS_WORKFLOW: mockWorkflow as any,
    VECTOR_OPERATIONS_WORKFLOW: mockWorkflow as any,
    FILE_PROCESSING_WORKFLOW: mockWorkflow as any,
    NOTION_SYNC_WORKFLOW: mockWorkflow as any
  })
  
  const mockCtx = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn()
  }
  
  // Create a mock Agent state
  const mockAgentState = {
    searchHistory: [],
    vectorJobs: {},
    fileProcessingJobs: {},
    recentVectors: [],
    syncJobs: {},
    stats: {
      totalPages: 0,
      totalSyncJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      totalVectorsCreated: 0
    },
    settings: {
      autoSyncEnabled: false,
      defaultNamespace: 'notion',
      maxConcurrentJobs: 5,
      includeBlocksByDefault: true,
      includePropertiesByDefault: true
    }
  }
  
  return {
    mockEnv,
    mockCtx,
    mockVectorizeIndex,
    mockWorkflow,
    mockWorkflowStep,
    mockAgentState,
    mockDateNow
  }
}

/**
 * Setup for Workflow tests
 */
export function setupWorkflowTest() {
  const mockStep = createMockWorkflowStep()
  const mockAI = {
    run: vi.fn()
  }
  
  const mockEnv = createMockEnv({
    AI: mockAI as any
  })
  
  const mockCtx = {}
  
  return {
    mockEnv,
    mockCtx,
    mockStep,
    mockAI
  }
}