import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@payload-config': fileURLToPath(new URL('./src/payload.config.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Tests that need a database run with `pnpm test:db` (vitest.db.config.mts).
    exclude: [...configDefaults.exclude, '**/*.db.test.ts'],
  },
})
