const fs = require('fs');
const path = require('path');

// 完全なEnv定義
const fullEnvMock = `      ENVIRONMENT: 'development' as const,
      DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
      DEFAULT_TEXT_GENERATION_MODEL: '@cf/google/gemma-3-12b-it',
      IMAGE_ANALYSIS_PROMPT: 'Describe this image',
      IMAGE_ANALYSIS_MAX_TOKENS: '512',
      TEXT_EXTRACTION_MAX_TOKENS: '1024',
      NOTION_API_KEY: 'test-key',
      AI: {} as any,
      VECTORIZE_INDEX: {} as any,
      VECTOR_CACHE: {
        idFromName: vi.fn().mockReturnValue('mock-vector-id'),
        get: vi.fn().mockReturnValue({})
      } as any,
      NOTION_MANAGER: {} as any,
      AI_EMBEDDINGS: mockAIEmbeddingsNamespace as any,
      DB: {} as any,
      BATCH_EMBEDDINGS_WORKFLOW: {} as any,
      VECTOR_OPERATIONS_WORKFLOW: {} as any,
      FILE_PROCESSING_WORKFLOW: {} as any,
      NOTION_SYNC_WORKFLOW: {} as any`;

// VECTOR_MANAGERを含むファイルのパス
const filesToFix = [
  'tests/unit/routes/embeddings/schedule.test.ts',
  'tests/unit/routes/notion/bulk-sync.test.ts',
  'tests/unit/routes/notion/list-pages.test.ts',
  'tests/unit/routes/notion/retrieve-blocks.test.ts',
  'tests/unit/routes/notion/retrieve-page.test.ts',
  'tests/unit/routes/notion/sync-page.test.ts',
  'tests/unit/routes/search/semantic.test.ts',
  'tests/unit/routes/search/similar.test.ts',
  'tests/unit/routes/search/vectors.test.ts',
  'tests/unit/routes/vectors/create.test.ts',
  'tests/unit/routes/vectors/delete.test.ts',
  'tests/unit/routes/vectors/get.test.ts',
  'tests/unit/routes/vectors/list.test.ts'
];

filesToFix.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // VECTOR_MANAGERを削除し、完全なEnv定義を追加
    content = content.replace(/VECTOR_MANAGER: \{\} as any,\s*/g, '');
    content = content.replace(/VECTOR_CACHE: \{\} as any,/, fullEnvMock);
    
    // 型アサーションを追加
    content = content.replace(/const result = await response\.json\(\)/g, 'const result = await response.json() as any');
    
    fs.writeFileSync(filePath, content);
    console.log(`Fixed: ${filePath}`);
  }
});

console.log('Type fixes completed!');