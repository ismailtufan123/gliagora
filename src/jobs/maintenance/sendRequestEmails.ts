import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { DataRequestSource } from '@/lib/data-requests/kinds'
import { deletionOutcome } from '@/lib/data-requests/outcome'
import { AUTOMATIC_ACTION } from '@/lib/data-requests/status'
import {
  type EmailText,
  accountDeletedEmail,
  dataDeletedEmail,
  emailLocale,
} from '@/lib/email/messages'
import { canSendEmail } from '@/lib/email/settings'
import { REQUEST_EMAIL_WINDOW_DAYS, requestEmailCutoff } from '@/lib/retention/rules'

import { deliver } from './email'
import { logCounts, maintenanceTask } from './task'

// The final email of a deletion the site did itself (M4b, D49; the M4b design §9): the data-request
// record is the outbox. "Delete my account" records its request closed, with the account's address
// if it had one (src/lib/members/account-deletion.ts), and so does a deletion confirmed with the
// link of the data-request form, with the address and counts of what it deleted
// (src/lib/data-requests/confirm.ts). This task emails that address once, within minutes, and sets
// `confirmationSentAt` only after the mail server accepted the message (a database trigger keeps it
// set against an editor's save that read the record a moment earlier, migration
// 20261001_201739_member_tasks). Only requests received within the last 7 days: after an outage of
// the mail server, or when email is first set up (M2), nobody is told of a deletion done long ago.
// Nothing is sent after a deletion for inactivity (no record is made: the warning told the member).

const BATCH = 50

/** What the task reads of a request. */
export type RequestRow = {
  id: number
  email: string
  source: DataRequestSource
  locale: string
  /** Counts of what was deleted (`suggestionsDeleted`, `accountDeleted`, …). */
  outcome: Record<string, unknown> | null
}

/** The final email of each kind of deletion the site does itself, by where its request came from. */
export const FINAL_EMAILS: Partial<Record<DataRequestSource, (row: RequestRow) => EmailText>> = {
  account: (row) => accountDeletedEmail({ locale: emailLocale(row.locale) }),
  // What was deleted, from the counts the confirmation stored, and which reports keep the address.
  form: (row) =>
    dataDeletedEmail({ locale: emailLocale(row.locale), outcome: deletionOutcome(row.outcome) }),
}

export async function sendRequestEmails(payload: Payload, now: Date) {
  const counts = { sent: 0, failed: 0 }
  // Without a mail server nothing is read or sent (src/lib/email/settings.ts).
  if (!canSendEmail()) return counts
  const sources = Object.keys(FINAL_EMAILS)
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const { rows } = await db.execute<RequestRow>(sql`
    SELECT id, email, source, locale, outcome FROM data_requests
    WHERE kind = 'deletion' AND status = 'closed' AND action = ${AUTOMATIC_ACTION}
      AND email IS NOT NULL AND confirmation_sent_at IS NULL
      AND received_at >= ${requestEmailCutoff(now).toISOString()}
      AND source IN (${sql.join(
        sources.map((source) => sql`${source}`),
        sql`, `,
      )})
    ORDER BY id
    LIMIT ${BATCH}`)
  for (const row of rows) {
    const message = FINAL_EMAILS[row.source]?.(row)
    if (!message) continue
    const delivery = await deliver(payload, row.email, message, 'sendRequestEmails')
    if (delivery === 'sent') {
      await db.execute(sql`
        UPDATE data_requests SET confirmation_sent_at = ${new Date().toISOString()}
        WHERE id = ${row.id} AND confirmation_sent_at IS NULL`)
      counts.sent++
    } else {
      counts.failed++
      // The mail server is not reachable: the next run tries again.
      if (delivery === 'unavailable') break
    }
  }
  logCounts(payload, 'sendRequestEmails', counts)
  return counts
}

export const SendRequestEmailsTask = maintenanceTask({
  slug: 'sendRequestEmails',
  label: `Email the confirmation of deletions done by the site (received within ${REQUEST_EMAIL_WINDOW_DAYS} days)`,
  cron: '*/5 * * * *',
  counts: ['sent', 'failed'],
  run: sendRequestEmails,
})
