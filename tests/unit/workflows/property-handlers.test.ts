import { describe, it, expect } from 'vitest'
import { PropertyHandlers, VectorizableProperty, TitlePropertySchema, RichTextPropertySchema, SelectPropertySchema, MultiSelectPropertySchema, NumberPropertySchema, CheckboxPropertySchema, DatePropertySchema } from '../../../src/workflows/property-handlers'

describe('PropertyHandlers', () => {
  describe('schema validation', () => {
    describe('TitlePropertySchema', () => {
      it('should validate title property', () => {
        const titleProperty = {
          type: 'title',
          title: [
            { plain_text: 'Test Title' },
            { plain_text: ' Additional Text' }
          ]
        }

        const result = TitlePropertySchema.parse(titleProperty)
        expect(result.type).toBe('title')
        expect(result.title).toHaveLength(2)
      })

      it('should handle null plain_text', () => {
        const titleProperty = {
          type: 'title',
          title: [{ plain_text: null }]
        }

        const result = TitlePropertySchema.parse(titleProperty)
        expect(result.title[0].plain_text).toBe('')
      })
    })

    describe('RichTextPropertySchema', () => {
      it('should validate rich text property', () => {
        const richTextProperty = {
          type: 'rich_text',
          rich_text: [
            { plain_text: 'Rich text content' },
            { plain_text: ' More content' }
          ]
        }

        const result = RichTextPropertySchema.parse(richTextProperty)
        expect(result.type).toBe('rich_text')
        expect(result.rich_text).toHaveLength(2)
      })
    })

    describe('SelectPropertySchema', () => {
      it('should validate select property', () => {
        const selectProperty = {
          type: 'select',
          select: { name: 'Option 1' }
        }

        const result = SelectPropertySchema.parse(selectProperty)
        expect(result.type).toBe('select')
        expect(result.select.name).toBe('Option 1')
      })

      it('should handle null select', () => {
        const selectProperty = {
          type: 'select',
          select: null
        }

        const result = SelectPropertySchema.parse(selectProperty)
        expect(result.select.name).toBe('')
      })
    })

    describe('MultiSelectPropertySchema', () => {
      it('should validate multi select property', () => {
        const multiSelectProperty = {
          type: 'multi_select',
          multi_select: [
            { name: 'Tag 1' },
            { name: 'Tag 2' }
          ]
        }

        const result = MultiSelectPropertySchema.parse(multiSelectProperty)
        expect(result.type).toBe('multi_select')
        expect(result.multi_select).toHaveLength(2)
      })

      it('should handle null multi_select', () => {
        const multiSelectProperty = {
          type: 'multi_select',
          multi_select: null
        }

        const result = MultiSelectPropertySchema.parse(multiSelectProperty)
        expect(result.multi_select).toEqual([])
      })
    })

    describe('NumberPropertySchema', () => {
      it('should validate number property', () => {
        const numberProperty = {
          type: 'number',
          number: 42
        }

        const result = NumberPropertySchema.parse(numberProperty)
        expect(result.type).toBe('number')
        expect(result.number).toBe(42)
      })

      it('should handle null number', () => {
        const numberProperty = {
          type: 'number',
          number: null
        }

        const result = NumberPropertySchema.parse(numberProperty)
        expect(result.number).toBe(0)
      })
    })

    describe('CheckboxPropertySchema', () => {
      it('should validate checkbox property', () => {
        const checkboxProperty = {
          type: 'checkbox',
          checkbox: true
        }

        const result = CheckboxPropertySchema.parse(checkboxProperty)
        expect(result.type).toBe('checkbox')
        expect(result.checkbox).toBe(true)
      })
    })

    describe('DatePropertySchema', () => {
      it('should validate date property', () => {
        const dateProperty = {
          type: 'date',
          date: { start: '2023-01-01' }
        }

        const result = DatePropertySchema.parse(dateProperty)
        expect(result.type).toBe('date')
        expect(result.date.start).toBe('2023-01-01')
      })

      it('should handle null date', () => {
        const dateProperty = {
          type: 'date',
          date: null
        }

        const result = DatePropertySchema.parse(dateProperty)
        expect(result.date.start).toBe('')
      })
    })
  })

  describe('extractText', () => {
    it('should extract text from title property', () => {
      const titleProperty: VectorizableProperty = {
        type: 'title',
        title: [
          { plain_text: 'Hello' },
          { plain_text: ' World' }
        ]
      }

      const text = PropertyHandlers.extractText(titleProperty)
      expect(text).toBe('Hello  World')
    })

    it('should extract text from rich text property', () => {
      const richTextProperty: VectorizableProperty = {
        type: 'rich_text',
        rich_text: [
          { plain_text: 'Rich' },
          { plain_text: ' text' },
          { plain_text: ' content' }
        ]
      }

      const text = PropertyHandlers.extractText(richTextProperty)
      expect(text).toBe('Rich  text  content')
    })

    it('should extract text from select property', () => {
      const selectProperty: VectorizableProperty = {
        type: 'select',
        select: { name: 'Selected Option' }
      }

      const text = PropertyHandlers.extractText(selectProperty)
      expect(text).toBe('Selected Option')
    })

    it('should extract text from multi select property', () => {
      const multiSelectProperty: VectorizableProperty = {
        type: 'multi_select',
        multi_select: [
          { name: 'Tag1' },
          { name: 'Tag2' },
          { name: 'Tag3' }
        ]
      }

      const text = PropertyHandlers.extractText(multiSelectProperty)
      expect(text).toBe('Tag1, Tag2, Tag3')
    })

    it('should extract text from number property', () => {
      const numberProperty: VectorizableProperty = {
        type: 'number',
        number: 123
      }

      const text = PropertyHandlers.extractText(numberProperty)
      expect(text).toBe('123')
    })

    it('should extract text from checkbox property', () => {
      const checkboxTrueProperty: VectorizableProperty = {
        type: 'checkbox',
        checkbox: true
      }
      const checkboxFalseProperty: VectorizableProperty = {
        type: 'checkbox',
        checkbox: false
      }

      expect(PropertyHandlers.extractText(checkboxTrueProperty)).toBe('true')
      expect(PropertyHandlers.extractText(checkboxFalseProperty)).toBe('false')
    })

    it('should extract text from date property', () => {
      const dateProperty: VectorizableProperty = {
        type: 'date',
        date: { start: '2023-12-25' }
      }

      const text = PropertyHandlers.extractText(dateProperty)
      expect(text).toBe('2023-12-25')
    })

    it('should handle extraction errors gracefully', () => {
      const invalidProperty = {
        type: 'title',
        title: null
      } as any

      const text = PropertyHandlers.extractText(invalidProperty)
      expect(text).toBe('')
    })

    it('should trim whitespace from extracted text', () => {
      const titleProperty: VectorizableProperty = {
        type: 'title',
        title: [
          { plain_text: '  Hello  ' },
          { plain_text: '  World  ' }
        ]
      }

      const text = PropertyHandlers.extractText(titleProperty)
      expect(text).toBe('Hello     World')
    })
  })

  describe('isEmpty', () => {
    it('should identify empty properties', () => {
      const emptyProperties: VectorizableProperty[] = [
        { type: 'title', title: [] },
        { type: 'title', title: [{ plain_text: '' }] },
        { type: 'rich_text', rich_text: [] },
        { type: 'select', select: { name: '' } },
        { type: 'multi_select', multi_select: [] },
        { type: 'date', date: { start: '' } }
      ]

      emptyProperties.forEach(property => {
        expect(PropertyHandlers.isEmpty(property)).toBe(true)
      })
    })

    it('should identify non-empty properties', () => {
      const nonEmptyProperties: VectorizableProperty[] = [
        { type: 'title', title: [{ plain_text: 'Title' }] },
        { type: 'rich_text', rich_text: [{ plain_text: 'Content' }] },
        { type: 'select', select: { name: 'Option' } },
        { type: 'multi_select', multi_select: [{ name: 'Tag' }] },
        { type: 'number', number: 42 },
        { type: 'checkbox', checkbox: true },
        { type: 'checkbox', checkbox: false },
        { type: 'date', date: { start: '2023-01-01' } }
      ]

      nonEmptyProperties.forEach(property => {
        expect(PropertyHandlers.isEmpty(property)).toBe(false)
      })
    })
  })

  describe('getMetadata', () => {
    it('should generate basic metadata for all property types', () => {
      const titleProperty: VectorizableProperty = {
        type: 'title',
        title: [{ plain_text: 'Test Title' }]
      }

      const metadata = PropertyHandlers.getMetadata(titleProperty, 'page_title')
      
      expect(metadata.property_name).toBe('page_title')
      expect(metadata.property_type).toBe('title')
    })

    it('should generate metadata for select property', () => {
      const selectProperty: VectorizableProperty = {
        type: 'select',
        select: { name: 'Priority High' }
      }

      const metadata = PropertyHandlers.getMetadata(selectProperty, 'priority')
      
      expect(metadata.select_value).toBe('Priority High')
    })

    it('should generate metadata for multi select property', () => {
      const multiSelectProperty: VectorizableProperty = {
        type: 'multi_select',
        multi_select: [
          { name: 'React' },
          { name: 'TypeScript' },
          { name: 'Node.js' }
        ]
      }

      const metadata = PropertyHandlers.getMetadata(multiSelectProperty, 'technologies')
      
      expect(metadata.multi_select_values).toEqual(['React', 'TypeScript', 'Node.js'])
      expect(metadata.multi_select_count).toBe(3)
    })

    it('should generate metadata for number property', () => {
      const numberProperty: VectorizableProperty = {
        type: 'number',
        number: 85
      }

      const metadata = PropertyHandlers.getMetadata(numberProperty, 'score')
      
      expect(metadata.number_value).toBe(85)
    })

    it('should generate metadata for checkbox property', () => {
      const checkboxProperty: VectorizableProperty = {
        type: 'checkbox',
        checkbox: true
      }

      const metadata = PropertyHandlers.getMetadata(checkboxProperty, 'is_completed')
      
      expect(metadata.checkbox_value).toBe(true)
    })

    it('should generate metadata for date property', () => {
      const dateProperty: VectorizableProperty = {
        type: 'date',
        date: { start: '2023-06-15' }
      }

      const metadata = PropertyHandlers.getMetadata(dateProperty, 'due_date')
      
      expect(metadata.date_value).toBe('2023-06-15')
    })

    it('should not add specific metadata for empty values', () => {
      const emptySelectProperty: VectorizableProperty = {
        type: 'select',
        select: { name: '' }
      }

      const metadata = PropertyHandlers.getMetadata(emptySelectProperty, 'empty_select')
      
      expect(metadata.select_value).toBeUndefined()
    })
  })

  describe('processProperties', () => {
    it('should process valid properties and generate vector data', () => {
      const properties = {
        'title': {
          type: 'title',
          title: [{ plain_text: 'Test Page' }]
        },
        'status': {
          type: 'select',
          select: { name: 'In Progress' }
        },
        'tags': {
          type: 'multi_select',
          multi_select: [
            { name: 'urgent' },
            { name: 'review' }
          ]
        }
      }

      const vectorData = PropertyHandlers.processProperties(properties, 'page-123')

      expect(vectorData).toHaveLength(3)
      
      // Check title property
      const titleVector = vectorData.find(v => v.metadata.property_name === 'title')
      expect(titleVector).toBeDefined()
      expect(titleVector!.text).toBe('Test Page')
      expect(titleVector!.metadata.page_id).toBe('page-123')
      expect(titleVector!.metadata.source).toBe('notion_property')
      expect(titleVector!.id).toMatch(/page-123_prop_title_\d+/)

      // Check status property
      const statusVector = vectorData.find(v => v.metadata.property_name === 'status')
      expect(statusVector).toBeDefined()
      expect(statusVector!.text).toBe('In Progress')
      expect(statusVector!.metadata.select_value).toBe('In Progress')

      // Check tags property
      const tagsVector = vectorData.find(v => v.metadata.property_name === 'tags')
      expect(tagsVector).toBeDefined()
      expect(tagsVector!.text).toBe('urgent, review')
      expect(tagsVector!.metadata.multi_select_values).toEqual(['urgent', 'review'])
    })

    it('should skip unsupported property types', () => {
      const properties = {
        'supported_title': {
          type: 'title',
          title: [{ plain_text: 'Valid Title' }]
        },
        'unsupported_relation': {
          type: 'relation',
          relation: [{ id: 'related-page-id' }]
        }
      }

      const vectorData = PropertyHandlers.processProperties(properties, 'page-123')

      expect(vectorData).toHaveLength(1)
      expect(vectorData[0].metadata.property_name).toBe('supported_title')
    })

    it('should skip empty properties', () => {
      const properties = {
        'filled_title': {
          type: 'title',
          title: [{ plain_text: 'Valid Title' }]
        },
        'empty_title': {
          type: 'title',
          title: []
        },
        'empty_select': {
          type: 'select',
          select: { name: '' }
        }
      }

      const vectorData = PropertyHandlers.processProperties(properties, 'page-123')

      expect(vectorData).toHaveLength(1)
      expect(vectorData[0].metadata.property_name).toBe('filled_title')
    })

    it('should handle property processing errors gracefully', () => {
      const properties = {
        'valid_property': {
          type: 'title',
          title: [{ plain_text: 'Valid Title' }]
        },
        'invalid_property': {
          type: 'title',
          title: null // This will cause an error
        }
      }

      const vectorData = PropertyHandlers.processProperties(properties, 'page-123')

      expect(vectorData).toHaveLength(1)
      expect(vectorData[0].metadata.property_name).toBe('valid_property')
    })
  })

  describe('getProcessingStats', () => {
    it('should calculate processing statistics', () => {
      const properties = {
        'valid_title': {
          type: 'title',
          title: [{ plain_text: 'Title' }]
        },
        'empty_title': {
          type: 'title',
          title: []
        },
        'valid_select': {
          type: 'select',
          select: { name: 'Option' }
        },
        'unsupported_relation': {
          type: 'relation',
          relation: []
        },
        'invalid_property': {
          type: 'title',
          title: null
        }
      }

      const stats = PropertyHandlers.getProcessingStats(properties)

      expect(stats.totalProperties).toBe(5)
      expect(stats.supportedProperties).toBe(3) // valid_title, empty_title, valid_select
      expect(stats.skippedProperties).toBe(2) // unsupported_relation, invalid_property
      expect(stats.emptyProperties).toBe(1) // empty_title
      expect(stats.vectorizedProperties).toBe(2) // valid_title, valid_select
    })

    it('should handle empty properties object', () => {
      const stats = PropertyHandlers.getProcessingStats({})

      expect(stats.totalProperties).toBe(0)
      expect(stats.supportedProperties).toBe(0)
      expect(stats.skippedProperties).toBe(0)
      expect(stats.emptyProperties).toBe(0)
      expect(stats.vectorizedProperties).toBe(0)
    })

    it('should count all properties as skipped when all are invalid', () => {
      const properties = {
        'relation1': { type: 'relation', relation: [] },
        'formula1': { type: 'formula', formula: { string: 'result' } },
        'invalid1': null
      }

      const stats = PropertyHandlers.getProcessingStats(properties)

      expect(stats.totalProperties).toBe(3)
      expect(stats.supportedProperties).toBe(0)
      expect(stats.skippedProperties).toBe(3)
      expect(stats.emptyProperties).toBe(0)
      expect(stats.vectorizedProperties).toBe(0)
    })
  })
})