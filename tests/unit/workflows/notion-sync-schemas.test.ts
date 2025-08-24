import { describe, it, expect } from 'vitest'
import {
  TitlePropertySchema,
  RichTextPropertySchema,
  SelectPropertySchema,
  MultiSelectPropertySchema,
  VectorizablePropertySchema
} from '../../../src/workflows/notion-sync'

describe('Notion Sync Zod Schemas', () => {
  describe('TitlePropertySchema', () => {
    it('should parse valid title property', () => {
      const data = {
        type: 'title',
        title: [
          { plain_text: 'Test Title' },
          { plain_text: ' Part 2' }
        ]
      }
      const result = TitlePropertySchema.parse(data)
      expect(result.title[0].plain_text).toBe('Test Title')
      expect(result.title[1].plain_text).toBe(' Part 2')
    })

    it('should handle missing plain_text with transform', () => {
      const data = {
        type: 'title',
        title: [
          { plain_text: 'Test' },
          { annotations: { bold: true } }, // No plain_text
          { plain_text: undefined }, // Undefined plain_text
          { plain_text: null }, // Null plain_text
        ]
      }
      const result = TitlePropertySchema.parse(data)
      expect(result.title[0].plain_text).toBe('Test')
      expect(result.title[1].plain_text).toBe('')
      expect(result.title[2].plain_text).toBe('')
      expect(result.title[3].plain_text).toBe('')
    })

    it('should handle empty title array', () => {
      const data = {
        type: 'title',
        title: []
      }
      const result = TitlePropertySchema.parse(data)
      expect(result.title).toHaveLength(0)
    })
  })

  describe('RichTextPropertySchema', () => {
    it('should parse valid rich_text property', () => {
      const data = {
        type: 'rich_text',
        rich_text: [
          { plain_text: 'Some text' },
          { plain_text: ' more text' }
        ]
      }
      const result = RichTextPropertySchema.parse(data)
      expect(result.rich_text[0].plain_text).toBe('Some text')
      expect(result.rich_text[1].plain_text).toBe(' more text')
    })

    it('should handle missing plain_text with transform', () => {
      const data = {
        type: 'rich_text',
        rich_text: [
          { plain_text: null },
          { plain_text: undefined },
          {}
        ]
      }
      const result = RichTextPropertySchema.parse(data)
      expect(result.rich_text[0].plain_text).toBe('')
      expect(result.rich_text[1].plain_text).toBe('')
      expect(result.rich_text[2].plain_text).toBe('')
    })

    it('should handle empty rich_text array', () => {
      const data = {
        type: 'rich_text',
        rich_text: []
      }
      const result = RichTextPropertySchema.parse(data)
      expect(result.rich_text).toHaveLength(0)
    })
  })

  describe('SelectPropertySchema', () => {
    it('should parse valid select property', () => {
      const data = {
        type: 'select',
        select: { name: 'Option 1' }
      }
      const result = SelectPropertySchema.parse(data)
      expect(result.select?.name).toBe('Option 1')
    })

    it('should handle null select', () => {
      const data = {
        type: 'select',
        select: null
      }
      const result = SelectPropertySchema.parse(data)
      expect(result.select).toEqual({ name: '' })
    })
  })

  describe('MultiSelectPropertySchema', () => {
    it('should parse valid multi_select property', () => {
      const data = {
        type: 'multi_select',
        multi_select: [
          { name: 'Tag 1' },
          { name: 'Tag 2' }
        ]
      }
      const result = MultiSelectPropertySchema.parse(data)
      expect(result.multi_select).toHaveLength(2)
      expect(result.multi_select?.[0].name).toBe('Tag 1')
    })

    it('should handle null multi_select', () => {
      const data = {
        type: 'multi_select',
        multi_select: null
      }
      const result = MultiSelectPropertySchema.parse(data)
      expect(result.multi_select).toEqual([])
    })

    it('should handle empty multi_select array', () => {
      const data = {
        type: 'multi_select',
        multi_select: []
      }
      const result = MultiSelectPropertySchema.parse(data)
      expect(result.multi_select).toHaveLength(0)
    })
  })

  describe('VectorizablePropertySchema', () => {
    it('should parse title property through discriminated union', () => {
      const data = {
        type: 'title',
        title: [{ plain_text: 'Title' }]
      }
      const result = VectorizablePropertySchema.parse(data)
      expect(result.type).toBe('title')
      expect((result as any).title[0].plain_text).toBe('Title')
    })

    it('should parse rich_text property through discriminated union', () => {
      const data = {
        type: 'rich_text',
        rich_text: [{ plain_text: 'Text' }]
      }
      const result = VectorizablePropertySchema.parse(data)
      expect(result.type).toBe('rich_text')
      expect((result as any).rich_text[0].plain_text).toBe('Text')
    })

    it('should parse select property through discriminated union', () => {
      const data = {
        type: 'select',
        select: { name: 'Option' }
      }
      const result = VectorizablePropertySchema.parse(data)
      expect(result.type).toBe('select')
      expect((result as any).select.name).toBe('Option')
    })

    it('should parse multi_select property through discriminated union', () => {
      const data = {
        type: 'multi_select',
        multi_select: [{ name: 'Tag' }]
      }
      const result = VectorizablePropertySchema.parse(data)
      expect(result.type).toBe('multi_select')
      expect((result as any).multi_select[0].name).toBe('Tag')
    })

    it('should throw error for unsupported property type', () => {
      const data = {
        type: 'checkbox',
        checkbox: true
      }
      expect(() => VectorizablePropertySchema.parse(data)).toThrow()
    })

    it('should throw error for invalid type field', () => {
      const data = {
        type: 'invalid_type',
        some_field: 'value'
      }
      expect(() => VectorizablePropertySchema.parse(data)).toThrow()
    })
  })
})