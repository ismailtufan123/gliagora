import config from '@payload-config'
import { getPayload } from 'payload'

/**
 * Connects Payload when the production server starts, which applies pending database migrations
 * (`prodMigrations` in payload.config.ts; the deploy script takes a backup first, PLAN §11.5).
 *
 * If the database is unreachable or a migration fails, the process exits. Docker then restarts the
 * container, so the app recovers by itself once PostgreSQL is available (for example after a server
 * reboot) instead of answering every request with an error.
 */
export async function connectOnStart(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return
  try {
    await getPayload({ config })
  } catch (error) {
    console.error(
      'Startup failed: cannot connect to the database or apply migrations.',
      error instanceof Error ? error.message : error,
    )
    process.exit(1)
  }
}
