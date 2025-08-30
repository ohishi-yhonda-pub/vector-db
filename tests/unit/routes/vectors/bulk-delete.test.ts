import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bulkDeleteVectorsRoute, bulkDeleteVectorsHandler } from '../../../../src/routes/api/vectors/bulk-delete'
import { setupVectorRouteTest } from '../../test-helpers'

describe('Bulk Delete Vectors Route', () => {
  let testSetup: ReturnType<typeof setupVectorRouteTest>

  beforeEach(() => {
    vi.clearAllMocks()
    testSetup = setupVectorRouteTest()
    testSetup.app.openapi(bulkDeleteVectorsRoute, bulkDeleteVectorsHandler)
  })

  describe('POST /vectors/bulk-delete', () => {
    it('should delete vectors successfully', async () => {
      testSetup.mockVectorizeIndex.deleteByIds.mockResolvedValue({ mutationId: 'mut-123' })
      testSetup.mockVectorManager.removeDeletedVectors.mockResolvedValue(undefined)

      const response = await testSetup.app.request('/vectors/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ids: ['vec_1', 'vec_2', 'vec_3']
        })
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json() as any
      expect(json).toMatchObject({
        success: true,
        data: {
          requested: 3,
          deleted: 3,
          failed: 0
        }
      })
      expect(testSetup.mockVectorizeIndex.deleteByIds).toHaveBeenCalledWith(['vec_1', 'vec_2', 'vec_3'])
      expect(testSetup.mockVectorManager.removeDeletedVectors).toHaveBeenCalledWith(['vec_1', 'vec_2', 'vec_3'])
    })

    it('should handle empty ID list', async () => {
      const response = await testSetup.app.request('/vectors/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ids: []
        })
      }, testSetup.mockEnv)

      expect(response.status).toBe(400)
      const json = await response.json() as any
      // OpenAPIのバリデーションエラーは異なる形式
      expect(json.success).toBe(false)
      // エラーがオブジェクトとして含まれることを確認
      expect(json.error).toBeDefined()
      // IDリストに関するエラーメッセージが含まれることを確認
      const errorStr = JSON.stringify(json)
      expect(errorStr.toLowerCase()).toContain('id')
    })

    it('should handle too many IDs', async () => {
      const tooManyIds = Array.from({ length: 1001 }, (_, i) => `vec_${i}`)
      
      const response = await testSetup.app.request('/vectors/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ids: tooManyIds
        })
      }, testSetup.mockEnv)

      expect(response.status).toBe(400)
      const json = await response.json() as any
      // Zodバリデーションエラーの形式を確認
      expect(json.success).toBe(false)
      // error フィールドがオブジェクトの可能性がある
      expect(json.error).toBeDefined()
    })

    it('should handle deletion errors', async () => {
      // 最初のバッチは失敗、2番目のバッチは成功
      testSetup.mockVectorizeIndex.deleteByIds
        .mockRejectedValueOnce(new Error('Delete failed'))
        .mockResolvedValueOnce({ mutationId: 'mut-123' })

      const ids = Array.from({ length: 150 }, (_, i) => `vec_${i}`)
      
      const response = await testSetup.app.request('/vectors/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids })
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json() as any
      expect(json.success).toBe(false)
      expect(json.data?.requested).toBe(150)
      expect(json.data?.deleted).toBe(50) // 2番目のバッチ（50個）は成功
      expect(json.data?.failed).toBe(100) // 最初のバッチ（100個）は失敗
      expect(json.data?.errors).toHaveLength(1)
      expect(json.data?.errors?.[0]).toContain('Delete failed')
    })

    it('should handle non-Error deletion failures', async () => {
      // 最初のバッチは非Errorで失敗、2番目のバッチは成功
      testSetup.mockVectorizeIndex.deleteByIds
        .mockRejectedValueOnce('String error')
        .mockResolvedValueOnce({ mutationId: 'mut-123' })

      const ids = Array.from({ length: 150 }, (_, i) => `vec_${i}`)
      
      const response = await testSetup.app.request('/vectors/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids })
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json() as any
      expect(json.success).toBe(false)
      expect(json.data?.requested).toBe(150)
      expect(json.data?.deleted).toBe(50) // 2番目のバッチ（50個）は成功
      expect(json.data?.failed).toBe(100) // 最初のバッチ（100個）は失敗
      expect(json.data?.errors).toHaveLength(1)
      expect(json.data?.errors?.[0]).toContain('Unknown error')
    })

    it('should handle VectorManager update failure gracefully', async () => {
      testSetup.mockVectorizeIndex.deleteByIds.mockResolvedValue({ mutationId: 'mut-123' })
      testSetup.mockVectorManager.removeDeletedVectors.mockRejectedValue(new Error('Update failed'))

      const response = await testSetup.app.request('/vectors/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ids: ['vec_1']
        })
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json() as any
      expect(json).toMatchObject({
        success: true,
        data: {
          requested: 1,
          deleted: 1,
          failed: 0
        }
      })
    })

    it('should handle invalid JSON', async () => {
      const response = await testSetup.app.request('/vectors/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: 'invalid json'
      }, testSetup.mockEnv)

      expect(response.status).toBe(400)
    })

    it('should handle missing IDs field', async () => {
      const response = await testSetup.app.request('/vectors/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      }, testSetup.mockEnv)

      expect(response.status).toBe(400)
      const json = await response.json() as any
      expect(json.success).toBe(false)
    })

    it('should process batches correctly', async () => {
      testSetup.mockVectorizeIndex.deleteByIds.mockResolvedValue({ mutationId: 'mut-123' })
      
      // 250個のID（3バッチ: 100, 100, 50）
      const ids = Array.from({ length: 250 }, (_, i) => `vec_${i}`)
      
      const response = await testSetup.app.request('/vectors/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids })
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json() as any
      expect(json).toMatchObject({
        success: true,
        data: {
          requested: 250,
          deleted: 250,
          failed: 0
        }
      })
      
      // 3回呼ばれることを確認（100, 100, 50）
      expect(testSetup.mockVectorizeIndex.deleteByIds).toHaveBeenCalledTimes(3)
    })
  })

  describe('Handler direct tests for edge cases', () => {
    it('should handle null or non-array IDs', async () => {
      const c = {
        req: {
          json: vi.fn().mockResolvedValue({ ids: null })
        },
        json: vi.fn((data, status) => ({ data, status })),
        env: testSetup.mockEnv
      } as any

      const result = await bulkDeleteVectorsHandler(c, {} as any)
      
      expect(c.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Bad Request',
          message: 'IDリストが指定されていません'
        }),
        400
      )
    })

    it('should handle more than 1000 IDs', async () => {
      const tooManyIds = Array.from({ length: 1001 }, (_, i) => `vec_${i}`)
      
      const c = {
        req: {
          json: vi.fn().mockResolvedValue({ ids: tooManyIds })
        },
        json: vi.fn((data, status) => ({ data, status })),
        env: testSetup.mockEnv
      } as any

      const result = await bulkDeleteVectorsHandler(c, {} as any)
      
      expect(c.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Bad Request',
          message: 'IDは最大1000件まで指定できます'
        }),
        400
      )
    })

    it('should handle general errors in the main try-catch', async () => {
      const c = {
        req: {
          json: vi.fn().mockRejectedValue(new Error('Unexpected error'))
        },
        json: vi.fn((data, status) => ({ data, status })),
        env: testSetup.mockEnv
      } as any

      const result = await bulkDeleteVectorsHandler(c, {} as any)
      
      expect(c.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Internal Server Error',
          message: 'Unexpected error'
        }),
        500
      )
    })

    it('should handle non-Error objects in the main catch', async () => {
      const c = {
        req: {
          json: vi.fn().mockRejectedValue('String error')
        },
        json: vi.fn((data, status) => ({ data, status })),
        env: testSetup.mockEnv
      } as any

      const result = await bulkDeleteVectorsHandler(c, {} as any)
      
      expect(c.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Internal Server Error',
          message: '一括削除中にエラーが発生しました'
        }),
        500
      )
    })
  })
})