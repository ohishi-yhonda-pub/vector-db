# Test Refactoring Guide

## Overview
This guide provides instructions for refactoring test files to use shared test utilities and helpers.

## Available Test Helpers

### 1. Mock Environment (`test-helpers/mock-env.ts`)
```typescript
import { createMockEnv } from '../../test-helpers'

// Instead of:
const mockEnv = {
  ENVIRONMENT: 'development',
  // ... many lines of config
}

// Use:
const mockEnv = createMockEnv({
  // Only override what you need
  VECTOR_CACHE: mockVectorCacheNamespace
})
```

### 2. Mock Durable Objects (`test-helpers/mock-durable-objects.ts`)
```typescript
import { 
  createMockVectorManager,
  createMockNotionManager,
  createMockDurableObjectNamespace 
} from '../../test-helpers'

// Instead of manually creating mocks:
const mockVectorManager = createMockVectorManager()
const mockNamespace = createMockDurableObjectNamespace(mockVectorManager)
```

### 3. Test Scenarios (`test-helpers/test-scenarios.ts`)
Pre-configured test setups for common route types:
```typescript
import { setupVectorRouteTest } from '../../test-helpers'

const testSetup = setupVectorRouteTest()
// Provides: app, mockEnv, mockVectorManager, etc.
```

### 4. Test Fixtures (`test-helpers/test-fixtures.ts`)
Common test data for reuse:
```typescript
import { TestVectors, TestNotionPages, TestFiles } from '../../test-helpers'

// Use pre-defined test data
const vector = TestVectors.simple
const notionPage = TestNotionPages.withBlocks
```

### 5. Request Helpers (`test-helpers/index.ts`)
```typescript
import { createMockRequest } from '../../test-helpers'

// Instead of:
const request = new Request('http://localhost/vectors', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
})

// Use:
const request = createMockRequest('http://localhost/vectors', {
  method: 'POST',
  body: data
})
```

## Refactoring Steps

### Step 1: Import Test Helpers
Add imports at the top of your test file:
```typescript
import { 
  createMockEnv,
  createMockVectorManager,
  createMockDurableObjectNamespace,
  createMockRequest,
  TestVectors
} from '../../test-helpers'
```

### Step 2: Replace Mock Environment
Replace the large mockEnv object with:
```typescript
const mockEnv = createMockEnv({
  // Only add overrides specific to your test
  VECTOR_CACHE: mockVectorCacheNamespace as any
})
```

### Step 3: Use Mock Factories
Replace manual mock creation:
```typescript
// Before:
const mockVectorManager = {
  getVector: vi.fn(),
  createVector: vi.fn(),
  // ...
}

// After:
const mockVectorManager = createMockVectorManager()
```

### Step 4: Use Test Fixtures
Replace hardcoded test data:
```typescript
// Before:
const testVector = {
  id: 'test-1',
  values: [0.1, 0.2, 0.3],
  metadata: { key: 'value' }
}

// After:
const testVector = TestVectors.simple
```

### Step 5: Simplify Request Creation
Use the request helper for cleaner code:
```typescript
// Before:
const request = new Request('http://localhost/api/endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(requestData)
})

// After:
const request = createMockRequest('http://localhost/api/endpoint', {
  method: 'POST',
  body: requestData
})
```

## Example Refactoring

### Before:
```typescript
describe('Vector Route', () => {
  let app: OpenAPIHono<{ Bindings: Env }>
  let mockEnv: Env
  
  beforeEach(() => {
    const mockVectorManager = {
      getVector: vi.fn(),
      createVector: vi.fn()
    }
    
    const mockNamespace = {
      idFromName: vi.fn().mockReturnValue('mock-id'),
      get: vi.fn().mockReturnValue(mockVectorManager)
    }
    
    mockEnv = {
      ENVIRONMENT: 'development',
      // ... 20+ lines of config
      VECTOR_CACHE: mockNamespace
    }
    
    app = new OpenAPIHono()
    app.openapi(route, handler)
  })
  
  it('should create vector', async () => {
    const request = new Request('http://localhost/vectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'test' })
    })
    
    const response = await app.fetch(request, mockEnv)
    // ...
  })
})
```

### After:
```typescript
describe('Vector Route', () => {
  let testSetup: ReturnType<typeof setupVectorRouteTest>
  
  beforeEach(() => {
    testSetup = setupVectorRouteTest()
    testSetup.app.openapi(route, handler)
  })
  
  it('should create vector', async () => {
    const request = createMockRequest('http://localhost/vectors', {
      method: 'POST',
      body: { text: 'test' }
    })
    
    const response = await testSetup.app.fetch(request, testSetup.mockEnv)
    // ...
  })
})
```

## Benefits

1. **Reduced Duplication**: No more copying the same mock environment across files
2. **Consistency**: All tests use the same mock implementations
3. **Maintainability**: Update mocks in one place when types change
4. **Readability**: Tests focus on behavior, not setup boilerplate
5. **Type Safety**: TypeScript ensures mocks match expected interfaces

## Notes

- Start with new test files or when making significant changes
- Keep original tests working during gradual refactoring
- Run tests after each refactoring step to ensure nothing breaks
- Consider refactoring related test files together (e.g., all vector routes)