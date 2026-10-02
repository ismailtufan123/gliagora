import type { Payload } from 'payload'

import { memberDb } from '@/lib/members/store'
import { listmonkFromEnv } from '@/lib/newsletter/listmonk'
import { checkMembersSubscribers, syncWaitingMembers } from '@/lib/newsletter/members'

import { logCounts, maintenanceTask } from './task'

// Members' Glia Notes in listmonk (M2, D50; PLAN §13; the rules are in
// src/lib/newsletter/members.ts). Only while listmonk is configured (LISTMONK_URL and
// LISTMONK_API_TOKEN): without it the choices stay stored and wait, and the first run once it is
// configured carries them all over.
// - `syncGliaNotes`, every 5 minutes (at :02, :07, …, apart from the other 5-minute tasks), carries
//   every waiting choice to listmonk and looks for newly proven addresses in Glia Notes; the
//   settings route and the address link also try once right after they stored a change.
// - `checkGliaNotesMembers`, daily at 06:00 UTC (09:00 in Türkiye), after the nightly tasks,
//   marks members whose subscriber listmonk no longer has, or has under another address, as
//   waiting again, so the next sync subscribes them anew or moves it back; one whose records show
//   that they withdrew the consent since is switched off instead.

export async function syncGliaNotes(payload: Payload, now: Date) {
  const listmonk = listmonkFromEnv()
  const counts = listmonk
    ? await syncWaitingMembers(memberDb(payload), listmonk, now, (line) =>
        payload.logger.warn(`syncGliaNotes: ${line}`),
      )
    : { subscribed: 0, unsubscribed: 0, adopted: 0, failed: 0 }
  logCounts(payload, 'syncGliaNotes', counts)
  return counts
}

export const SyncGliaNotesTask = maintenanceTask({
  slug: 'syncGliaNotes',
  label: "Carry members' Glia Notes choices to listmonk",
  cron: '2-57/5 * * * *',
  counts: ['subscribed', 'unsubscribed', 'adopted', 'failed'],
  run: syncGliaNotes,
})

export async function checkGliaNotesMembers(payload: Payload, now: Date) {
  const listmonk = listmonkFromEnv()
  const counts = listmonk
    ? await checkMembersSubscribers(memberDb(payload), listmonk, now, (line) =>
        payload.logger.warn(`checkGliaNotesMembers: ${line}`),
      )
    : { checked: 0, pending: 0, off: 0, failed: 0 }
  logCounts(payload, 'checkGliaNotesMembers', counts)
  return counts
}

export const CheckGliaNotesMembersTask = maintenanceTask({
  slug: 'checkGliaNotesMembers',
  label: "Find members' Glia Notes subscribers that listmonk no longer has",
  cron: '0 6 * * *',
  counts: ['checked', 'pending', 'off', 'failed'],
  run: checkGliaNotesMembers,
})
