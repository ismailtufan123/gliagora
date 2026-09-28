import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Tests against a real PostgreSQL (`pnpm test:db`): files named *.db.test.ts. They create their
// own scratch database and role and drop them afterwards, so they need a connection that may do
// that: TEST_DATABASE_URL, or locally the DATABASE_URL of .env (the development superuser).
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
    include: ['src/**/*.db.test.ts'],
    testTimeout: 30_000,
  },
})
