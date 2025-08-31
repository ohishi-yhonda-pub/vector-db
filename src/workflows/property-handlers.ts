/**
 * Notionプロパティ処理ハンドラー
 * 各プロパティタイプの処理とベクトル化データの生成
 */

import { z } from 'zod'
import { AppError, ErrorCodes } from '../utils/error-handler'

// Notionプロパティの型定義
export const TitlePropertySchema = z.object({
  type: z.literal('title'),
  title: z.array(z.object({
    plain_text: z.string().nullable().optional().transform(val => val ?? '')
  }))
})

export const RichTextPropertySchema = z.object({
  type: z.literal('rich_text'),
  rich_text: z.array(z.object({
    plain_text: z.string().nullable().optional().transform(val => val ?? '')
  }))
})

export const SelectPropertySchema = z.object({
  type: z.literal('select'),
  select: z.object({
    name: z.string()
  }).nullable().transform(val => val ?? { name: '' })
})

export const MultiSelectPropertySchema = z.object({
  type: z.literal('multi_select'),
  multi_select: z.array(z.object({
    name: z.string()
  })).nullable().transform(val => val ?? [])
})

export const NumberPropertySchema = z.object({
  type: z.literal('number'),
  number: z.number().nullable().transform(val => val ?? 0)
})

export const CheckboxPropertySchema = z.object({
  type: z.literal('checkbox'),
  checkbox: z.boolean()
})

export const DatePropertySchema = z.object({
  type: z.literal('date'),
  date: z.object({
    start: z.string()
  }).nullable().transform(val => val ?? { start: '' })
})

export const VectorizablePropertySchema = z.discriminatedUnion('type', [
  TitlePropertySchema,
  RichTextPropertySchema,
  SelectPropertySchema,
  MultiSelectPropertySchema,
  NumberPropertySchema,
  CheckboxPropertySchema,
  DatePropertySchema
])

export type VectorizableProperty = z.infer<typeof VectorizablePropertySchema>

/**
 * プロパティハンドラークラス
 * 各プロパティタイプの処理を管理
 */
export class PropertyHandlers {
  /**
   * プロパティからテキストを抽出
   */
  static extractText(property: VectorizableProperty): string {
    try {
      switch (property.type) {
        case 'title':
          return property.title
            .map(item => item.plain_text)
            .join(' ')
            .trim()

        case 'rich_text':
          return property.rich_text
            .map(item => item.plain_text)
            .join(' ')
            .trim()

        case 'select':
          return property.select.name || ''

        case 'multi_select':
          return property.multi_select
            .map(item => item.name)
            .join(', ')

        case 'number':
          return property.number.toString()

        case 'checkbox':
          return property.checkbox ? 'true' : 'false'

        case 'date':
          return property.date.start || ''

        default:
          return ''
      }
    } catch (error: any) {
      console.warn('Failed to extract text from property:', error.message)
      return ''
    }
  }

  /**
   * プロパティが空かどうかをチェック
   */
  static isEmpty(property: VectorizableProperty): boolean {
    const text = this.extractText(property)
    return !text || text.trim().length === 0
  }

  /**
   * プロパティのメタデータを生成
   */
  static getMetadata(property: VectorizableProperty, propertyName: string): Record<string, any> {
    const metadata: Record<string, any> = {
      property_name: propertyName,
      property_type: property.type
    }

    switch (property.type) {
      case 'select':
        if (property.select.name) {
          metadata.select_value = property.select.name
        }
        break

      case 'multi_select':
        if (property.multi_select.length > 0) {
          metadata.multi_select_values = property.multi_select.map(item => item.name)
          metadata.multi_select_count = property.multi_select.length
        }
        break

      case 'number':
        metadata.number_value = property.number
        break

      case 'checkbox':
        metadata.checkbox_value = property.checkbox
        break

      case 'date':
        if (property.date.start) {
          metadata.date_value = property.date.start
        }
        break
    }

    return metadata
  }

  /**
   * 複数のプロパティを処理してベクトル化用データを生成
   */
  static processProperties(
    properties: Record<string, any>, 
    pageId: string
  ): Array<{
    id: string
    text: string
    metadata: Record<string, any>
  }> {
    const vectorData: Array<{
      id: string
      text: string
      metadata: Record<string, any>
    }> = []

    for (const [propertyName, propertyValue] of Object.entries(properties)) {
      try {
        // スキーマバリデーション
        const validatedProperty = VectorizablePropertySchema.safeParse(propertyValue)
        if (!validatedProperty.success) {
          console.warn(`Skipping unsupported property type: ${propertyName}`)
          continue
        }

        const property = validatedProperty.data

        // 空のプロパティをスキップ
        if (this.isEmpty(property)) {
          continue
        }

        // テキスト抽出
        const text = this.extractText(property)
        if (!text) {
          continue
        }

        // メタデータ生成
        const metadata = this.getMetadata(property, propertyName)
        metadata.page_id = pageId
        metadata.source = 'notion_property'

        // ベクトルIDを生成
        const vectorId = `${pageId}_prop_${propertyName}_${Date.now()}`

        vectorData.push({
          id: vectorId,
          text,
          metadata
        })

      } catch (error: any) {
        console.warn(`Failed to process property ${propertyName}:`, error.message)
        continue
      }
    }

    return vectorData
  }

  /**
   * プロパティ処理の統計情報を生成
   */
  static getProcessingStats(properties: Record<string, any>): {
    totalProperties: number
    supportedProperties: number
    skippedProperties: number
    emptyProperties: number
    vectorizedProperties: number
  } {
    let supportedProperties = 0
    let skippedProperties = 0
    let emptyProperties = 0
    let vectorizedProperties = 0

    for (const [propertyName, propertyValue] of Object.entries(properties)) {
      try {
        const validatedProperty = VectorizablePropertySchema.safeParse(propertyValue)
        if (!validatedProperty.success) {
          skippedProperties++
          continue
        }

        supportedProperties++
        const property = validatedProperty.data

        if (this.isEmpty(property)) {
          emptyProperties++
        } else {
          vectorizedProperties++
        }
      } catch {
        skippedProperties++
      }
    }

    return {
      totalProperties: Object.keys(properties).length,
      supportedProperties,
      skippedProperties,
      emptyProperties,
      vectorizedProperties
    }
  }
}