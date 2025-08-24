import { describe, it, expect } from 'vitest'

describe('Notion Sync Select Null Tests', () => {
  it('should handle select with null value', () => {
    const property = {
      type: 'select' as const,
      select: null as { name: string } | null
    }
    
    // selectがnullの場合の処理
    const text = property.select?.name ?? ''
    expect(text).toBe('')
  })

  it('should handle multi_select with null value', () => {
    const property = {
      type: 'multi_select' as const,
      multi_select: null as { name: string }[] | null
    }
    
    // multi_selectがnullの場合の処理
    const text = property.multi_select
      ?.map((s: { name: string }) => s.name)
      .join(', ') ?? ''
    expect(text).toBe('')
  })
  
  it('should handle non-Error exceptions', () => {
    const error: unknown = 'string error'
    const message = error instanceof Error ? error.message : 'Unknown error'
    expect(message).toBe('Unknown error')
  })
})