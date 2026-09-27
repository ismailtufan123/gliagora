import { postgresAdapter } from '@payloadcms/db-postgres'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'

import { Countries } from './collections/Countries'
import { CountrySets } from './collections/CountrySets'
import { Terms } from './collections/Terms'
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
  collections: [Users, Terms, Countries, CountrySets],
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
  // Localized fields (taxonomy labels, country names) have an English and a Turkish value; an
  // empty Turkish value falls back to English (PLAN §12).
  localization: {
    locales: [
      { code: 'en', label: 'English' },
      { code: 'tr', label: 'Türkçe' },
    ],
    defaultLocale: 'en',
    fallback: true,
  },
  secret: process.env.PAYLOAD_SECRET ?? '',
  // No usage data sent to Payload.
  telemetry: false,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
