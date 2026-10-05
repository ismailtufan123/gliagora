import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { errorSummary } from '@/lib/errors'
import { deleteMember, memberDb, revivedMembers } from '@/lib/members/store'
import { listmonkFromEnv } from '@/lib/newsletter/listmonk'
import { reconcileSubscribers } from '@/lib/newsletter/reconcile'
import { unlinkLoggedConsent } from '@/lib/newsletter/store'
import { REAPPLY } from '@/lib/retention/context'

import { logCounts, maintenanceTask } from './task'

// Deletions survive a restore (M4b, D49; the M4b design §7.9). Restoring a backup brings back what
// was deleted after it was taken; the restore carries the deletion log over
// (deploy/backup/restore.sh), and this task, every 10 minutes, repeats each logged deletion whose
// record exists again:
// - a member, through deleteMember (`reapply`: not logged a second time);
// - a suggestion or a report, through the local API, as editors delete them (the `logDeletions()`
//   hooks skip these, marked REAPPLY);
// - a report's email address cleared on a data request (`clear-email`), cleared again. In SQL: the
//   report's fields from the form are fixed for every save (fixedFieldHooks), and reports keep no
//   versions, so the one statement clears the only copy;
// - a subscriber of Glia Notes who unsubscribed (M2, D50; `newsletter`, listmonk's subscriber ID),
//   deleted again in listmonk: after a restore of listmonk's database, or when the deletion right
//   after the unsubscribe failed. Only while listmonk is configured:
//   src/lib/newsletter/reconcile.ts reads listmonk's list of Glia Notes' subscribers whole and
//   checks every one against the log on every run, and also records the end of subscriptions
//   listmonk no longer has (their consent records then keep their 3 years). listmonk unreachable
//   stops this part for the run (counted as failed); the next run tries again. The subscribers a
//   member's "off" or an erasure deleted are logged the same way;
// - a consent record unlinked from its subscriber by an erasure (`consent-log`, `unlink`; M2),
//   unlinked again if it names a subscriber again (a restore that did not carry the consent log
//   over). Also while listmonk is off.
// Only a record created no later than the logged deletion: a restore also sets the ID sequences
// back, so a record made since can have a logged ID, and it stays. Normally there is nothing to do;
// the selections join the log with the records, so a run without a restore reads no record. The
// log says counts only.

const BATCH = 100
const MAX_BATCHES = 20

type Logged = { id: number; target_id: number; at: Date | string }

const drizzle = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

/**
 * Log rows of `collection` and `action` whose record exists again and was created no later than
 * the logged time, in batches by the log row's ID.
 */
async function eachLogged(
  payload: Payload,
  collection: 'submissions' | 'reports',
  action: 'delete' | 'clear-email',
  work: (row: { targetId: number; at: string }) => Promise<boolean>,
): Promise<{ done: number; failed: number }> {
  const table = sql.raw(collection === 'submissions' ? 'submissions' : 'reports')
  const holds = action === 'clear-email' ? sql` AND t.email IS NOT NULL` : sql``
  const counts = { done: 0, failed: 0 }
  let after = 0
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { rows } = await drizzle(payload).execute<Logged>(sql`
      SELECT l.id, l.target_id, l.at
      FROM deletion_log l JOIN ${table} t ON t.id = l.target_id AND t.created_at <= l.at${holds}
      WHERE l.id > ${after} AND l.target_collection = ${collection} AND l.action = ${action}
      ORDER BY l.id
      LIMIT ${BATCH}`)
    for (const row of rows) {
      const at = new Date(row.at).toISOString()
      try {
        if (await work({ targetId: Number(row.target_id), at })) counts.done++
      } catch (error) {
        counts.failed++
        payload.logger.warn(
          `applyDeletionLog: ${collection} ${row.target_id} could not be ${
            action === 'delete' ? 'deleted' : 'cleared'
          } again (${errorSummary(error)})`,
        )
      }
    }
    if (rows.length < BATCH) break
    after = Number(rows.at(-1)!.id)
  }
  return counts
}

/** Deletes a suggestion or report again through the local API, if it was created by `at`. */
async function deleteAgain(
  payload: Payload,
  collection: 'submissions' | 'reports',
  id: number,
  at: string,
): Promise<boolean> {
  const { docs, errors } = await payload.delete({
    collection,
    where: { and: [{ id: { equals: id } }, { createdAt: { less_than_equal: at } }] },
    depth: 0,
    context: { reapply: REAPPLY },
  })
  if (errors.length > 0) throw new Error(`${collection} not deleted`)
  return docs.length > 0
}

export async function applyDeletionLog(payload: Payload, now: Date) {
  const db = memberDb(payload)
  const counts = {
    members: 0,
    suggestions: 0,
    reports: 0,
    reportAddresses: 0,
    subscribers: 0,
    subscriptionsEnded: 0,
    consentUnlinked: 0,
    failed: 0,
  }

  let after = 0
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const revived = await revivedMembers(db, { after, limit: BATCH })
    for (const row of revived) {
      try {
        const deleted = await deleteMember(
          db,
          row.memberId,
          { reason: 'reapply', loggedAt: row.loggedAt },
          now,
        )
        if (deleted) counts.members++
      } catch (error) {
        counts.failed++
        payload.logger.warn(
          `applyDeletionLog: member ${row.memberId} could not be deleted again (${errorSummary(error)})`,
        )
      }
    }
    if (revived.length < BATCH) break
    after = revived.at(-1)!.logId
  }

  const suggestions = await eachLogged(payload, 'submissions', 'delete', ({ targetId, at }) =>
    deleteAgain(payload, 'submissions', targetId, at),
  )
  const reports = await eachLogged(payload, 'reports', 'delete', ({ targetId, at }) =>
    deleteAgain(payload, 'reports', targetId, at),
  )
  const addresses = await eachLogged(
    payload,
    'reports',
    'clear-email',
    async ({ targetId, at }) => {
      const { rows } = await drizzle(payload).execute<{ id: number }>(sql`
      UPDATE reports SET email = NULL, updated_at = ${now.toISOString()}
      WHERE id = ${targetId} AND created_at <= ${at} AND email IS NOT NULL
      RETURNING id`)
      return rows.length > 0
    },
  )
  counts.suggestions = suggestions.done
  counts.reports = reports.done
  counts.reportAddresses = addresses.done
  counts.failed += suggestions.failed + reports.failed + addresses.failed
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const unlinked = await unlinkLoggedConsent(db, BATCH)
    counts.consentUnlinked += unlinked
    if (unlinked < BATCH) break
  }
  const listmonk = listmonkFromEnv()
  if (listmonk) {
    const subscribers = await reconcileSubscribers(db, listmonk, now, (line) =>
      payload.logger.warn(`applyDeletionLog: ${line}`),
    )
    counts.subscribers = subscribers.deleted
    counts.subscriptionsEnded = subscribers.ended
    counts.failed += subscribers.failed
  }
  logCounts(payload, 'applyDeletionLog', counts)
  return counts
}

export const ApplyDeletionLogTask = maintenanceTask({
  slug: 'applyDeletionLog',
  label: 'Repeat logged deletions of personal data after a restore',
  cron: '*/10 * * * *',
  counts: [
    'members',
    'suggestions',
    'reports',
    'reportAddresses',
    'subscribers',
    'subscriptionsEnded',
    'consentUnlinked',
    'failed',
  ],
  run: applyDeletionLog,
})
