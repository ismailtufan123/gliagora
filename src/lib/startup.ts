import config from '@payload-config'
import { getPayload } from 'payload'

import { releaseInterruptedImports } from '@/jobs/rorImport'
import { altchaKey } from '@/lib/forms/altcha'

/**
 * Connects Payload when the production server starts, which applies pending database migrations
 * (`prodMigrations` in payload.config.ts; the deploy script takes a backup first, PLAN §11.5).
 *
 * It also starts the scheduled jobs (`cron: true`; they run only where PAYLOAD_JOBS_AUTORUN is
 * "true", see payload.config.ts), after releasing an import that a restart cut off.
 *
 * If the database is unreachable or a migration fails, the process exits. Docker then restarts the
 * container, so the app recovers by itself once PostgreSQL is available (for example after a server
 * reboot) instead of answering every request with an error.
 *
 * A missing ALTCHA_HMAC_KEY only disables the "Suggest a listing" form (it says it is temporarily
 * unavailable), so the site starts anyway, with a warning in the log.
 */
export async function connectOnStart(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return
  if (!altchaKey()) {
    console.warn(
      'ALTCHA_HMAC_KEY is missing or too short: the "Suggest a listing" form is unavailable.',
    )
  }
  try {
    const payload = await getPayload({ config })
    await releaseInterruptedImports(payload)
    await getPayload({ config, cron: true })
  } catch (error) {
    console.error(
      'Startup failed: cannot connect to the database or apply migrations.',
      error instanceof Error ? error.message : error,
    )
    process.exit(1)
  }
}
