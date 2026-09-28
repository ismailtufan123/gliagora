import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Tests against a real PostgreSQL (`pnpm test:db`): files named *.db.test.ts. Those under `src/`
// create their own scratch database and role and drop them afterwards. Those under
// `tests/integration/` (the scheduled tasks, M4.7) share one scratch database, which
// tests/integration/global-setup.ts creates, migrates and drops again; the email tests also start
// a throwaway Mailpit container with Docker, and are skipped without Docker. They need a
// connection that may create databases: TEST_DATABASE_URL, or locally the DATABASE_URL of .env
// (the development superuser; `docker compose up -d db`). Fake data only.
if (existsSync('.env')) process.loadEnvFile('.env')
process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@payload-config': fileURLToPath(new URL('./src/payload.config.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.db.test.ts', 'tests/integration/**/*.db.test.ts'],
    globalSetup: ['tests/integration/global-setup.ts'],
    setupFiles: ['tests/integration/setup-env.ts'],
    // One file at a time, each in a process of its own: the integration tests share their scratch
    // database.
    pool: 'forks',
    isolate: true,
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
