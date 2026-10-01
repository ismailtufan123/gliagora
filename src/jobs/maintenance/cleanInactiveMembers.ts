import type { Payload } from 'payload'

import { inactivityWarningEmail } from '@/lib/email/messages'
import { canSendEmail } from '@/lib/email/settings'
import {
  deleteMember,
  markWarned,
  markWarningRefused,
  memberDb,
  membersToDelete,
  membersToWarn,
} from '@/lib/members/store'
import { warningDeadlineDay } from '@/lib/retention/rules'

import { type SendResult, sendOne } from './email'
import { logCounts, maintenanceTask } from './task'

// Member accounts nobody uses (M4b, D49; the M4b design §7.7; PLAN §18.1), every day at 05:30 UTC.
//
// - Warn: members with an email address not seen for 24 months get one email that names a day,
//   with a plain link to the sign-in page: signing in before that day keeps the account, in any
//   time zone (`warningDeadlineDay`: the account is deleted 30 days after the warning, which is
//   after the end of the day before the named day even at UTC−12). The 30 days start only when the
//   mail server accepted the warning.
// - An address the server says does not exist (a refused recipient: RCPT TO answered with 5.1.0,
//   5.1.1, 5.1.2, 5.1.3, 5.1.6 or 5.1.10) is tried again 7 days later; refused again, it counts as
//   unreachable and the 30 days start without a delivered warning. Such a refusal counts only in a
//   run in which the server accepted some other warning, which shows that it takes our messages
//   (a server that refuses the sender may answer every recipient alike); otherwise the member is
//   tried again the next day.
// - A refused sender (MAIL FROM, or the sender statuses 5.1.7 and 5.1.8), a reply that asks to try
//   again later (4xx: throttling, greylisting) or a server that cannot be reached stops the
//   warnings of this run, and nobody else is marked: it would happen to every message. Any other
//   refusal (a full mailbox, a policy) skips the member for this run.
//   Without a mail server nobody is warned, so no member with an address is ever deleted.
// - Delete: warned members not seen since, 30 days after the warning; members without an address
//   (nobody to warn) 24 months and 30 days after their last activity. Each is deleted by
//   deleteMember, which checks the rule again under the row's lock (a member who signed in a moment
//   ago keeps the account) and writes the deletion log. No data-request record and no final email.
//
// Signing in, or any signed-in request, cancels a warning (src/lib/members/session.ts). The logs
// hold counts and SMTP reply codes only, never an address.

/** At most this many warnings a run, in batches: a backlog is spread over days. */
const WARN_BATCH = 50
const MAX_WARN_BATCHES = 4
const DELETE_BATCH = 100
const MAX_DELETE_BATCHES = 20

/**
 * The enhanced statuses (RFC 3463) that say a recipient does not exist, when the server gives them
 * in answer to RCPT TO: 5.1.1 bad mailbox, 5.1.2 bad domain, 5.1.3 bad address syntax, 5.1.6
 * mailbox moved, 5.1.10 null MX, and 5.1.0, which Mailpit and others give for an unknown mailbox
 * (Postfix also gives it for a sender it refuses only at RCPT TO: hence the rule in `warn`).
 */
const NO_SUCH_RECIPIENT = /^5\.1\.(?:0|1|2|3|6|10)$/

/** Statuses about the sender's address (5.1.7 bad sender's mailbox, 5.1.8 bad sender's domain). */
const SENDER_REFUSED = /^[45]\.1\.[78]$/

/**
 * What the mail server's answer to a warning means (the M4b design §7.7): `accepted`; the
 * recipient does not exist (`no-such-address`: RCPT TO refused with one of the statuses above);
 * `try-later`, a temporary refusal (any 4xx reply), a refused sender (at MAIL FROM, or 5.1.7 or
 * 5.1.8 at any step) or a server that cannot be reached, which would happen to every message of
 * the run; `refused` for any other refusal, about this message only.
 */
export type WarningDelivery = 'accepted' | 'no-such-address' | 'try-later' | 'refused'

export function warningDelivery(result: SendResult): WarningDelivery {
  if (result.status === 'sent') return 'accepted'
  if (result.status === 'unavailable') return 'try-later'
  const { code, enhanced, command } = result.reply ?? {}
  if (code !== undefined && code >= 400 && code < 500) return 'try-later'
  if (command === 'MAIL FROM' || (enhanced && SENDER_REFUSED.test(enhanced))) return 'try-later'
  if (command === 'RCPT TO' && enhanced && NO_SUCH_RECIPIENT.test(enhanced)) {
    return 'no-such-address'
  }
  return 'refused'
}

/** The reply code, enhanced status and command, or the error's class and code: never the text. */
const replyOf = (result: SendResult) =>
  [result.reply?.code, result.reply?.enhanced, result.reply?.command].filter(Boolean).join(' ') ||
  result.error ||
  'no reply'

/** Why a run stops (`try-later`), for its log line. */
const stopReason = (result: SendResult) => {
  if (result.status === 'unavailable') return 'could not be reached'
  const code = result.reply?.code
  return code !== undefined && code >= 400 && code < 500
    ? 'asked to try again later'
    : 'refused our sender'
}

const warnings = (count: number) => (count === 1 ? '1 warning' : `${count} warnings`)

/** Sends the warnings of this run. Returns its counts. */
async function warn(payload: Payload, now: Date) {
  const db = memberDb(payload)
  const counts = { warned: 0, refusedOnce: 0, unreachable: 0, skipped: 0, stopped: 0 }
  const message = inactivityWarningEmail({ locale: 'en', day: warningDeadlineDay(now) })
  /** Whether the server accepted any warning of this run (see `noSuchAddress`). */
  let anyAccepted = false
  /** Members whose address the server said does not exist, and the replies, for the log. */
  const noSuchAddress: number[] = []
  const replies = new Set<string>()
  let after = 0
  sending: for (let batch = 0; batch < MAX_WARN_BATCHES; batch++) {
    const members = await membersToWarn(db, now, { after, limit: WARN_BATCH })
    for (const member of members) {
      after = member.id
      const result = await sendOne(payload, member.email, message)
      const outcome = warningDelivery(result)
      if (outcome === 'accepted') {
        anyAccepted = true
        if (await markWarned(db, member.id, now)) counts.warned++
      } else if (outcome === 'no-such-address') {
        noSuchAddress.push(member.id)
        replies.add(replyOf(result))
      } else if (outcome === 'try-later') {
        counts.stopped = 1
        payload.logger.warn(
          `cleanInactiveMembers: the mail server ${stopReason(result)} (${replyOf(result)}); no more warnings this run`,
        )
        break sending
      } else {
        counts.skipped++
        payload.logger.warn(
          `cleanInactiveMembers: the mail server refused a warning (${replyOf(result)}); tried again tomorrow`,
        )
      }
    }
    if (members.length < WARN_BATCH) break
  }
  if (noSuchAddress.length === 0) return counts
  const codes = [...replies].join(', ')
  // An address the server says does not exist counts only when it took another warning of this
  // run: a server that refuses our sender may refuse every recipient with a status like 5.1.0.
  if (!anyAccepted) {
    payload.logger.warn(
      `cleanInactiveMembers: the mail server refused ${warnings(noSuchAddress.length)} as addresses that do not exist (${codes}) and accepted none; nobody marked, tried again tomorrow`,
    )
    return counts
  }
  for (const id of noSuchAddress) {
    const marked = await markWarningRefused(db, id, now)
    if (marked === 'first') counts.refusedOnce++
    else if (marked === 'unreachable') counts.unreachable++
  }
  // The countdown can start without a delivered warning: say so beyond the counts.
  payload.logger.warn(
    `cleanInactiveMembers: the mail server refused ${warnings(noSuchAddress.length)} as addresses that do not exist (${codes}): ${counts.refusedOnce} tried again in 7 days, ${counts.unreachable} counted as unreachable (their 30 days start without a delivered warning)`,
  )
  return counts
}

/** Deletes the members due by `condition`. Returns how many were deleted and how many kept. */
async function remove(payload: Payload, condition: 'warned' | 'without-email', now: Date) {
  const db = memberDb(payload)
  const counts = { deleted: 0, kept: 0 }
  let after = 0
  for (let batch = 0; batch < MAX_DELETE_BATCHES; batch++) {
    const ids = await membersToDelete(db, condition, now, { after, limit: DELETE_BATCH })
    for (const id of ids) {
      const deleted = await deleteMember(db, id, { reason: 'inactivity', condition }, now)
      if (deleted) counts.deleted++
      else counts.kept++
    }
    if (ids.length < DELETE_BATCH) break
    after = ids.at(-1) as number
  }
  return counts
}

export async function cleanInactiveMembers(payload: Payload, now: Date) {
  const warned = canSendEmail()
    ? await warn(payload, now)
    : { warned: 0, refusedOnce: 0, unreachable: 0, skipped: 0, stopped: 0 }
  const afterWarning = await remove(payload, 'warned', now)
  const withoutEmail = await remove(payload, 'without-email', now)
  const counts = {
    ...warned,
    deleted: afterWarning.deleted,
    deletedWithoutEmail: withoutEmail.deleted,
    kept: afterWarning.kept + withoutEmail.kept,
  }
  logCounts(payload, 'cleanInactiveMembers', counts)
  return counts
}

export const CleanInactiveMembersTask = maintenanceTask({
  slug: 'cleanInactiveMembers',
  label: 'Warn members inactive for 24 months, and delete their accounts 30 days later',
  // Every day at 05:30 UTC, after the retention task (04:15) and the job places (04:45).
  cron: '30 5 * * *',
  counts: [
    'warned',
    'refusedOnce',
    'unreachable',
    'skipped',
    'stopped',
    'deleted',
    'deletedWithoutEmail',
    'kept',
  ],
  run: cleanInactiveMembers,
})
