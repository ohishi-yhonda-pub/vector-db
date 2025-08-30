import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock cloudflare:workers
vi.mock('cloudflare:workers', () => ({
  WorkflowEntrypoint: class {
    constructor(public ctx: any, public env: any) {}
  },
  WorkflowStep: {},
  WorkflowEvent: {}
}))

// Mock dependencies
vi.mock('../../../src/services/notion.service', () => ({
  NotionService: vi.fn()
}))

vi.mock('../../../src/db', () => ({
  getDb: vi.fn()
}))

import { NotionSyncWorkflow } from '../../../src/workflows/notion-sync'

describe('NotionSyncWorkflow - extractPlainTextFromBlock', () => {
  let workflow: NotionSyncWorkflow
  const mockEnv = {
    VECTOR_CACHE: {
      idFromName: vi.fn(),
      get: vi.fn()
    },
    DEFAULT_EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5'
  }

  beforeEach(() => {
    workflow = new NotionSyncWorkflow({} as any, mockEnv as any)
  })

  it('should extract text from paragraph blocks', () => {
    const block = {
      type: 'paragraph',
      paragraph: {
        rich_text: [
          { plain_text: 'This is ' },
          { plain_text: 'a paragraph' }
        ]
      }
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe('This is a paragraph')
  })

  it('should extract text from heading_1 blocks', () => {
    const block = {
      type: 'heading_1',
      heading_1: {
        rich_text: [{ plain_text: 'Main Heading' }]
      }
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe('Main Heading')
  })

  it('should extract text from heading_2 blocks', () => {
    const block = {
      type: 'heading_2',
      heading_2: {
        rich_text: [{ plain_text: 'Sub Heading' }]
      }
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe('Sub Heading')
  })

  it('should extract text from heading_3 blocks', () => {
    const block = {
      type: 'heading_3',
      heading_3: {
        rich_text: [{ plain_text: 'Small Heading' }]
      }
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe('Small Heading')
  })

  it('should extract text from bulleted_list_item blocks', () => {
    const block = {
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [{ plain_text: 'List item' }]
      }
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe('List item')
  })

  it('should extract text from numbered_list_item blocks', () => {
    const block = {
      type: 'numbered_list_item',
      numbered_list_item: {
        rich_text: [{ plain_text: 'Item 1' }]
      }
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe('Item 1')
  })

  it('should extract text from to_do blocks', () => {
    const block = {
      type: 'to_do',
      to_do: {
        rich_text: [{ plain_text: 'Task to complete' }],
        checked: false
      }
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe('Task to complete')
  })

  it('should extract text from toggle blocks', () => {
    const block = {
      type: 'toggle',
      toggle: {
        rich_text: [{ plain_text: 'Toggle content' }]
      }
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe('Toggle content')
  })

  it('should extract text from quote blocks', () => {
    const block = {
      type: 'quote',
      quote: {
        rich_text: [{ plain_text: 'Famous quote' }]
      }
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe('Famous quote')
  })

  it('should extract text from callout blocks', () => {
    const block = {
      type: 'callout',
      callout: {
        rich_text: [{ plain_text: 'Important note' }]
      }
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe('Important note')
  })

  it('should extract text from code blocks', () => {
    const block = {
      type: 'code',
      code: {
        rich_text: [{ plain_text: 'const x = 42;' }],
        language: 'javascript'
      }
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe('const x = 42;')
  })

  it('should extract text from table_row blocks', () => {
    const block = {
      type: 'table_row',
      table_row: {
        cells: [
          [{ plain_text: 'Cell 1' }],
          [{ plain_text: 'Cell 2' }],
          [{ plain_text: 'Cell 3' }]
        ]
      }
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe('Cell 1 Cell 2 Cell 3')
  })

  it('should handle empty cells in table_row', () => {
    const block = {
      type: 'table_row',
      table_row: {
        cells: [
          [],
          [{ plain_text: 'Cell 2' }],
          []
        ]
      }
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe(' Cell 2 ')
  })

  it('should return empty string for unsupported block types', () => {
    const block = {
      type: 'divider',
      divider: {}
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe('')
  })

  it('should handle blocks with missing content gracefully', () => {
    const block = {
      type: 'paragraph',
      // Missing paragraph property
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe('')
  })

  it('should handle malformed rich_text arrays', () => {
    const block = {
      type: 'paragraph',
      paragraph: {
        rich_text: null
      }
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe('')
  })

  it('should handle rich_text items without plain_text', () => {
    const block = {
      type: 'paragraph',
      paragraph: {
        rich_text: [
          { plain_text: 'Text 1' },
          { annotations: { bold: true } }, // No plain_text
          { plain_text: 'Text 2' }
        ]
      }
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe('Text 1Text 2')
  })

  it('should handle malformed table_row cells', () => {
    const block = {
      type: 'table_row',
      table_row: {
        cells: null
      }
    }

    const result = (workflow as any).extractPlainTextFromBlock(block)
    expect(result).toBe('')
  })
})