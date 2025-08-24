import { vi, afterEach } from 'vitest'

// Mock environment variables
vi.stubEnv('ENVIRONMENT', 'test')
vi.stubEnv('DEFAULT_EMBEDDING_MODEL', '@cf/baai/bge-base-en-v1.5')
vi.stubEnv('DEFAULT_TEXT_GENERATION_MODEL', '@cf/google/gemma-3-12b-it')
vi.stubEnv('NOTION_API_KEY', 'test-notion-api-key')

// Windows環境でのリソースクリーンアップ
afterEach(async () => {
  // 少し待機してリソースが解放されるのを待つ
  await new Promise(resolve => setTimeout(resolve, 100))
})