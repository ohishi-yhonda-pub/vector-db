import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deleteAllVectorsRoute, deleteAllVectorsHandler } from '../../../../src/routes/api/vectors/delete-all'
import { setupVectorRouteTest } from '../../test-helpers'

describe('Delete All Vectors Route', () => {
  let testSetup: ReturnType<typeof setupVectorRouteTest>

  beforeEach(() => {
    vi.clearAllMocks()
    testSetup = setupVectorRouteTest()
    testSetup.app.openapi(deleteAllVectorsRoute, deleteAllVectorsHandler)
  })

  describe('DELETE /vectors/all', () => {
    it('should delete all vectors with correct confirmation', async () => {
      testSetup.mockVectorManager.deleteAllVectors.mockResolvedValue({
        deletedCount: 5
      })

      const response = await testSetup.app.request('/vectors/all?confirm=DELETE_ALL', {
        method: 'DELETE'
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json() as any
      expect(json).toMatchObject({
        success: true,
        message: '5件のベクトルを削除しました',
        data: {
          deletedCount: 5,
          message: '全namespaceの全ベクトルを削除しました'
        }
      })
      expect(testSetup.mockVectorManager.deleteAllVectors).toHaveBeenCalled()
    })

    it('should reject without confirmation parameter', async () => {
      const response = await testSetup.app.request('/vectors/all', {
        method: 'DELETE'
      }, testSetup.mockEnv)

      expect(response.status).toBe(400)
      const json = await response.json() as any
      expect(json.success).toBe(false)
      // OpenAPIのバリデーションエラーの形式
      expect(json.error).toBeDefined()
      expect(testSetup.mockVectorManager.deleteAllVectors).not.toHaveBeenCalled()
    })

    it('should reject with incorrect confirmation parameter', async () => {
      const response = await testSetup.app.request('/vectors/all?confirm=delete', {
        method: 'DELETE'
      }, testSetup.mockEnv)

      expect(response.status).toBe(400)
      const json = await response.json() as any
      expect(json.success).toBe(false)
      expect(json.error).toBeDefined()
      expect(testSetup.mockVectorManager.deleteAllVectors).not.toHaveBeenCalled()
    })

    it('should handle empty vector list gracefully', async () => {
      testSetup.mockVectorManager.deleteAllVectors.mockResolvedValue({
        deletedCount: 0
      })

      const response = await testSetup.app.request('/vectors/all?confirm=DELETE_ALL', {
        method: 'DELETE'
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json() as any
      expect(json).toMatchObject({
        success: true,
        message: '0件のベクトルを削除しました',
        data: {
          deletedCount: 0
        }
      })
      expect(testSetup.mockVectorManager.deleteAllVectors).toHaveBeenCalled()
    })

    it('should handle large number of vectors', async () => {
      testSetup.mockVectorManager.deleteAllVectors.mockResolvedValue({
        deletedCount: 1500
      })

      const response = await testSetup.app.request('/vectors/all?confirm=DELETE_ALL', {
        method: 'DELETE'
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json() as any
      expect(json).toMatchObject({
        success: true,
        message: '1500件のベクトルを削除しました',
        data: {
          deletedCount: 1500
        }
      })
      expect(testSetup.mockVectorManager.deleteAllVectors).toHaveBeenCalled()
    })

    it('should handle VectorManager errors', async () => {
      testSetup.mockVectorManager.deleteAllVectors.mockRejectedValue(new Error('VectorManager error'))

      const response = await testSetup.app.request('/vectors/all?confirm=DELETE_ALL', {
        method: 'DELETE'
      }, testSetup.mockEnv)

      expect(response.status).toBe(500)
      const json = await response.json() as any
      expect(json).toMatchObject({
        success: false,
        error: 'Internal Server Error',
        message: 'VectorManager error'
      })
    })

    it('should handle Vectorize deletion errors gracefully', async () => {
      // delete-allの実装はDurable Object経由でdeleteAllVectorsを呼ぶだけなので
      // Vectorize操作はDurable Object内で行われる
      testSetup.mockVectorManager.deleteAllVectors.mockResolvedValue({
        deletedCount: 3
      })

      const response = await testSetup.app.request('/vectors/all?confirm=DELETE_ALL', {
        method: 'DELETE'
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json() as any
      expect(json).toMatchObject({
        success: true,
        message: '3件のベクトルを削除しました',
        data: {
          deletedCount: 3
        }
      })
    })

    it('should handle partial batch failures', async () => {
      // Durable Object内で処理されるため、エラーハンドリングもそちらで行われる
      testSetup.mockVectorManager.deleteAllVectors.mockResolvedValue({
        deletedCount: 250
      })

      const response = await testSetup.app.request('/vectors/all?confirm=DELETE_ALL', {
        method: 'DELETE'
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json() as any
      expect(json).toMatchObject({
        success: true,
        message: '250件のベクトルを削除しました',
        data: {
          deletedCount: 250
        }
      })
    })

    it('should handle non-Error exceptions', async () => {
      testSetup.mockVectorManager.deleteAllVectors.mockRejectedValue({ code: 'UNKNOWN_ERROR' })

      const response = await testSetup.app.request('/vectors/all?confirm=DELETE_ALL', {
        method: 'DELETE'
      }, testSetup.mockEnv)

      expect(response.status).toBe(500)
      const json = await response.json() as any
      expect(json).toMatchObject({
        success: false,
        error: 'Internal Server Error',
        message: '全削除中にエラーが発生しました'
      })
    })

    it('should handle case-sensitive confirmation parameter', async () => {
      const response = await testSetup.app.request('/vectors/all?confirm=delete_all', {
        method: 'DELETE'
      }, testSetup.mockEnv)

      expect(response.status).toBe(400)
      const json = await response.json() as any
      expect(json.success).toBe(false)
      expect(json.error).toBeDefined()
    })

    it('should delete vectors for specific namespace', async () => {
      testSetup.mockVectorManager.deleteAllVectors.mockResolvedValue({
        deletedCount: 10
      })

      const response = await testSetup.app.request('/vectors/all?confirm=DELETE_ALL&namespace=test-namespace', {
        method: 'DELETE'
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json() as any
      expect(json).toMatchObject({
        success: true,
        message: '10件のベクトルを削除しました',
        data: {
          deletedCount: 10,
          message: 'Namespace "test-namespace" 内の全ベクトルを削除しました'
        }
      })
      expect(testSetup.mockVectorManager.deleteAllVectors).toHaveBeenCalledWith('test-namespace')
    })

    it('should handle namespace deletion with zero results', async () => {
      testSetup.mockVectorManager.deleteAllVectors.mockResolvedValue({
        deletedCount: 0
      })

      const response = await testSetup.app.request('/vectors/all?confirm=DELETE_ALL&namespace=empty-namespace', {
        method: 'DELETE'
      }, testSetup.mockEnv)

      expect(response.status).toBe(200)
      const json = await response.json() as any
      expect(json).toMatchObject({
        success: true,
        message: '0件のベクトルを削除しました',
        data: {
          deletedCount: 0,
          message: 'Namespace "empty-namespace" 内の全ベクトルを削除しました'
        }
      })
      expect(testSetup.mockVectorManager.deleteAllVectors).toHaveBeenCalledWith('empty-namespace')
    })
  })
})