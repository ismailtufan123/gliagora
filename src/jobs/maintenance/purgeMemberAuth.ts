import type { Payload } from 'payload'

import { deleteExpiredMemberRows, memberDb } from '@/lib/members/store'

import { logCounts, maintenanceTask } from './task'

// Sign-in rows past their end (M4b, D49; the M4b design §9), hourly at :10: sessions after their 30
// days (a session is never extended), email links after their 15 minutes, 24 hours or, for a Glia
// Notes signup (M2, D50), 7 days (a used link is deleted at once; these are the ones nobody used,
// so an unconfirmed signup's address is gone within the hour after its 7 days), and, as a safety
// net, saved items whose job or member is gone (the jobs collection deletes a job's saved items itself, and deleteMember a
// member's). Nothing here is personal data anyone could still use, but nothing is kept longer than
// it serves either. In batches; a run that stops half-way is continued by the next.

const BATCH = 1000
const MAX_BATCHES = 20

export async function purgeMemberAuth(payload: Payload, now: Date) {
  const db = memberDb(payload)
  const counts = { sessions: 0, emailLinks: 0, savedItems: 0 }
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const done = await deleteExpiredMemberRows(db, now, BATCH)
    counts.sessions += done.sessions
    counts.emailLinks += done.emailLinks
    counts.savedItems += done.savedItems
    if (done.sessions < BATCH && done.emailLinks < BATCH && done.savedItems < BATCH) break
  }
  logCounts(payload, 'purgeMemberAuth', counts)
  return counts
}

export const PurgeMemberAuthTask = maintenanceTask({
  slug: 'purgeMemberAuth',
  label: 'Delete expired member sessions and email links (sign-in, Glia Notes signups)',
  cron: '10 * * * *',
  counts: ['sessions', 'emailLinks', 'savedItems'],
  run: purgeMemberAuth,
})
