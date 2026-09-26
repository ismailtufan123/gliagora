import { postgresAdapter } from '@payloadcms/db-postgres'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'

import { Users } from './collections/Users'
import { migrations } from './migrations'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: {
    user: Users.slug,
    // Built-in avatar; Gravatar would send editors' email hashes to a third party.
    avatar: 'default',
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      titleSuffix: ' – Gliagora admin',
    },
  },
  collections: [Users],
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL ?? '',
    },
    // Schema changes only through committed migrations (PLAN §20), also in development.
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
    // Applied automatically when the production server starts (see src/instrumentation.ts).
    prodMigrations: migrations,
  }),
  secret: process.env.PAYLOAD_SECRET ?? '',
  // No usage data sent to Payload.
  telemetry: false,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
