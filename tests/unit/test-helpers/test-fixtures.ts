/**
 * Common test fixtures and data for reuse across tests
 */

export const TestVectors = {
  simple: {
    id: 'test-vector-1',
    namespace: 'test-namespace',
    content: 'Test content for vector',
    metadata: { key: 'value' },
    values: [0.1, 0.2, 0.3]
  },
  withEmbedding: {
    id: 'vec_123',
    namespace: 'default',
    content: 'Sample text content',
    metadata: {
      source: 'test',
      category: 'sample'
    },
    values: new Array(768).fill(0.1)
  },
  batch: [
    {
      id: 'batch-1',
      namespace: 'batch-namespace',
      content: 'First batch vector',
      metadata: { index: 0 }
    },
    {
      id: 'batch-2',
      namespace: 'batch-namespace',
      content: 'Second batch vector',
      metadata: { index: 1 }
    }
  ]
}

export const TestNotionPages = {
  simple: {
    id: 'page-123',
    object: 'page',
    created_time: '2024-01-01T00:00:00.000Z',
    last_edited_time: '2024-01-02T00:00:00.000Z',
    properties: {
      title: {
        title: [{ plain_text: 'Test Page' }]
      }
    }
  },
  withBlocks: {
    id: 'page-with-blocks',
    object: 'page',
    created_time: '2024-01-01T00:00:00.000Z',
    last_edited_time: '2024-01-02T00:00:00.000Z',
    properties: {
      title: {
        title: [{ plain_text: 'Page with Blocks' }]
      }
    },
    blocks: [
      {
        id: 'block-1',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ plain_text: 'Paragraph content' }]
        }
      }
    ]
  }
}

export const TestFiles = {
  pdf: {
    name: 'test.pdf',
    type: 'application/pdf',
    content: Buffer.from('PDF content'),
    size: 1024
  },
  image: {
    name: 'test.png',
    type: 'image/png',
    content: Buffer.from('PNG content'),
    size: 2048
  },
  text: {
    name: 'test.txt',
    type: 'text/plain',
    content: Buffer.from('Plain text content'),
    size: 512
  }
}

export const TestEmbeddings = {
  simple: [0.1, 0.2, 0.3, 0.4, 0.5],
  bge: new Array(768).fill(0.1),
  gte: new Array(1024).fill(0.05)
}

export const TestSearchResults = {
  simple: {
    id: 'result-1',
    score: 0.95,
    namespace: 'test',
    content: 'Matching content',
    metadata: {}
  },
  withMetadata: {
    id: 'result-2',
    score: 0.87,
    namespace: 'test',
    content: 'Another match',
    metadata: {
      source: 'notion',
      pageId: 'page-123'
    }
  }
}