import { type DigestSubscriber, type MemberDb, deletePendingLinks } from '@/lib/members/store'

import { type ListmonkClient, type Subscriber, listmonkFromEnv } from './listmonk'
import { removeSubscribers, storedSubscriber } from './members'
import { logSubscriberDeletion, unlinkConsent } from './store'

// The newsletter part of deleting someone's data (M4b, D49; M2, D50; PLAN §13, §18.1): "Delete my
// account" (src/lib/members/account-deletion.ts) and a confirmed deletion request
// (src/lib/data-requests/confirm.ts) call it inside their transaction, before the member is
// deleted. Deleting an account for inactivity does not (PLAN §22.2, question 11): Glia Notes is not
// part of the account then, and keeps its own consent records and unsubscribe link.
//
// 1. The address's pending signup links end (also while listmonk is off).
// 2. While listmonk is configured, the subscribers to delete are asked for: the one with the
//    address, and the one the member's row names, if it is still the member's (an address change
//    the sync has not carried yet leaves it with the old address; src/lib/newsletter/members.ts). A
//    failure of listmonk throws: the whole deletion is rolled back and says "try again" (a
//    data-request link still works then). Nothing is deleted in listmonk inside the transaction,
//    which could not undo it.
// 3. Each is logged (`deletion_log`, `newsletter`, listmonk's ID), and their consent records, and
//    those of the member's stored subscriber when listmonk no longer has it, are unlinked (UUID and
//    ID cleared, each logged as `consent-log`/`unlink`): they stay as evidence of the consent for
//    their 3 years, but no longer lead to the person. A subscriber another member holds now is left
//    alone, with its records.
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
  if (!listmonk) return { removed: 0, subscriberIds: [] }

  const found: Subscriber[] = []
  const unlinked: string[] = []
  const byAddress = email ? await listmonk.findByEmail(email) : null
  if (byAddress) found.push(byAddress)
  const stored = member?.subscriber
    ? await storedSubscriber(db, listmonk, {
        id: member.id,
        email,
        digestSubscriber: member.subscriber,
      })
    : null
  if (stored?.kind === 'mine' && stored.subscriber.id !== byAddress?.id) {
    found.push(stored.subscriber)
  } else if (stored?.kind === 'gone' && member?.subscriber) {
    unlinked.push(member.subscriber.uuid)
  }
  for (const subscriber of found) {
    await logSubscriberDeletion(db, subscriber.id, now)
    unlinked.push(subscriber.uuid)
  }
  await unlinkConsent(db, unlinked, now)
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
