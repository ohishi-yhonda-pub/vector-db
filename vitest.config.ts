import { defineWorkersProject, readD1Migrations } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersProject(async () => {
  const migrationsPath = "./migrations";

  const migrations = await readD1Migrations(migrationsPath)
  return {
    test: {
      globals: true,
      setupFiles: ['./tests/apply-migrations.ts'],
      exclude: ['**/tests_backup/**', '**/node_modules/**', '**/dist/**'],
      silent: false,
      reporters: ['basic'],
      testTimeout: 30000,
      hookTimeout: 10000,
      sequence: {
        concurrent: false,
      },
      poolOptions: {
        workers: {
          singleWorker: true,
          isolatedStorage: false,
          miniflare: {
            compatibilityDate: '2024-12-18',
            compatibilityFlags: ['nodejs_compat'],
            d1Databases: {
              DB: 'test-db'
            },
            bindings: {
              TEST_MIGRATIONS: migrations,
            }
          },
        },
      },
      deps: {
        optimizer: {
          ssr: {
            include: ['ajv']
          }
        }
      },
      coverage: {
        enabled: true,
        provider: 'istanbul',
        reporter: ['text', 'json', 'html', 'lcov'],
        reportsDirectory: './coverage',
        include: ['src/**/*.ts', 'src/**/*.js'],
        exclude: [
          'node_modules/**',
          'coverage/**',
          'dist/**',
          '**/*.d.ts',
          '**/*.config.*',
          '**/tests/**',
          '**/*.test.ts',
          '**/migrations/**',
          'src/index.ts',
          'src/db/schema.ts',
        ],
        all: true,
        clean: true,
        skipFull: false,
      },
    },
  }
})