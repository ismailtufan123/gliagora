import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { LIMIT_TABLE } from '@/lib/forms/rate-limit'
import { FORM_LIMIT_MAX_AGE_HOURS, formLimitCutoff } from '@/lib/retention/rules'

import { logCounts, maintenanceTask } from './task'

// D34, M4.5: the rows behind the form limits (hashed IP addresses and used spam-check answers)
// are deleted hourly once they are 23 hours old, so none is kept longer than 24 hours. The forms
// also delete rows older than 24 hours whenever one is sent (src/lib/forms/rate-limit.ts).

export async function purgeFormLimits(payload: Payload, now: Date) {
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const { rows } = await db.execute<{ n: number }>(
    sql`WITH gone AS (DELETE FROM ${sql.identifier(LIMIT_TABLE)} WHERE created_at < ${formLimitCutoff(now).toISOString()} RETURNING 1) SELECT count(*)::int AS n FROM gone`,
  )
  const counts = { deleted: Number(rows[0]?.n ?? 0) }
  logCounts(payload, 'purgeFormLimits', counts)
  return counts
}

export const PurgeFormLimitsTask = maintenanceTask({
  slug: 'purgeFormLimits',
  label: `Delete form-limit rows older than ${FORM_LIMIT_MAX_AGE_HOURS} hours`,
  // Every hour, with the expiry.
  cron: '5 * * * *',
  counts: ['deleted'],
  run: purgeFormLimits,
})
