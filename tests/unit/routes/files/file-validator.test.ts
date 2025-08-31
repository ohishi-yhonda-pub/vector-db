import { describe, it, expect } from 'vitest'
import { FileValidator, SUPPORTED_FILE_TYPES, MAX_FILE_SIZE } from '../../../../src/routes/api/files/file-validator'

describe('FileValidator', () => {
  describe('validateFile', () => {
    it('should validate File object', () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
      expect(FileValidator.validateFile(file)).toBe(true)
    })

    it('should reject non-File objects', () => {
      expect(FileValidator.validateFile('not a file')).toBe(false)
      expect(FileValidator.validateFile(null)).toBe(false)
      expect(FileValidator.validateFile(undefined)).toBe(false)
      expect(FileValidator.validateFile({})).toBe(false)
    })
  })

  describe('validateFileSize', () => {
    it('should accept files under size limit', () => {
      const file = new File(['x'.repeat(1000)], 'test.pdf', { type: 'application/pdf' })
      const result = FileValidator.validateFileSize(file)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject files over size limit', () => {
      const content = new Uint8Array(MAX_FILE_SIZE + 1)
      const file = new File([content], 'large.pdf', { type: 'application/pdf' })
      const result = FileValidator.validateFileSize(file)
      expect(result.valid).toBe(false)
      expect(result.error?.error).toBe('Payload Too Large')
      expect(result.error?.message).toContain('10MB')
    })
  })

  describe('validateFileType', () => {
    it('should accept supported file types', () => {
      SUPPORTED_FILE_TYPES.forEach(type => {
        const file = new File(['content'], 'test', { type })
        const result = FileValidator.validateFileType(file)
        expect(result.valid).toBe(true)
        expect(result.error).toBeUndefined()
      })
    })

    it('should reject unsupported file types', () => {
      const unsupportedTypes = [
        'text/plain',
        'application/json',
        'video/mp4',
        'audio/mpeg'
      ]

      unsupportedTypes.forEach(type => {
        const file = new File(['content'], 'test', { type })
        const result = FileValidator.validateFileType(file)
        expect(result.valid).toBe(false)
        expect(result.error?.error).toBe('Unsupported Media Type')
        expect(result.error?.message).toContain(type)
      })
    })
  })

  describe('validateMetadata', () => {
    it('should accept valid JSON metadata', () => {
      const metadata = JSON.stringify({ key: 'value', number: 123 })
      const result = FileValidator.validateMetadata(metadata)
      expect(result.valid).toBe(true)
      expect(result.data).toEqual({ key: 'value', number: 123 })
      expect(result.error).toBeUndefined()
    })

    it('should accept null metadata', () => {
      const result = FileValidator.validateMetadata(null)
      expect(result.valid).toBe(true)
      expect(result.data).toEqual({})
      expect(result.error).toBeUndefined()
    })

    it('should reject invalid JSON', () => {
      const result = FileValidator.validateMetadata('invalid json')
      expect(result.valid).toBe(false)
      expect(result.error?.error).toBe('Bad Request')
      expect(result.error?.message).toContain('メタデータのバリデーション')
    })
  })
})