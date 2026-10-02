import { errorSummary } from '@/lib/errors'
import type { MemberDb } from '@/lib/members/store'

import { LIST_PAGE_SIZE, type ListmonkClient, ListmonkError, type Subscriber } from './listmonk'
import {
  type OpenSubscription,
  hasLoggedSubscribers,
  latestConfirmations,
  latestLoggedDeletions,
  openSubscriptions,
  recordEndedSubscriptions,
} from './store'

// Keeping listmonk and the app's records of Glia Notes in step (M2, D50; PLAN §13, §18.1, §18.2),
// part of the task `applyDeletionLog`, every 10 minutes, while listmonk is configured. It reads the
// list of Glia Notes' subscribers whole, page by page (never with an SQL expression,
// src/lib/newsletter/listmonk.ts), and only when there is something to check: a logged deletion of
// a subscriber, or a subscription the consent log holds as running. Then:
// 1. Logged deletions (`deletion_log`, `newsletter`): every listed subscriber whose ID the log names
//    is deleted again (after a restore of listmonk's database brought it back, or when the
//    deletion right after its unsubscribe failed), if it was created no later than the latest
//    logged deletion of that ID (a restore also sets listmonk's IDs back, so a newer subscriber can
//    have a logged ID) and has not confirmed a signup since (an address that unsubscribed while its
//    deletion failed, then signed up again, keeps the same subscriber: it stays). Every listed
//    subscriber is checked on every run, so no logged row waits for another; the deletions follow
//    the reading (deleting while paging would move later subscribers onto pages already read), at
//    most MAX_DELETIONS a run (the rest in the next).
// 2. Subscriptions that ended outside the site: one whose newest consent record is a request or a
//    confirmation, while listmonk's list does not show its subscriber (by ID and UUID), is asked
//    for by its ID; only when listmonk answers that it has no such subscriber (or that the ID now
//    belongs to another UUID) does the site record the end (`unsubscribed`, source `listmonk`), so
//    the records are deleted 3 years later instead of never. That happens after a restore of
//    listmonk's database lost the subscriber, or when it was deleted in listmonk's admin (which
//    the runbook forbids: subscribers are deleted only through the site, which logs it). The
//    running subscriptions are read before the list, so a signup confirmed meanwhile is never
//    taken for an ended one (its subscriber existed before its records). Only after a complete
//    reading, and never when the list is empty while subscriptions are recorded (another listmonk
//    than the site's, say); at most MAX_ENDS lookups a run.
// listmonk unreachable (or answering unexpectedly) stops this for the run, counted as failed; the
// next run tries again. The log gets counts and error classes only.

/** Pages of LIST_PAGE_SIZE subscribers read per run: 200,000 subscribers, then a warning. */
const MAX_PAGES = 400
/** Subscribers deleted again per run; the rest wait for the next run. */
const MAX_DELETIONS = 1_000
/** Ended subscriptions looked up by ID per run; the rest wait for the next run. */
const MAX_ENDS = 500

export type ReconcileCounts = { deleted: number; ended: number; failed: number }

/** Listed subscribers whose logged deletion is due again (step 1 above). */
async function dueDeletions(db: MemberDb, subscribers: readonly Subscriber[]): Promise<number[]> {
  const logged = await latestLoggedDeletions(
    db,
    subscribers.map((subscriber) => subscriber.id),
  )
  const named = subscribers.filter((subscriber) => logged.has(subscriber.id))
  if (named.length === 0) return []
  const confirmed = await latestConfirmations(
    db,
    named.map((subscriber) => subscriber.uuid),
  )
  return named
    .filter((subscriber) => {
      const loggedAt = logged.get(subscriber.id)!
      // Created after the deletion (a restore set listmonk's IDs back), or of unknown age: kept.
      if (!subscriber.createdAt || subscriber.createdAt > loggedAt) return false
      // Confirmed again since the deletion was logged (the same subscriber, signed up again): kept.
      const confirmedAt = confirmed.get(subscriber.uuid)
      return !confirmedAt || confirmedAt <= loggedAt
    })
    .map((subscriber) => subscriber.id)
}

/** Steps 1 and 2 above. `warn` gets one line per problem: counts, IDs and error classes only. */
export async function reconcileSubscribers(
  db: MemberDb,
  listmonk: ListmonkClient,
  now: Date,
  warn: (line: string) => void,
): Promise<ReconcileCounts> {
  const counts: ReconcileCounts = { deleted: 0, ended: 0, failed: 0 }
  const logged = await hasLoggedSubscribers(db)
  // Read before the list: see step 2.
  const open = await openSubscriptions(db)
  if (!logged && open.length === 0) return counts

  const listed = new Map<number, string>()
  const due: number[] = []
  let complete = false
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { subscribers } = await listmonk.listPage(page)
      for (const subscriber of subscribers) listed.set(subscriber.id, subscriber.uuid)
      if (logged && subscribers.length > 0) due.push(...(await dueDeletions(db, subscribers)))
      if (subscribers.length < LIST_PAGE_SIZE) {
        complete = true
        break
      }
    }
  } catch (error) {
    counts.failed++
    warn(`listmonk's list of Glia Notes could not be read (${errorSummary(error)})`)
    return counts
  }
  if (!complete) {
    warn(
      `listmonk's list of Glia Notes was read up to ${MAX_PAGES * LIST_PAGE_SIZE} subscribers only; no subscription was ended`,
    )
  }

  for (const id of due.slice(0, MAX_DELETIONS)) {
    try {
      await listmonk.remove(id)
      counts.deleted++
    } catch (error) {
      counts.failed++
      warn(`subscriber ${id} could not be deleted again (${errorSummary(error)})`)
      if (!(error instanceof ListmonkError) || error.kind !== 'status') return counts
    }
  }
  if (due.length > MAX_DELETIONS) {
    warn(`${due.length - MAX_DELETIONS} subscribers are left to delete again in the next run`)
  }

  if (!complete) return counts
  if (listed.size === 0 && open.length > 0) {
    warn(
      `listmonk lists no subscriber of Glia Notes while ${open.length} subscriptions are recorded; none was ended`,
    )
    return counts
  }
  const missing = open.filter(({ id, uuid }) => listed.get(id) !== uuid)
  const ended: OpenSubscription[] = []
  for (const subscription of missing.slice(0, MAX_ENDS)) {
    let subscriber: Subscriber | null
    try {
      subscriber = await listmonk.findById(subscription.id)
    } catch (error) {
      // 403: listmonk has it outside Glia Notes, which is not an end the site can be sure of.
      if (error instanceof ListmonkError && error.kind === 'status' && error.status === 403) {
        continue
      }
      counts.failed++
      warn(`subscriber ${subscription.id} could not be looked up (${errorSummary(error)})`)
      break
    }
    if (!subscriber || subscriber.uuid !== subscription.uuid) ended.push(subscription)
  }
  counts.ended = await recordEndedSubscriptions(db, ended, now)
  return counts
}
