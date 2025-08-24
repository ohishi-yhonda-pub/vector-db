import { applyD1Migrations, env } from 'cloudflare:test'
declare module "cloudflare:test" {
    // Controls the type of `import("cloudflare:test").env`
    interface ProvidedEnv extends Env {
        TEST_MIGRATIONS: D1Migration[]; // Defined in `vitest.config.mts`
    }
}
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
