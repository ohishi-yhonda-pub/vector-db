/**
 * OpenAPI route definitions for Vector DB API
 */

import { createRoute, z } from '@hono/zod-openapi'
import {
  EmbeddingRequestSchema,
  BatchEmbeddingRequestSchema, 
  CreateVectorSchema,
  SearchSchema,
  ListVectorsRequestSchema,
  HealthResponseSchema,
  EmbeddingResponseSchema,
  BatchEmbeddingResponseSchema,
  VectorResponseSchema,
  SearchResponseSchema,
  ListVectorsResponseSchema,
  DeleteAllVectorsRequestSchema,
  DeleteAllVectorsResponseSchema,
  ErrorResponseSchema,
  SuccessResponseSchema
} from './schemas'

// ============= Health Check Route =============

export const healthRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Health'],
  summary: 'Health check',
  description: 'Check API status and get available endpoints',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: HealthResponseSchema
        }
      },
      description: 'API is healthy'
    }
  }
})

// ============= Embedding Routes =============

export const embeddingRoute = createRoute({
  method: 'post',
  path: '/api/embeddings',
  tags: ['Embeddings'],
  summary: 'Generate single embedding',
  description: 'Generate an embedding vector for a single text input',
  request: {
    body: {
      content: {
        'application/json': {
          schema: EmbeddingRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: EmbeddingResponseSchema
        }
      },
      description: 'Embedding generated successfully'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Invalid request data'
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Unauthorized - API key required in production'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Internal server error'
    }
  }
})

export const batchEmbeddingRoute = createRoute({
  method: 'post',
  path: '/api/embeddings/batch',
  tags: ['Embeddings'],
  summary: 'Generate batch embeddings',
  description: 'Generate embedding vectors for multiple text inputs (1-100 texts)',
  request: {
    body: {
      content: {
        'application/json': {
          schema: BatchEmbeddingRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: BatchEmbeddingResponseSchema
        }
      },
      description: 'Embeddings generated successfully'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Invalid request data'
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Unauthorized'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Internal server error'
    }
  }
})

// ============= Vector Routes =============

export const createVectorRoute = createRoute({
  method: 'post',
  path: '/api/vectors',
  tags: ['Vectors'],
  summary: 'Create vector',
  description: 'Store a new vector with optional metadata',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateVectorSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: VectorResponseSchema
        }
      },
      description: 'Vector created successfully'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Invalid request data'
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Unauthorized'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Internal server error'
    }
  }
})

export const getVectorRoute = createRoute({
  method: 'get',
  path: '/api/vectors/{id}',
  tags: ['Vectors'],
  summary: 'Get vector by ID',
  description: 'Retrieve a vector by its ID',
  request: {
    params: z.object({
      id: z.string().openapi({
        description: 'Vector ID',
        example: 'vec_1234567890_abc123def'
      })
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SuccessResponseSchema
        }
      },
      description: 'Vector retrieved successfully'
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Vector not found'
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Unauthorized'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Internal server error'
    }
  }
})

export const deleteVectorRoute = createRoute({
  method: 'delete',
  path: '/api/vectors/{id}',
  tags: ['Vectors'], 
  summary: 'Delete vector by ID',
  description: 'Remove a vector by its ID',
  request: {
    params: z.object({
      id: z.string().openapi({
        description: 'Vector ID to delete',
        example: 'vec_1234567890_abc123def'
      })
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SuccessResponseSchema
        }
      },
      description: 'Vector deleted successfully'
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Vector not found'
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Unauthorized'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Internal server error'
    }
  }
})

export const batchCreateVectorRoute = createRoute({
  method: 'post',
  path: '/api/vectors/batch',
  tags: ['Vectors'],
  summary: 'Batch create vectors',
  description: 'Create multiple vectors in a single request',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.array(CreateVectorSchema).openapi({
            title: 'BatchCreateVectors',
            description: 'Array of vectors to create'
          })
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SuccessResponseSchema
        }
      },
      description: 'Vectors created successfully'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Invalid request data'
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Unauthorized'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Internal server error'
    }
  }
})

// ============= Search Route =============

export const searchRoute = createRoute({
  method: 'post',
  path: '/api/search',
  tags: ['Search'],
  summary: 'Vector similarity search',
  description: 'Find similar vectors by providing either a vector or text query',
  request: {
    body: {
      content: {
        'application/json': {
          schema: SearchSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SearchResponseSchema
        }
      },
      description: 'Search completed successfully'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Invalid request data - vector or text required'
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Unauthorized'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Internal server error'
    }
  }
})

// ============= List Vectors Route =============

export const listVectorsRoute = createRoute({
  method: 'get',
  path: '/api/vectors',
  tags: ['Vectors'],
  summary: 'List vectors',
  description: 'Get a paginated list of vector metadata from D1 database',
  request: {
    query: ListVectorsRequestSchema
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ListVectorsResponseSchema
        }
      },
      description: 'List of vector metadata'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Invalid request parameters'
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Unauthorized'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Internal server error'
    }
  }
})

// ============= Delete All Vectors Route =============

export const deleteAllVectorsRoute = createRoute({
  method: 'delete',
  path: '/api/vectors/all',
  tags: ['Vectors'],
  summary: 'Delete multiple vectors',
  description: 'Delete multiple vectors by providing a list of vector IDs',
  request: {
    body: {
      content: {
        'application/json': {
          schema: DeleteAllVectorsRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: DeleteAllVectorsResponseSchema
        }
      },
      description: 'All vectors deleted successfully'
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Unauthorized'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema
        }
      },
      description: 'Internal server error'
    }
  }
})