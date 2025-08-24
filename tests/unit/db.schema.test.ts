import { describe, it, expect } from 'vitest'
console.log('Running DB Schema Tests')
import { env } from 'cloudflare:test'

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[]
  }
}

describe('Database Schema', () => {
  describe('Basic Test', () => {
    it('should have env available', () => {
      expect(env).toBeDefined()
      expect(env.DB).toBeDefined()
    })

    it('should run basic test', () => {
      expect(true).toBe(true)
    })
  })
})