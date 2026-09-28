import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { errorSummary } from '@/lib/errors'

import { inTransaction, logCounts, maintenanceTask } from './task'

// PLAN §2.5, §3.2, §6.3: a published job is marked Expired within an hour of the end of its
// deadline day. Its page already shows it as closed from that moment (listingState), so this
// brings the status, the admin and the checklist in line: the collection's hooks set `expiredAt`
// and clear "position still open" and "deadline confirmed", as when an editor closes it.

const BATCH = 50
const MAX_BATCHES = 20

/** Published jobs whose fixed deadline has ended by `now`, oldest deadline first. */
async function dueJobs(payload: Payload, now: Date, after: number): Promise<number[]> {
  const { docs } = await payload.find({
    collection: 'jobs',
    where: {
      and: [
        { status: { equals: 'published' } },
        { deadlineKind: { equals: 'fixed' } },
        { deadlineAt: { less_than_equal: now.toISOString() } },
        { id: { greater_than: after } },
      ],
    },
    select: {},
    sort: 'id',
    depth: 0,
    limit: BATCH,
    pagination: false,
  })
  return docs.map((doc) => doc.id)
}

/**
 * Marks one job as expired through the collection, in a transaction that first locks the job's
 * row and checks it again, so an editor who withdrew or corrected it a moment ago wins.
 */
async function expire(payload: Payload, id: number, now: Date): Promise<boolean> {
  return inTransaction(payload, async (req, db) => {
    const { rows } = await db.execute<{ id: number }>(
      sql`SELECT id FROM jobs WHERE id = ${id} AND status = 'published' AND deadline_kind = 'fixed' AND deadline_at <= ${now.toISOString()} FOR UPDATE`,
    )
    if (rows.length === 0) return false
    await payload.update({ collection: 'jobs', id, data: { status: 'expired' }, depth: 0, req })
    return true
  })
}

export async function expireListings(payload: Payload, now: Date) {
  const counts = { expired: 0, failed: 0 }
  let after = 0
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const ids = await dueJobs(payload, now, after)
    for (const id of ids) {
      try {
        if (await expire(payload, id, now)) counts.expired++
      } catch (error) {
        // A job the collection refuses to save stays for an editor; the admin shows why.
        counts.failed++
        payload.logger.warn(
          `expireListings: job ${id} could not be marked as expired (${errorSummary(error)})`,
        )
      }
    }
    if (ids.length < BATCH) break
    after = ids.at(-1) as number
  }
  logCounts(payload, 'expireListings', counts)
  return counts
}

export const ExpireListingsTask = maintenanceTask({
  slug: 'expireListings',
  label: 'Mark jobs whose deadline has passed as expired',
  // Every hour at minute 5: deadlines end on the hour, or at :15 or :30 in a few time zones, so a
  // job is marked at most 50 minutes after its deadline ends (rules.test.ts checks every zone).
  cron: '5 * * * *',
  counts: ['expired', 'failed'],
  run: expireListings,
})
