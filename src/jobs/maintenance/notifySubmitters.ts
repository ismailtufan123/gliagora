import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
import type { SQL } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { jobPath } from '@/lib/detail-routes'
import { emailLocale, type SuggestionOutcome, suggestionEmail } from '@/lib/email/messages'
import { canSendEmail } from '@/lib/email/settings'
import { listingState } from '@/lib/jobs/deadline'
import type { JobStatus } from '@/lib/jobs/status'
import { REJECTION_REASONS, type RejectionReason } from '@/lib/review/status'

import { type Delivery, deliver } from './email'
import { inTransaction, logCounts, maintenanceTask } from './task'

// PLAN §3.2, §18.1: a person who gave an email address and ticked "Email me the outcome of this
// suggestion" gets one email once the suggestion is decided: "not added", with a plain reason, when
// its candidate was rejected or marked as a duplicate; "published", with the job's address, once
// the accepted candidate's job has been published. An accepted one waits until then; if the
// suggestion's personal data is deleted first (90 days after the decision), no email is sent.
// Spam gets no email: the address may not be the sender's. Suggestions of other kinds, decided by
// hand, get none either until their windows record an outcome (M8–M12). A "not added" email waits
// until the decision has stood for an hour, so an editor can reopen a mistaken rejection first
// (accepting is final). Each suggestion is read again under a lock just before its email goes out,
// so a decision reopened, an address cleared or a suggestion deleted meanwhile wins. `notifiedAt`
// is set only once the mail server has accepted the message; a database trigger keeps it set
// against a save that read the suggestion a moment earlier (migration 20260928_052700).

const PAGE = 200
/** At most this many suggestions are read in one run (in pages by ID)… */
const MAX_READ = 2_000
/** …and this many emails sent; the next run continues. */
const MAX_SENT = 50
/** How long a rejection or duplicate decision stands before its "not added" email goes out. */
export const NOT_ADDED_DELAY_MS = 60 * 60 * 1000

export type NotifyRow = {
  id: number
  email: string
  url: string
  locale: string
  candidate_status: string
  decision_reason: string | null
  job_slug: string | null
  job_short_id: string | null
  job_status: JobStatus | null
  job_published_at: Date | string | null
  job_deadline_kind: 'fixed' | 'rolling' | 'until-filled' | null
  job_deadline_at: Date | string | null
  job_expired_at: Date | string | null
  job_withdrawn_at: Date | string | null
}

const REASONS = new Set<string>(REJECTION_REASONS.map(({ value }) => value))

/** What to tell the person now, or null: nothing yet, or nothing at all (spam). */
export function suggestionOutcome(row: NotifyRow, now: Date): SuggestionOutcome | null {
  if (row.candidate_status === 'duplicate') return { kind: 'not-added', reason: 'duplicate' }
  if (row.candidate_status === 'rejected') {
    const reason = (REASONS.has(row.decision_reason ?? '') ? row.decision_reason : 'other') as
      RejectionReason | 'other'
    return reason === 'spam' ? null : { kind: 'not-added', reason }
  }
  if (row.candidate_status !== 'accepted' || !row.job_published_at) return null
  if (!row.job_slug || !row.job_short_id || !row.job_status || !row.job_deadline_kind) return null
  // Its page must be public: open, or closed with the notice (not yet answering 410).
  const state = listingState(
    {
      status: row.job_status,
      deadlineKind: row.job_deadline_kind,
      deadlineAt: row.job_deadline_at,
      expiredAt: row.job_expired_at,
      withdrawnAt: row.job_withdrawn_at,
    },
    now,
  )
  if (state !== 'open' && state !== 'closed') return null
  return { kind: 'published', jobPath: jobPath(row.job_slug, row.job_short_id) }
}

const COLUMNS = sql`s.id, s.email, s.url, s.locale,
  c.status AS candidate_status, c.decision_reason,
  j.slug AS job_slug, j.short_id AS job_short_id, j.status AS job_status,
  j.published_at AS job_published_at, j.deadline_kind AS job_deadline_kind,
  j.deadline_at AS job_deadline_at, j.expired_at AS job_expired_at,
  j.withdrawn_at AS job_withdrawn_at`

const FROM = sql`FROM submissions s
  JOIN candidates c ON c.id = s.candidate_id
  LEFT JOIN jobs j ON j.id = c.published_ref_id`

/** Decided suggestions with consent and an address, not told yet, that have an outcome to tell. */
function waiting(now: Date): SQL {
  const stood = new Date(now.getTime() - NOT_ADDED_DELAY_MS).toISOString()
  return sql`s.status = 'decided' AND s.consent_to_contact AND s.email IS NOT NULL
    AND s.notified_at IS NULL AND s.email_purge_at > ${now.toISOString()}
    AND (((c.status = 'duplicate'
          OR (c.status = 'rejected' AND c.decision_reason IS DISTINCT FROM 'spam'))
        AND c.decided_at <= ${stood})
      OR (c.status = 'accepted' AND j.published_at IS NOT NULL))`
}

async function page(payload: Payload, now: Date, after: number): Promise<NotifyRow[]> {
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const { rows } = await db.execute<NotifyRow>(sql`
    SELECT ${COLUMNS} ${FROM}
    WHERE s.id > ${after} AND ${waiting(now)}
    ORDER BY s.id
    LIMIT ${PAGE}`)
  return rows
}

/**
 * Reads the suggestion `id` again, locked, and emails its outcome if it still has one; records the
 * send in the same transaction. A save of the suggestion made meanwhile is seen here, and one that
 * comes now waits until the send is recorded; a suggestion being saved right now is left for the
 * next run.
 */
async function notifyOne(payload: Payload, now: Date, id: number): Promise<Delivery | 'waiting'> {
  return inTransaction(payload, async (_req, db) => {
    const { rows } = await db.execute<NotifyRow>(sql`
      SELECT ${COLUMNS} ${FROM}
      WHERE s.id = ${id} AND ${waiting(now)}
      FOR UPDATE OF s SKIP LOCKED`)
    const row = rows[0]
    const outcome = row ? suggestionOutcome(row, now) : null
    if (!row || !outcome) return 'waiting'
    const message = suggestionEmail({ locale: emailLocale(row.locale), url: row.url, outcome })
    const delivery = await deliver(payload, row.email, message, 'notifySubmitters')
    if (delivery === 'sent') {
      await db.execute(
        sql`UPDATE submissions SET notified_at = ${new Date().toISOString()} WHERE id = ${id} AND notified_at IS NULL`,
      )
    }
    return delivery
  })
}

export async function notifySubmitters(payload: Payload, now: Date) {
  const counts = { sent: 0, waiting: 0, failed: 0 }
  // Without a mail server nothing is read or sent (src/lib/email/settings.ts).
  if (!canSendEmail()) return counts
  let after = 0
  for (let read = 0; read < MAX_READ && counts.sent < MAX_SENT; read += PAGE) {
    const rows = await page(payload, now, after)
    for (const row of rows) {
      if (counts.sent >= MAX_SENT) break
      const delivery = suggestionOutcome(row, now)
        ? await notifyOne(payload, now, row.id)
        : 'waiting'
      if (delivery === 'sent') counts.sent++
      else if (delivery === 'waiting') counts.waiting++
      else {
        counts.failed++
        // The mail server is not reachable: the next run tries again.
        if (delivery === 'unavailable') {
          logCounts(payload, 'notifySubmitters', counts)
          return counts
        }
      }
    }
    if (rows.length < PAGE) break
    after = rows.at(-1)?.id as number
  }
  logCounts(payload, 'notifySubmitters', { sent: counts.sent, failed: counts.failed })
  return counts
}

export const NotifySubmittersTask = maintenanceTask({
  slug: 'notifySubmitters',
  label: 'Email people the outcome of their suggestions',
  cron: '*/15 * * * *',
  counts: ['sent', 'waiting', 'failed'],
  run: notifySubmitters,
})
