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
import { deletionDueAt } from '@/lib/retention/rules'

import { type SendResult, sendOne } from './email'
import { logCounts, maintenanceTask } from './task'

// Member accounts nobody uses (M4b, D49; the M4b design §7.7; PLAN §18.1), every day at 05:30 UTC.
//
// - Warn: members with an email address not seen for 24 months get one email that names the day
//   their account will be deleted, 30 days on, with a plain link to the sign-in page. The 30 days
//   start only when the mail server accepted the warning. An address the server says does not
//   exist (5.1.x) is tried again 7 days later; refused again, it counts as unreachable and the 30
//   days start without a delivered warning. A reply that asks to try again later (4xx: throttling,
//   greylisting) or a server that cannot be reached stops the warnings of this run, and nobody
//   else is marked; any other refusal (a full mailbox, a policy) skips the member for this run.
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
 * What the mail server's answer to a warning means (the M4b design §7.7): `accepted`; the address
 * does not exist (`no-such-address`, enhanced status 5.1.x); `try-later`, a temporary refusal (any
 * 4xx reply) or a server that cannot be reached; `refused` for any other refusal.
 */
export type WarningDelivery = 'accepted' | 'no-such-address' | 'try-later' | 'refused'

export function warningDelivery(result: SendResult): WarningDelivery {
  if (result.status === 'sent') return 'accepted'
  if (result.status === 'unavailable') return 'try-later'
  const code = result.reply?.code
  if (code !== undefined && code >= 400 && code < 500) return 'try-later'
  if (result.reply?.enhanced?.startsWith('5.1.')) return 'no-such-address'
  return 'refused'
}

/** The reply code and enhanced status, or the error's class and code: never the reply's text. */
const replyOf = (result: SendResult) =>
  [result.reply?.code, result.reply?.enhanced].filter(Boolean).join(' ') ||
  result.error ||
  'no reply'

/** Sends the warnings of this run. Returns its counts. */
async function warn(payload: Payload, now: Date) {
  const db = memberDb(payload)
  const counts = { warned: 0, refusedOnce: 0, unreachable: 0, skipped: 0, stopped: 0 }
  const message = inactivityWarningEmail({ locale: 'en', deleteOn: deletionDueAt(now) })
  let after = 0
  for (let batch = 0; batch < MAX_WARN_BATCHES; batch++) {
    const members = await membersToWarn(db, now, { after, limit: WARN_BATCH })
    for (const member of members) {
      after = member.id
      const result = await sendOne(payload, member.email, message)
      const outcome = warningDelivery(result)
      if (outcome === 'accepted') {
        if (await markWarned(db, member.id, now)) counts.warned++
      } else if (outcome === 'no-such-address') {
        const marked = await markWarningRefused(db, member.id, now)
        if (marked === 'first') counts.refusedOnce++
        else if (marked === 'unreachable') counts.unreachable++
      } else if (outcome === 'try-later') {
        counts.stopped = 1
        payload.logger.warn(
          `cleanInactiveMembers: the mail server asked to try again later or could not be reached (${replyOf(result)}); no more warnings this run`,
        )
        return counts
      } else {
        counts.skipped++
        payload.logger.warn(
          `cleanInactiveMembers: the mail server refused a warning (${replyOf(result)}); tried again tomorrow`,
        )
      }
    }
    if (members.length < WARN_BATCH) break
  }
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
