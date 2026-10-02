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
//   every waiting choice to listmonk; the settings route also tries once right after it stored a
//   change.
// - `checkGliaNotesMembers`, nightly after the other nightly tasks, marks members whose subscriber
//   listmonk no longer has as waiting again, so the next sync subscribes them anew.

export async function syncGliaNotes(payload: Payload, now: Date) {
  const listmonk = listmonkFromEnv()
  const counts = listmonk
    ? await syncWaitingMembers(memberDb(payload), listmonk, now, (line) =>
        payload.logger.warn(`syncGliaNotes: ${line}`),
      )
    : { subscribed: 0, unsubscribed: 0, failed: 0 }
  logCounts(payload, 'syncGliaNotes', counts)
  return counts
}

export const SyncGliaNotesTask = maintenanceTask({
  slug: 'syncGliaNotes',
  label: "Carry members' Glia Notes choices to listmonk",
  cron: '2-57/5 * * * *',
  counts: ['subscribed', 'unsubscribed', 'failed'],
  run: syncGliaNotes,
})

export async function checkGliaNotesMembers(payload: Payload, now: Date) {
  const listmonk = listmonkFromEnv()
  const counts = listmonk
    ? await checkMembersSubscribers(memberDb(payload), listmonk, now, (line) =>
        payload.logger.warn(`checkGliaNotesMembers: ${line}`),
      )
    : { checked: 0, pending: 0, failed: 0 }
  logCounts(payload, 'checkGliaNotesMembers', counts)
  return counts
}

export const CheckGliaNotesMembersTask = maintenanceTask({
  slug: 'checkGliaNotesMembers',
  label: "Find members' Glia Notes subscribers that listmonk no longer has",
  cron: '0 6 * * *',
  counts: ['checked', 'pending', 'failed'],
  run: checkGliaNotesMembers,
})
