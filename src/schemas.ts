/**
 * OpenAPI schemas for Vector DB API
 */

import { z } from '@hono/zod-openapi'

// ============= Request Schemas =============

export const EmbeddingRequestSchema = z.object({
  text: z.string().min(1).openapi({
    description: 'Text to generate embedding for',
    example: 'Hello world'
  }),
  model: z.string().optional().openapi({
    description: 'Embedding model to use (optional)',
    example: '@cf/baai/bge-base-en-v1.5'
  })
}).openapi({
  title: 'EmbeddingRequest',
  description: 'Request to generate a single embedding'
})

export const BatchEmbeddingRequestSchema = z.object({
  texts: z.array(z.string().min(1)).min(1).max(100).openapi({
    description: 'Array of texts to generate embeddings for (1-100 items)',
    example: ['Hello world', 'How are you?']
  }),
  model: z.string().optional().openapi({
    description: 'Embedding model to use (optional)',
    example: '@cf/baai/bge-base-en-v1.5'
  })
}).openapi({
  title: 'BatchEmbeddingRequest',
  description: 'Request to generate multiple embeddings'
})

export const CreateVectorSchema = z.object({
  id: z.string().optional().openapi({
    description: 'Custom ID for the vector (optional, will be generated if not provided)',
    example: 'doc-123'
  }),
  values: z.array(z.number()).openapi({
    description: 'Vector values (embedding)',
    example: [0.1, 0.2, 0.3, -0.1, 0.5]
  }),
  metadata: z.record(z.string(), z.any()).optional().openapi({
    description: 'Optional metadata for the vector',
    example: { category: 'document', source: 'api' }
  })
}).openapi({
  title: 'CreateVector',
  description: 'Request to create a new vector'
})

export const SearchSchema = z.object({
  vector: z.array(z.number()).optional().openapi({
    description: 'Query vector for similarity search',
    example: [0.1, 0.2, 0.3]
  }),
  text: z.string().optional().openapi({
    description: 'Text to convert to vector for search',
    example: 'search query text'
  }),
  topK: z.number().int().min(1).max(100).default(10).openapi({
    description: 'Number of similar vectors to return',
    example: 10
  }),
  filter: z.record(z.string(), z.any()).optional().openapi({
    description: 'Metadata filter for search results',
    example: { category: 'document' }
  })
}).openapi({
  title: 'SearchRequest',
  description: 'Vector similarity search request'
})

// ============= Response Schemas =============

export const SuccessResponseSchema = z.object({
  success: z.boolean().openapi({ example: true }),
  data: z.any().openapi({ description: 'Response data' }),
  message: z.string().optional().openapi({ 
    description: 'Success message',
    example: 'Operation completed successfully'
  })
}).openapi({
  title: 'SuccessResponse',
  description: 'Successful API response'
})

export const ErrorResponseSchema = z.object({
  success: z.boolean().openapi({ example: false }),
  error: z.string().openapi({ 
    description: 'Error message',
    example: 'Invalid request data'
  })
}).openapi({
  title: 'ErrorResponse', 
  description: 'Error API response'
})

export const HealthResponseSchema = z.object({
  status: z.string().openapi({ example: 'ok' }),
  service: z.string().openapi({ example: 'Vector DB' }),
  version: z.string().openapi({ example: '2.0.0' }),
  endpoints: z.array(z.string()).openapi({
    description: 'Available API endpoints',
    example: ['POST /api/embeddings', 'POST /api/vectors']
  })
}).openapi({
  title: 'HealthResponse',
  description: 'Health check response'
})

export const EmbeddingResponseSchema = z.object({
  success: z.boolean().openapi({ example: true }),
  data: z.object({
    embedding: z.array(z.number()).openapi({
      description: 'Generated embedding vector',
      example: [0.1, 0.2, 0.3, -0.1, 0.5]
    }),
    model: z.string().openapi({
      description: 'Model used for embedding',
      example: '@cf/baai/bge-base-en-v1.5'
    }),
    dimensions: z.number().openapi({
      description: 'Number of dimensions in the embedding',
      example: 768
    })
  })
}).openapi({
  title: 'EmbeddingResponse',
  description: 'Single embedding generation response'
})

export const BatchEmbeddingResponseSchema = z.object({
  success: z.boolean().openapi({ example: true }),
  data: z.object({
    embeddings: z.array(z.array(z.number())).openapi({
      description: 'Array of generated embedding vectors',
      example: [[0.1, 0.2], [0.3, 0.4]]
    }),
    count: z.number().openapi({
      description: 'Number of embeddings generated',
      example: 2
    }),
    model: z.string().openapi({
      description: 'Model used for embeddings',
      example: '@cf/baai/bge-base-en-v1.5'
    }),
    dimensions: z.number().openapi({
      description: 'Number of dimensions per embedding',
      example: 768
    })
  })
}).openapi({
  title: 'BatchEmbeddingResponse',
  description: 'Batch embedding generation response'
})

export const VectorResponseSchema = z.object({
  success: z.boolean().openapi({ example: true }),
  data: z.object({
    id: z.string().openapi({ 
      description: 'Vector ID',
      example: 'vec_1234567890_abc123def' 
    })
  }),
  message: z.string().openapi({ 
    description: 'Success message',
    example: 'Vector created successfully' 
  })
}).openapi({
  title: 'VectorResponse',
  description: 'Vector creation response'
})

export const SearchResponseSchema = z.object({
  success: z.boolean().openapi({ example: true }),
  data: z.object({
    matches: z.array(z.object({
      id: z.string().openapi({ example: 'vec_123' }),
      score: z.number().openapi({ example: 0.95 }),
      metadata: z.record(z.string(), z.any()).openapi({ example: {} })
    })).openapi({
      description: 'Search result matches'
    }),
    count: z.number().openapi({
      description: 'Number of matches found',
      example: 5
    })
  })
}).openapi({
  title: 'SearchResponse',
  description: 'Vector search response'
})

export const DeleteAllVectorsRequestSchema = z.object({
  vectorIds: z.array(z.string()).min(1).openapi({
    description: 'Array of vector IDs to delete',
    example: ['vec_123', 'vec_456', 'vec_789']
  })
}).openapi({
  title: 'DeleteAllVectorsRequest',
  description: 'Request to delete multiple vectors by their IDs'
})

export const ListVectorsRequestSchema = z.object({
  limit: z.string().optional().refine((val) => {
    if (!val) return true;
    const parsed = parseInt(val, 10);
    return !isNaN(parsed) && parsed >= 1 && parsed <= 1000;
  }, {
    message: 'Limit must be between 1 and 1000'
  }).transform((val) => {
    if (!val) return 100;
    return parseInt(val, 10);
  }).openapi({
    description: 'Number of vectors to return (1-1000)',
    example: '100'
  }),
  offset: z.string().optional().refine((val) => {
    if (!val) return true;
    const parsed = parseInt(val, 10);
    return !isNaN(parsed) && parsed >= 0;
  }, {
    message: 'Offset must be >= 0'
  }).transform((val) => {
    if (!val) return 0;
    return parseInt(val, 10);
  }).openapi({
    description: 'Number of vectors to skip',
    example: '0'
  })
}).openapi({
  title: 'ListVectorsRequest',
  description: 'Request to list vectors with pagination'
})

export const ListVectorsResponseSchema = z.object({
  success: z.boolean().openapi({ example: true }),
  data: z.object({
    vectors: z.array(z.object({
      id: z.string().openapi({ example: 'vec_123' }),
      dimensions: z.number().openapi({ example: 768 }),
      metadata: z.any().optional().openapi({ example: { source: 'document' } }),
      createdAt: z.string().openapi({ example: '2023-01-01T00:00:00.000Z' }),
      updatedAt: z.string().openapi({ example: '2023-01-01T00:00:00.000Z' })
    })).openapi({
      description: 'Array of vector metadata'
    }),
    total: z.number().openapi({
      description: 'Total number of vectors',
      example: 1000
    }),
    limit: z.number().openapi({
      description: 'Limit used for this request',
      example: 100
    }),
    offset: z.number().openapi({
      description: 'Offset used for this request',
      example: 0
    })
  })
}).openapi({
  title: 'ListVectorsResponse',
  description: 'List of vector metadata with pagination info'
})

export const DeleteAllVectorsResponseSchema = z.object({
  success: z.boolean().openapi({ example: true }),
  data: z.object({
    deletedCount: z.number().openapi({
      description: 'Total number of vectors deleted',
      example: 156
    }),
    batchCount: z.number().openapi({
      description: 'Number of deletion batches processed',
      example: 3
    })
  }),
  message: z.string().openapi({
    description: 'Success message',
    example: 'All vectors deleted successfully'
  })
}).openapi({
  title: 'DeleteAllVectorsResponse',
  description: 'Delete all vectors operation response'
})