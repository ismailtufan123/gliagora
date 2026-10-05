import { errorSummary } from '@/lib/errors'
import {
  type DigestHolder,
  type MemberDb,
  type MemberRecord,
  MemberStoreError,
  adoptDigest,
  choiceWaits,
  clearAdoptCheck,
  deletePendingLinks,
  digestHolders,
  endDigestByWithdrawal,
  lockPendingDigest,
  markDigestPending,
  pendingDigestMembers,
  storeDigestSync,
  subscriberHeldByOther,
} from '@/lib/members/store'

import { LIST_PAGE_SIZE, type ListmonkClient, ListmonkError, type Subscriber } from './listmonk'
import {
  NewsletterStoreError,
  consentOnRecord,
  logSubscriberDeletion,
  recordConsent,
  recordEndedSubscriptions,
  runningConsent,
  withdrawalOf,
} from './store'

// Members' Glia Notes in listmonk (M2, D50; PLAN §13): a member chooses Glia Notes in the account's
// settings (src/lib/members/settings.ts), which stores the choice with its time, the consent text's
// version and where it was given, and leaves it waiting (`digest_synced_at` empty); an address
// change leaves it waiting too. The task `syncGliaNotes` (every 5 minutes, and once right after the
// settings stored a change or an address was verified) carries each waiting choice to listmonk, one
// member at a time, in a transaction that holds the member's row (`FOR UPDATE SKIP LOCKED`):
// - On (the member's verified address stands for the confirmation step of the form): the target is
//   listmonk's subscriber with the member's address if there is one, else the subscriber the row
//   names moved to the new address, else a new one; it is made a confirmed subscriber of Glia
//   Notes. A subscriber the row named that is no longer the target is deleted (a deletion-log row,
//   and an `unsubscribed` record, source `account`). Unless the target's subscription already has
//   its consent on record since the member's choice (a confirmation at that time or later, no
//   unsubscribe after it), the member's consent is recorded under it: `requested` and `confirmed`,
//   with the stored version and where and when the member gave it (the account's settings at the
//   time of the choice, or the newsletter page's form and confirmation). So an address change alone
//   (the same subscriber moved) records nothing new, and a member subscribed anew after a restore of
//   listmonk lost the subscriber gets the records under the new one.
// - Off: the subscriber with the member's address and the one the row names are deleted (each
//   logged, with an `unsubscribed` record, source `account`), and the address's pending signup
//   links end.
// - Withdrawn: the subscriber the row names is gone from listmonk, and the consent records show
//   that the member withdrew it on the site after the choice the row holds (its newest record an
//   unsubscribe from the unsubscribe page, one click or the account): a restore of the main database
//   brought back an older row. The member's Glia Notes is switched off, with no listmonk call and no
//   new record; nobody is subscribed again after withdrawing.
// The row then names the target (or nothing) and is synced. The deletions in listmonk follow the
// commit, best effort: the deletion log repeats a failed one within 10 minutes; its rows are dated
// after everything the transaction read (`at`), so a subscriber made or confirmed while the sync
// waited for the row is never spared as "newer than the deletion". listmonk is asked only by ID and
// address (src/lib/newsletter/listmonk.ts). A subscriber the row names is the member's unless
// another member's row names it (that member's sync or signup took it over) or listmonk holds it
// outside Glia Notes.
//
// A newly proven address (a new account with an address, a verified change, Google's address
// added; `digest_adopt_check_at`) is looked for once: a member with Glia Notes off and no
// subscriber whose address listmonk has in Glia Notes, with its consent on record and no other
// member naming it, takes that subscription over (Glia Notes on, with that subscriber and the
// newsletter page's version, source and times; no new records). So a subscription made on the
// newsletter page before the account existed is the account's, and the account page, the export
// and the deletion agree with listmonk.
//
// A run stops at the first failure that says listmonk cannot answer (unreachable, a timeout, an
// unreadable answer or a 5xx); a refusal for one member (a 4xx, an address listmonk holds outside
// Glia Notes) is counted and the run goes on; the member waits for the next run. The log gets
// member IDs, counts and error classes only.
//
// The daily `checkGliaNotesMembers` (06:00 UTC) finds members with Glia Notes on whose subscriber
// listmonk no longer has (a restore of listmonk's database lost it, or it was deleted in listmonk's
// admin) or has under another address (a restore of listmonk's database from before an address
// change): their choice waits for the sync again, which subscribes the address anew or moves the
// subscriber back. One whose consent was withdrawn on the site since the choice is switched off
// instead (see "Withdrawn" above). A member the deletion log names (a restore brought the account
// back) is left to `applyDeletionLog`, by the check and by the sync.
//
// Deleting an account for inactivity leaves Glia Notes alone (PLAN §22.2, question 11): the
// subscriber and its consent records stay, and every issue carries its unsubscribe link. Deleting it
// on purpose, or a confirmed deletion request, ends it (src/lib/newsletter/erase.ts).

/** Members synced per batch, and batches per run. */
const BATCH = 50
const MAX_BATCHES = 20

/** What one member's sync did. */
export type MemberSync = {
  /**
   * On (subscribed to the target), off, withdrawn (switched off: the records show a withdrawal),
   * adopted (the address's subscription taken over) or checked (the address looked for, nothing to
   * take over).
   */
  outcome: 'on' | 'off' | 'withdrawn' | 'adopted' | 'checked'
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
 * - `mine`: listmonk has it with the stored UUID, and no other member's row names it;
 * - `other`: another member's row names it (that member's sync or signup took it over, after the
 *   old address passed to them), or listmonk holds it outside Glia Notes (403), which the app may
 *   not change;
 * - `gone`: listmonk has no subscriber with that ID, or the ID belongs to another UUID now (a
 *   restore of listmonk set its IDs back).
 */
export type StoredSubscriber =
  { kind: 'mine'; subscriber: Subscriber } | { kind: 'other' } | { kind: 'gone' }

/** The state of the subscriber the member's row names (null: it names none); see above. */
export async function storedSubscriber(
  db: MemberDb,
  listmonk: ListmonkClient,
  member: Pick<MemberRecord, 'id' | 'digestSubscriber'>,
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
  if (await subscriberHeldByOther(db, stored, member.id)) return { kind: 'other' }
  return { kind: 'mine', subscriber: found }
}

/** The member's own subscriber, from storedSubscriber(), or null. */
const mine = (state: StoredSubscriber | null) => (state?.kind === 'mine' ? state.subscriber : null)

/**
 * The time a deletion is logged at: not before `now`, and not before this moment, when everything
 * the caller's transaction has read (subscribers listmonk made, records it found) exists already.
 * The deletion log spares a subscriber made or confirmed after the logged time, so a time from
 * before the transaction waited for a row could spare one it has just found.
 */
export const deletionTime = (now: Date) => new Date(Math.max(now.getTime(), Date.now()))

/** Logs the deletion of these subscribers, with the end of their subscriptions (source `account`). */
async function endSubscribers(db: MemberDb, subscribers: readonly Subscriber[], at: Date) {
  for (const subscriber of subscribers) {
    await logSubscriberDeletion(db, subscriber.id, at)
  }
  await recordEndedSubscriptions(
    db,
    subscribers.map((subscriber) => ({ uuid: subscriber.uuid, id: subscriber.id })),
    at,
    'account',
  )
}

/**
 * When the records show that the member withdrew the consent of the subscriber the row names, at
 * or after the choice the row holds (see "Withdrawn" above), or null.
 */
async function withdrawnSinceChoice(
  db: MemberDb,
  subscriber: { uuid: string },
  choiceAt: Date | null,
): Promise<Date | null> {
  const withdrawn = await withdrawalOf(db, subscriber.uuid)
  if (!withdrawn) return null
  return choiceAt === null || withdrawn >= choiceAt ? withdrawn : null
}

type Waiting = MemberRecord & { email: string; digestChangedAt: Date }

/** The member's choice "on", in the transaction holding the member's row (see above). */
async function syncOn(
  db: MemberDb,
  listmonk: ListmonkClient,
  member: Waiting,
  now: Date,
): Promise<MemberSync> {
  const version = member.digestConsentVersion
  if (!version) throw new NewsletterStoreError('invalid', 'version')
  const state = await storedSubscriber(db, listmonk, member)
  if (state?.kind === 'gone' && member.digestSubscriber) {
    const withdrawn = await withdrawnSinceChoice(
      db,
      member.digestSubscriber,
      member.digestChangedAt,
    )
    if (withdrawn) {
      await endDigestByWithdrawal(
        db,
        { memberId: member.id, subscriber: member.digestSubscriber },
        withdrawn,
        now,
      )
      return { outcome: 'withdrawn', removed: [] }
    }
  }
  const byAddress = await listmonk.findByEmail(member.email)
  const stored = mine(state)
  // The address changed and listmonk has nobody with the new one: the member's subscriber moves.
  if (!byAddress && stored && stored.email !== member.email) {
    await listmonk.changeEmail(stored.id, member.email)
  }
  // A confirmed subscriber of Glia Notes with the address: the one found or moved, or a new one.
  const target = await listmonk.subscribe(member.email)
  const replaced = stored && stored.id !== target.id ? [stored] : []
  await endSubscribers(db, replaced, deletionTime(now))
  if (!(await consentOnRecord(db, target.uuid, member.digestChangedAt))) {
    const named = { subscriberUuid: target.uuid, subscriberId: target.id }
    // Where and when the member gave the consent: the account's settings at the time of the
    // choice, or the newsletter page (the form's time, then the emailed link's).
    const source = member.digestConsentSource ?? 'account'
    const consent = { consentVersion: version, source }
    const requestedAt = member.digestRequestedAt ?? member.digestChangedAt
    await recordConsent(
      db,
      [
        { ...named, ...consent, event: 'requested', at: requestedAt },
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
  await endSubscribers(db, removed, deletionTime(now))
  if (member.email) await deletePendingLinks(db, 'newsletter', member.email)
  await storeDigestSync(db, member.id, null, now)
  return { outcome: 'off', removed: removed.map((subscriber) => subscriber.id) }
}

/**
 * A newly proven address, looked for once (see above), in the transaction holding the member's
 * row: the subscription listmonk has for it in Glia Notes is the account's when the member has
 * Glia Notes off and no subscriber, no other member names it, and its consent is on record.
 */
async function adoptCheck(
  db: MemberDb,
  listmonk: ListmonkClient,
  member: MemberRecord,
  now: Date,
): Promise<MemberSync> {
  const checked: MemberSync = { outcome: 'checked', removed: [] }
  if (member.digestOptIn || member.digestSubscriber || !member.email) {
    await clearAdoptCheck(db, member.id, now)
    return checked
  }
  const found = await listmonk.findByEmail(member.email)
  const consent =
    found && !(await subscriberHeldByOther(db, found, member.id))
      ? await runningConsent(db, found.uuid)
      : null
  if (
    found &&
    consent &&
    (consent.source === 'newsletter-form' || consent.source === 'account') &&
    (await adoptDigest(
      db,
      member.id,
      member.email,
      { id: found.id, uuid: found.uuid },
      { ...consent, source: consent.source },
      now,
    ))
  ) {
    return { outcome: 'adopted', removed: [] }
  }
  await clearAdoptCheck(db, member.id, now)
  return checked
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
 * Carries one member's waiting choice to listmonk, or looks for a newly proven address (see
 * above): null when nothing waits any more, or another transaction holds the member. Throws when
 * listmonk or the database fail (nothing in the app changed then; the member still waits).
 */
export async function syncMember(
  db: MemberDb,
  listmonk: ListmonkClient,
  memberId: number,
  now: Date,
): Promise<MemberSync | null> {
  const result = await db.transaction(async (tx) => {
    const member = await lockPendingDigest(tx, memberId)
    if (!member) return null
    if (!choiceWaits(member)) return adoptCheck(tx, listmonk, member, now)
    return member.digestOptIn && member.email && member.digestChangedAt
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

export type SyncCounts = {
  subscribed: number
  unsubscribed: number
  adopted: number
  failed: number
}

/** Every waiting choice (the task `syncGliaNotes`), in bounded batches; see above for failures. */
export async function syncWaitingMembers(
  db: MemberDb,
  listmonk: ListmonkClient,
  now: Date,
  warn: (line: string) => void,
): Promise<SyncCounts> {
  const counts: SyncCounts = { subscribed: 0, unsubscribed: 0, adopted: 0, failed: 0 }
  let after = 0
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const ids = await pendingDigestMembers(db, { after, limit: BATCH })
    for (const id of ids) {
      try {
        const result = await syncMember(db, listmonk, id, now)
        if (result?.outcome === 'on') counts.subscribed++
        else if (result?.outcome === 'off' || result?.outcome === 'withdrawn') counts.unsubscribed++
        else if (result?.outcome === 'adopted') counts.adopted++
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

/** Pages of LIST_PAGE_SIZE subscribers the daily check reads: 200,000 subscribers. */
const MAX_PAGES = 400
/** Members' subscribers looked up by ID per run, when the list does not show them. */
const MAX_LOOKUPS = 2_000

export type CheckCounts = { checked: number; pending: number; off: number; failed: number }

/**
 * The daily check (see above), in three steps:
 * - every member with Glia Notes on and synced whose subscriber listmonk's list of Glia Notes
 *   shows under another address waits for the sync again, which moves it back;
 * - one whose subscriber the list does not show is asked for by its ID: when listmonk answers that
 *   it has no such subscriber, or that the ID now belongs to another UUID, the member waits for the
 *   sync again, which subscribes the address anew, unless the records show a withdrawal since the
 *   member's choice: Glia Notes is switched off then;
 * - a subscriber listmonk holds outside Glia Notes (403) is left alone.
 * The members are read before the list (a member synced meanwhile has a subscriber older than the
 * reading). Nothing is marked when the list could not be read whole, or is empty while members
 * hold subscribers (another listmonk than the site's, say).
 */
export async function checkMembersSubscribers(
  db: MemberDb,
  listmonk: ListmonkClient,
  now: Date,
  warn: (line: string) => void,
): Promise<CheckCounts> {
  const counts: CheckCounts = { checked: 0, pending: 0, off: 0, failed: 0 }
  const holders: DigestHolder[] = []
  for (let after = 0; ;) {
    const page = await digestHolders(db, { after, limit: 1000 })
    holders.push(...page)
    if (page.length < 1000) break
    after = page.at(-1)!.memberId
  }
  if (holders.length === 0) return counts

  const listed = new Map<number, { uuid: string; email: string }>()
  try {
    let complete = false
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { subscribers } = await listmonk.listPage(page)
      for (const { id, uuid, email } of subscribers) listed.set(id, { uuid, email })
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
  /** Listed (or found) with the stored UUID, under another address than the member's. */
  const elsewhere = (holder: DigestHolder, email: string) =>
    holder.email !== null && email !== holder.email
  for (const holder of holders) {
    const shown = listed.get(holder.subscriber.id)
    if (shown?.uuid === holder.subscriber.uuid && elsewhere(holder, shown.email)) {
      if (await markDigestPending(db, holder, now)) counts.pending++
    }
  }
  const missing = holders.filter(
    ({ subscriber }) => listed.get(subscriber.id)?.uuid !== subscriber.uuid,
  )
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
    if (found && found.uuid === holder.subscriber.uuid) {
      if (elsewhere(holder, found.email) && (await markDigestPending(db, holder, now))) {
        counts.pending++
      }
      continue
    }
    const withdrawn = await withdrawnSinceChoice(db, holder.subscriber, holder.changedAt)
    if (withdrawn) {
      if (await endDigestByWithdrawal(db, holder, withdrawn, now)) counts.off++
    } else if (await markDigestPending(db, holder, now)) {
      counts.pending++
    }
  }
  if (missing.length > MAX_LOOKUPS) {
    warn(`${missing.length - MAX_LOOKUPS} members are left to check in the next run`)
  }
  return counts
}
