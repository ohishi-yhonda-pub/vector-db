/**
 * Apply D1 migrations for tests
 */
import { applyD1Migrations, env } from 'cloudflare:test'

// Apply migrations - this can be safely run multiple times
// as the migration function only applies migrations that haven't been applied before
await applyD1Migrations((env as any).DB, (env as any).TEST_MIGRATIONS)