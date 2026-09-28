import { postgresAdapter } from '@payloadcms/db-postgres'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'

import { Candidates } from './collections/Candidates'
import { Countries } from './collections/Countries'
import { CountrySets } from './collections/CountrySets'
import { FormLimits } from './collections/FormLimits'
import { Institutions } from './collections/Institutions'
import { Jobs } from './collections/Jobs'
import { Reports } from './collections/Reports'
import { RetiredListings } from './collections/RetiredListings'
import { Submissions } from './collections/Submissions'
import { Terms } from './collections/Terms'
import { Users } from './collections/Users'
import { RorImport } from './globals/RorImport'
import { autoRunCrons } from './jobs/autorun'
import { MAINTENANCE_TASKS } from './jobs/maintenance'
import { RorImportTask } from './jobs/rorImport'
import { emailAdapter } from './lib/email/adapter'
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
    components: {
      // The review queue, jobs in review and the deadline tracker above the collections.
      beforeDashboard: ['/admin/ReviewDashboard#ReviewDashboard'],
    },
  },
  // The order of the admin menu: the daily work first (PLAN §6.5). FormLimits is hidden.
  collections: [
    Users,
    Candidates,
    Submissions,
    Reports,
    Jobs,
    RetiredListings,
    Terms,
    Countries,
    CountrySets,
    Institutions,
    FormLimits,
  ],
  globals: [RorImport],
  jobs: {
    tasks: [RorImportTask, ...MAINTENANCE_TASKS],
    // Scheduled jobs run only where PAYLOAD_JOBS_AUTORUN is "true": on the production server
    // (deploy/compose.prod.yml), never in CI or local development (there: `pnpm jobs:run`). The
    // ticks and their queues are in src/jobs/autorun.ts.
    autoRun: () => autoRunCrons(),
  },
  // Outgoing email through the SMTP server in SMTP_HOST (from M2 the Turkish mailbox's; Mailpit
  // locally); without it nothing is sent and no address is logged (src/lib/email/adapter.ts).
  email: emailAdapter(),
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
