import { type DigestSubscriber, type MemberDb, deletePendingLinks } from '@/lib/members/store'

import { type ListmonkClient, ListmonkError, type Subscriber, listmonkFromEnv } from './listmonk'
import { deletionTime, removeSubscribers, storedSubscriber } from './members'
import { logSubscriberDeletion, newsletterInUse, unlinkConsent } from './store'

// The newsletter part of deleting someone's data (M4b, D49; M2, D50; PLAN §13, §18.1): "Delete my
// account" (src/lib/members/account-deletion.ts) and a confirmed deletion request
// (src/lib/data-requests/confirm.ts) call it inside their transaction, before the member is
// deleted. Deleting an account for inactivity does not (PLAN §22.2, question 11): Glia Notes is not
// part of the account then, and keeps its own consent records and unsubscribe link.
//
// 1. The address's pending signup links end (also while listmonk is off).
// 2. The subscribers to delete are asked for: the one with the address, and the one the member's
//    row names, if it is still the member's (an address change the sync has not carried yet leaves
//    it with the old address; src/lib/newsletter/members.ts). A failure of listmonk throws: the
//    whole deletion is rolled back and says "try again" (a data-request link still works then).
//    So does listmonk not being configured while there may be something to erase (the member's
//    row names a subscriber, or the newsletter has records): an erasure never goes ahead blind.
//    Only before the newsletter was ever used (no consent records, no logged subscriber) is there
//    nothing to ask. Nothing is deleted in listmonk inside the transaction, which could not undo it.
// 3. Each is logged (`deletion_log`, `newsletter`, listmonk's ID), and the consent records of
//    those subscribers, and those of the member's stored subscriber when listmonk no longer has
//    it, are unlinked (listmonk's UUID and ID cleared, each record logged as
//    `consent-log`/`unlink`): they stay as evidence of the consent for their 3 years, without the
//    subscriber's number and code. That is not anonymisation: the request's own record (kept 2
//    years, with the address) and the logged rows share the erasure's time, and backups keep the
//    linked copies for their months. Records of subscriptions that had ended before (an earlier
//    unsubscribe, a member's earlier "off", a subscriber an address change replaced) name a
//    subscriber listmonk no longer holds and are not unlinked: the app keeps no link from an
//    address to them. A subscriber another member holds now is left alone, with its records. The
//    logged rows are dated after everything the lookups found (`deletionTime`), so a subscriber
//    made or confirmed while the erasure waited for the member's row is deleted again if the
//    deletion after the commit fails.
// After the commit the caller calls finishNewsletterErasure(), which deletes the subscribers in
// listmonk, best effort: `applyDeletionLog` deletes again, within 10 minutes, any listmonk still
// has. The address is then gone from listmonk.

/** What an erasure found: how many subscribers it removes, and their IDs in listmonk. */
export type NewsletterErasure = { removed: number; subscriberIds: number[] }

/** Whose newsletter to erase: an address, and the member whose data it is, if any. */
export type ErasureTarget = {
  email: string | null
  member?: { id: number; subscriber: DigestSubscriber | null } | null
}

/** Steps 1–3 above, in the caller's transaction (`db`). */
export async function eraseNewsletter(
  db: MemberDb,
  { email, member = null }: ErasureTarget,
  now: Date,
  listmonk: ListmonkClient | null = listmonkFromEnv(),
): Promise<NewsletterErasure> {
  if (email) await deletePendingLinks(db, 'newsletter', email)
  if (!listmonk) {
    if (member?.subscriber || (await newsletterInUse(db))) throw new ListmonkError('off')
    return { removed: 0, subscriberIds: [] }
  }

  const found: Subscriber[] = []
  const unlinked: string[] = []
  const byAddress = email ? await listmonk.findByEmail(email) : null
  if (byAddress) found.push(byAddress)
  const stored = member?.subscriber
    ? await storedSubscriber(db, listmonk, { id: member.id, digestSubscriber: member.subscriber })
    : null
  if (stored?.kind === 'mine' && stored.subscriber.id !== byAddress?.id) {
    found.push(stored.subscriber)
  } else if (stored?.kind === 'gone' && member?.subscriber) {
    unlinked.push(member.subscriber.uuid)
  }
  const at = deletionTime(now)
  for (const subscriber of found) {
    await logSubscriberDeletion(db, subscriber.id, at)
    unlinked.push(subscriber.uuid)
  }
  await unlinkConsent(db, unlinked, at)
  return { removed: found.length, subscriberIds: found.map((subscriber) => subscriber.id) }
}

/** After the commit: deletes the erased subscribers in listmonk (best effort; see above). */
export async function finishNewsletterErasure(
  subscriberIds: readonly number[],
  listmonk: ListmonkClient | null = listmonkFromEnv(),
): Promise<void> {
  if (!listmonk || subscriberIds.length === 0) return
  await removeSubscribers(listmonk, subscriberIds, 'Newsletter erasure')
}
