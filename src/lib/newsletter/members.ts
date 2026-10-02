import { errorSummary } from '@/lib/errors'
import {
  type DigestHolder,
  type MemberDb,
  type MemberRecord,
  MemberStoreError,
  addressOfOtherMember,
  deletePendingLinks,
  digestHolders,
  lockPendingDigest,
  markDigestPending,
  pendingDigestMembers,
  storeDigestSync,
} from '@/lib/members/store'

import { LIST_PAGE_SIZE, type ListmonkClient, ListmonkError, type Subscriber } from './listmonk'
import {
  NewsletterStoreError,
  consentOnRecord,
  logSubscriberDeletion,
  recordConsent,
  recordEndedSubscriptions,
} from './store'

// Members' Glia Notes in listmonk (M2, D50; PLAN §13): a member chooses Glia Notes in the account's
// settings (src/lib/members/settings.ts), which stores the choice with its time and the consent
// text's version and leaves it waiting (`digest_synced_at` empty); an address change leaves it
// waiting too. The task `syncGliaNotes` (every 5 minutes, and once right after the settings stored
// a change) carries each waiting choice to listmonk, one member at a time, in a transaction that
// holds the member's row (`FOR UPDATE SKIP LOCKED`):
// - On (the member's verified address stands for the confirmation step of the form): the target is
//   listmonk's subscriber with the member's address if there is one, else the subscriber the row
//   names moved to the new address, else a new one; it is made a confirmed subscriber of Glia
//   Notes. A subscriber the row named that is no longer the target is deleted (a deletion-log row,
//   and an `unsubscribed` record, source `account`). Unless the target's subscription already has
//   its consent on record since the member's choice (a confirmation at that time or later, no
//   unsubscribe after it), the member's consent is recorded under it: `requested` and `confirmed`,
//   source `account`, the stored version, at the time of the choice. So an address change alone
//   (the same subscriber moved) records nothing new, and a member subscribed anew after a restore of
//   listmonk lost the subscriber gets the records under the new one.
// - Off: the subscriber with the member's address and the one the row names are deleted (each
//   logged, with an `unsubscribed` record, source `account`), and the address's pending signup
//   links end.
// The row then names the target (or nothing) and is synced. The deletions in listmonk follow the
// commit, best effort: the deletion log repeats a failed one within 10 minutes. listmonk is asked
// only by ID and address (src/lib/newsletter/listmonk.ts). A subscriber the row names is the
// member's only while its UUID is the stored one and its address is the member's or no other
// member's (another member who took the old address over holds it then).
//
// A run stops at the first failure that says listmonk cannot answer (unreachable, a timeout, an
// unreadable answer or a 5xx); a refusal for one member (a 4xx, an address listmonk holds outside
// Glia Notes) is counted and the run goes on; the member waits for the next run. The log gets
// member IDs, counts and error classes only.
//
// The nightly `checkGliaNotesMembers` finds members with Glia Notes on whose subscriber listmonk no
// longer has (a restore of listmonk's database lost it, or it was deleted in listmonk's admin): their
// choice waits for the sync again, which subscribes the address anew.
//
// Deleting an account for inactivity leaves Glia Notes alone (PLAN §22.2, question 11): the
// subscriber and its consent records stay, and every issue carries its unsubscribe link. Deleting it
// on purpose, or a confirmed deletion request, ends it (src/lib/newsletter/erase.ts).

/** Members synced per batch, and batches per run. */
const BATCH = 50
const MAX_BATCHES = 20

/** What one member's sync did. */
export type MemberSync = {
  /** On (subscribed to the target) or off. */
  outcome: 'on' | 'off'
  /** Subscribers it deleted (logged), to delete in listmonk after the commit. */
  removed: number[]
}

/**
 * Whether a failure stops the run: listmonk cannot answer now, or the database failed. A refusal
 * that concerns one member (a 4xx from listmonk, an address it holds outside Glia Notes, a stored
 * value the store refuses) does not.
 */
export function stopsRun(error: unknown): boolean {
  if (error instanceof ListmonkError) {
    if (error.kind === 'status') return (error.status ?? 0) >= 500
    return error.kind !== 'conflict'
  }
  if (error instanceof NewsletterStoreError || error instanceof MemberStoreError) {
    return error.code !== 'invalid'
  }
  return true
}

/**
 * What became of the subscriber a member's row names:
 * - `mine`: listmonk has it with the stored UUID, and its address is the member's or no other
 *   member's;
 * - `other`: listmonk has it, but another member has its address now (that member's sync or signup
 *   took the old address over), or holds it outside Glia Notes (403), which the app may not change;
 * - `gone`: listmonk has no subscriber with that ID, or the ID belongs to another UUID now (a
 *   restore of listmonk set its IDs back).
 */
export type StoredSubscriber =
  { kind: 'mine'; subscriber: Subscriber } | { kind: 'other' } | { kind: 'gone' }

/** The state of the subscriber the member's row names (null: it names none); see above. */
export async function storedSubscriber(
  db: MemberDb,
  listmonk: ListmonkClient,
  member: Pick<MemberRecord, 'id' | 'email' | 'digestSubscriber'>,
): Promise<StoredSubscriber | null> {
  const stored = member.digestSubscriber
  if (!stored) return null
  let found: Subscriber | null
  try {
    found = await listmonk.findById(stored.id)
  } catch (error) {
    if (error instanceof ListmonkError && error.kind === 'status' && error.status === 403) {
      return { kind: 'other' }
    }
    throw error
  }
  if (!found || found.uuid !== stored.uuid) return { kind: 'gone' }
  if (found.email !== member.email && (await addressOfOtherMember(db, found.email, member.id))) {
    return { kind: 'other' }
  }
  return { kind: 'mine', subscriber: found }
}

/** The member's own subscriber, from storedSubscriber(), or null. */
const mine = (state: StoredSubscriber | null) => (state?.kind === 'mine' ? state.subscriber : null)

/** Logs the deletion of these subscribers, with the end of their subscriptions (source `account`). */
async function endSubscribers(db: MemberDb, subscribers: readonly Subscriber[], now: Date) {
  for (const subscriber of subscribers) {
    await logSubscriberDeletion(db, subscriber.id, now)
  }
  await recordEndedSubscriptions(
    db,
    subscribers.map((subscriber) => ({ uuid: subscriber.uuid, id: subscriber.id })),
    now,
    'account',
  )
}

/** The member's choice "on", in the transaction holding the member's row (see above). */
async function syncOn(
  db: MemberDb,
  listmonk: ListmonkClient,
  member: MemberRecord & { email: string; digestChangedAt: Date },
  now: Date,
): Promise<MemberSync> {
  const version = member.digestConsentVersion
  if (!version) throw new NewsletterStoreError('invalid', 'version')
  const byAddress = await listmonk.findByEmail(member.email)
  const stored = mine(await storedSubscriber(db, listmonk, member))
  // The address changed and listmonk has nobody with the new one: the member's subscriber moves.
  if (!byAddress && stored && stored.email !== member.email) {
    await listmonk.changeEmail(stored.id, member.email)
  }
  // A confirmed subscriber of Glia Notes with the address: the one found or moved, or a new one.
  const target = await listmonk.subscribe(member.email)
  const replaced = stored && stored.id !== target.id ? [stored] : []
  await endSubscribers(db, replaced, now)
  if (!(await consentOnRecord(db, target.uuid, member.digestChangedAt))) {
    const named = { subscriberUuid: target.uuid, subscriberId: target.id }
    const consent = { consentVersion: version, source: 'account' as const }
    await recordConsent(
      db,
      [
        { ...named, ...consent, event: 'requested', at: member.digestChangedAt },
        { ...named, ...consent, event: 'confirmed', at: member.digestChangedAt },
      ],
      now,
    )
  }
  await storeDigestSync(db, member.id, { id: target.id, uuid: target.uuid }, now)
  return { outcome: 'on', removed: replaced.map((subscriber) => subscriber.id) }
}

/** The member's choice "off", in the transaction holding the member's row (see above). */
async function syncOff(
  db: MemberDb,
  listmonk: ListmonkClient,
  member: MemberRecord,
  now: Date,
): Promise<MemberSync> {
  const byAddress = member.email ? await listmonk.findByEmail(member.email) : null
  const stored = mine(await storedSubscriber(db, listmonk, member))
  const removed = [byAddress, stored].filter(
    (subscriber, index, all): subscriber is Subscriber =>
      subscriber !== null && all.findIndex((other) => other?.id === subscriber.id) === index,
  )
  await endSubscribers(db, removed, now)
  if (member.email) await deletePendingLinks(db, 'newsletter', member.email)
  await storeDigestSync(db, member.id, null, now)
  return { outcome: 'off', removed: removed.map((subscriber) => subscriber.id) }
}

/** Deletes these subscribers in listmonk, best effort (the deletion log repeats a failure). */
export async function removeSubscribers(
  listmonk: ListmonkClient,
  ids: readonly number[],
  label: string,
): Promise<void> {
  for (const id of ids) {
    try {
      await listmonk.remove(id)
    } catch (error) {
      console.error(
        `${label}: subscriber ${id} is deleted again by the deletion log (${errorSummary(error)})`,
      )
    }
  }
}

/**
 * Carries one member's waiting choice to listmonk (see above): null when it no longer waits, or
 * another transaction holds the member. Throws when listmonk or the database fail (nothing in the
 * app changed then; the member still waits).
 */
export async function syncMember(
  db: MemberDb,
  listmonk: ListmonkClient,
  memberId: number,
  now: Date,
): Promise<MemberSync | null> {
  const result = await db.transaction(async (tx) => {
    const member = await lockPendingDigest(tx, memberId)
    if (!member?.digestChangedAt) return null
    return member.digestOptIn && member.email
      ? syncOn(
          tx,
          listmonk,
          { ...member, email: member.email, digestChangedAt: member.digestChangedAt },
          now,
        )
      : syncOff(tx, listmonk, member, now)
  })
  if (result) await removeSubscribers(listmonk, result.removed, 'Glia Notes sync')
  return result
}

export type SyncCounts = { subscribed: number; unsubscribed: number; failed: number }

/** Every waiting choice (the task `syncGliaNotes`), in bounded batches; see above for failures. */
export async function syncWaitingMembers(
  db: MemberDb,
  listmonk: ListmonkClient,
  now: Date,
  warn: (line: string) => void,
): Promise<SyncCounts> {
  const counts: SyncCounts = { subscribed: 0, unsubscribed: 0, failed: 0 }
  let after = 0
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const ids = await pendingDigestMembers(db, { after, limit: BATCH })
    for (const id of ids) {
      try {
        const result = await syncMember(db, listmonk, id, now)
        if (result?.outcome === 'on') counts.subscribed++
        else if (result?.outcome === 'off') counts.unsubscribed++
      } catch (error) {
        counts.failed++
        warn(`member ${id} could not be synced (${errorSummary(error)})`)
        if (stopsRun(error)) return counts
      }
    }
    if (ids.length < BATCH) break
    after = ids.at(-1)!
  }
  return counts
}

/** Pages of LIST_PAGE_SIZE subscribers the nightly check reads: 200,000 subscribers. */
const MAX_PAGES = 400
/** Members' subscribers looked up by ID per run, when the list does not show them. */
const MAX_LOOKUPS = 2_000

export type CheckCounts = { checked: number; pending: number; failed: number }

/**
 * The nightly check (see above): every member with Glia Notes on and synced whose subscriber
 * listmonk's list of Glia Notes does not show, asked for by its ID, waits for the sync again when
 * listmonk answers that it has no such subscriber, or that the ID now belongs to another UUID. The
 * members are read before the list (a member synced meanwhile has a subscriber older than the
 * reading). Nothing is marked when the list could not be read whole, or is empty while members
 * hold subscribers (another listmonk than the site's, say).
 */
export async function checkMembersSubscribers(
  db: MemberDb,
  listmonk: ListmonkClient,
  now: Date,
  warn: (line: string) => void,
): Promise<CheckCounts> {
  const counts: CheckCounts = { checked: 0, pending: 0, failed: 0 }
  const holders: DigestHolder[] = []
  for (let after = 0; ;) {
    const page = await digestHolders(db, { after, limit: 1000 })
    holders.push(...page)
    if (page.length < 1000) break
    after = page.at(-1)!.memberId
  }
  if (holders.length === 0) return counts

  const listed = new Map<number, string>()
  try {
    let complete = false
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { subscribers } = await listmonk.listPage(page)
      for (const subscriber of subscribers) listed.set(subscriber.id, subscriber.uuid)
      if (subscribers.length < LIST_PAGE_SIZE) {
        complete = true
        break
      }
    }
    if (!complete) {
      warn(`listmonk's list was read up to ${MAX_PAGES * LIST_PAGE_SIZE} subscribers only`)
      return counts
    }
  } catch (error) {
    counts.failed++
    warn(`listmonk's list of Glia Notes could not be read (${errorSummary(error)})`)
    return counts
  }
  if (listed.size === 0) {
    warn(`listmonk lists no subscriber while ${holders.length} members hold one; none was marked`)
    return counts
  }

  counts.checked = holders.length
  const missing = holders.filter(({ subscriber }) => listed.get(subscriber.id) !== subscriber.uuid)
  for (const holder of missing.slice(0, MAX_LOOKUPS)) {
    let found: Subscriber | null
    try {
      found = await listmonk.findById(holder.subscriber.id)
    } catch (error) {
      // 403: listmonk has it outside Glia Notes, which the app may not change.
      if (error instanceof ListmonkError && error.kind === 'status' && error.status === 403) {
        continue
      }
      counts.failed++
      warn(
        `the subscriber of member ${holder.memberId} could not be looked up (${errorSummary(error)})`,
      )
      break
    }
    if (found && found.uuid === holder.subscriber.uuid) continue
    if (await markDigestPending(db, holder, now)) counts.pending++
  }
  if (missing.length > MAX_LOOKUPS) {
    warn(`${missing.length - MAX_LOOKUPS} members are left to check in the next run`)
  }
  return counts
}
