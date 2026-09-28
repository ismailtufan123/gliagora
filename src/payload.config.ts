import { postgresAdapter } from '@payloadcms/db-postgres'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'

import { COLLECTIONS } from './collections'
import { Users } from './collections/Users'
import { GLOBALS } from './globals'
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
  // Each collection and global states who may do what through the API (src/lib/access.ts);
  // signed out, nothing (tests/e2e/access.spec.ts).
  collections: COLLECTIONS,
  globals: GLOBALS,
  jobs: {
    tasks: [RorImportTask, ...MAINTENANCE_TASKS],
    // Scheduled jobs run only where PAYLOAD_JOBS_AUTORUN is "true": on the production server
    // (deploy/compose.prod.yml), never in CI or local development (there: `pnpm jobs:run`). The
    // ticks and their queues are in src/jobs/autorun.ts.
    autoRun: () => autoRunCrons(),
    // The scheduler and `pnpm jobs:run` run the tasks through the local API; nobody runs them
    // through /api/payload-jobs/run or /handle-schedules (Payload's default: any signed-in user).
    access: { run: () => false },
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
  // The site's own address in production (https://gliagora.com, from SITE_DOMAIN in
  // deploy/compose.prod.yml): the only origin whose requests may use an editor's session cookie
  // (Payload adds it to its CSRF list), and the start of the links in Payload's own emails (a
  // password reset). Empty locally and in CI, so the app works on any port.
  serverURL: process.env.SERVER_URL ?? '',
  // No GraphQL: the admin and the site use REST and the local API only. Off, and without its two
  // route files, /api/graphql/ answers 404 without reading a query, so it cannot be used to guess
  // field names, to send many sign-ins in one request or to fill the log with errors.
  graphQL: { disable: true },
  // No usage data sent to Payload.
  telemetry: false,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
