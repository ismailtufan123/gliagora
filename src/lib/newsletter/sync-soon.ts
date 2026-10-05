import { after } from 'next/server'

import { errorSummary } from '@/lib/errors'
import type { MemberDb } from '@/lib/members/store'

import { listmonkFromEnv } from './listmonk'
import { syncMember } from './members'

/**
 * One attempt to sync a member's Glia Notes (src/lib/newsletter/members.ts) after the answer is
 * sent (`after`), for a route that has just stored a change the sync carries: a choice in the
 * settings, a verified address, a new account with an address. Best effort: a failure is logged
 * by class, and the task `syncGliaNotes` carries the change within 5 minutes; nothing while
 * listmonk is not configured. Only in a route handler or Server Action.
 */
export function syncSoon(db: MemberDb, memberId: number, label: string): void {
  after(async () => {
    const listmonk = listmonkFromEnv()
    if (!listmonk) return
    try {
      await syncMember(db, listmonk, memberId, new Date())
    } catch (error) {
      console.error(`Glia Notes sync after ${label} failed: ${errorSummary(error)}`)
    }
  })
}
