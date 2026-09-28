import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { emailLocale, reportAcknowledgement } from '@/lib/email/messages'
import { canSendEmail } from '@/lib/email/settings'
import { ACK_WINDOW_DAYS, ackCutoff } from '@/lib/retention/rules'

import { deliver } from './email'
import { logCounts, maintenanceTask } from './task'

// PLAN §3.2, §15.1 and the notice and takedown page ("an automatic email as soon as we receive
// your request"): a report sent with an email address gets an automatic acknowledgement within
// minutes, which names the page it is about and nothing else the person wrote. A request about
// personal rights is told that our editor answers within 24 hours and that we usually decide
// within 72 hours. `ackSentAt` is set once the mail server has accepted the message; a database
// trigger keeps it set against an editor's save that read the report a moment earlier (migration
// 20260928_052700). Reports received more than 7 days ago, or already closed, get none.

const BATCH = 50

type ReportRow = {
  id: number
  email: string
  kind: string
  item_url: string | null
  locale: string
}

export async function acknowledgeReports(payload: Payload, now: Date) {
  const counts = { sent: 0, failed: 0 }
  // Without a mail server nothing is read or sent (src/lib/email/settings.ts).
  if (!canSendEmail()) return counts
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const { rows } = await db.execute<ReportRow>(sql`
    SELECT id, email, kind, item_url, locale FROM reports
    WHERE email IS NOT NULL AND ack_sent_at IS NULL AND status <> 'closed'
      AND created_at >= ${ackCutoff(now).toISOString()}
    ORDER BY id
    LIMIT ${BATCH}`)
  for (const row of rows) {
    const message = reportAcknowledgement({
      locale: emailLocale(row.locale),
      kind: row.kind,
      itemPath: row.item_url,
    })
    const delivery = await deliver(payload, row.email, message, 'acknowledgeReports')
    if (delivery === 'sent') {
      await db.execute(
        sql`UPDATE reports SET ack_sent_at = ${new Date().toISOString()} WHERE id = ${row.id} AND ack_sent_at IS NULL`,
      )
      counts.sent++
    } else {
      counts.failed++
      // The mail server is not reachable: the next run tries again.
      if (delivery === 'unavailable') break
    }
  }
  logCounts(payload, 'acknowledgeReports', counts)
  return counts
}

export const AcknowledgeReportsTask = maintenanceTask({
  slug: 'acknowledgeReports',
  label: `Acknowledge reports by email (received within ${ACK_WINDOW_DAYS} days)`,
  cron: '*/5 * * * *',
  counts: ['sent', 'failed'],
  run: acknowledgeReports,
})
