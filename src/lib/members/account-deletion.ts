import type { Payload } from 'payload'

import { inTransaction } from '@/jobs/maintenance/task'
import { AUTOMATIC_ACTION } from '@/lib/data-requests/status'
import { errorSummary } from '@/lib/errors'
import { newReference } from '@/lib/forms/public-form'
import { eraseNewsletter, finishNewsletterErasure } from '@/lib/newsletter/erase'

import { SESSION_COOKIE, SIGN_IN_COOKIE, clearedCookie } from './cookies'
import { sameOrigin } from './origin'
import { outcomePath } from './outcome'
import { MEMBER_PATHS } from './paths'
import { forbidden, seeOther } from './responses'
import { type MemberRecord, deleteMember, findMember } from './store'

// "Delete my account" (M4b, D49; the M4b design §5, §7.6): the confirmation page
// (/en/account/privacy/delete/) says what is deleted and what stays, and its button posts to
// /en/account/privacy/delete/use/. The deletion is done at once, in one transaction:
// - the member's row is read again and locked (its address and Glia Notes subscriber as they are
//   now, not as the session read them);
// - the Glia Notes subscription of that address, and the subscriber the member's row names
//   (`eraseNewsletter`, M2: logged deletions in listmonk and unlinked consent records; listmonk
//   unreachable fails the whole deletion, which then says "try again");
// - a data request is recorded, closed: a deletion asked for in the account settings, deleted
//   automatically, with the account's address if it has one and whether a subscription ended (the
//   proof that the request was handled, kept 2 years like every closed request; the final email
//   goes out from it within minutes, `sendRequestEmails`);
// - the member with everything that is theirs (`deleteMember`: saved positions, sessions, links,
//   preferred subfields), which writes the deletion log, so the deletion is repeated if a backup is
//   ever restored.
// After the commit the subscribers are deleted in listmonk (best effort; the deletion log repeats
// it). Then this browser's cookies go and the browser is sent to "Your account has been deleted".

/**
 * The account was already gone when the transaction reached it (two presses at the same moment, or
 * a deletion elsewhere).
 */
class AccountGone extends Error {
  override name = 'AccountGone'
}

/**
 * Deletes `member`'s account at their request (see above). Returns false, changing nothing, when
 * the account no longer exists.
 */
export async function deleteOwnAccount(
  payload: Payload,
  member: MemberRecord,
  now: Date,
): Promise<boolean> {
  try {
    const erased = await inTransaction(payload, async (req, db) => {
      const locked = await findMember(db, { id: member.id }, { forUpdate: true })
      if (!locked) throw new AccountGone()
      const newsletter = await eraseNewsletter(
        db,
        { email: locked.email, member: { id: locked.id, subscriber: locked.digestSubscriber } },
        now,
      )
      await payload.create({
        collection: 'data-requests',
        data: {
          kind: 'deletion',
          source: 'account',
          email: locked.email,
          locale: 'en',
          status: 'closed',
          action: AUTOMATIC_ACTION,
          outcome: { accountDeleted: 1, newsletterRemoved: newsletter.removed > 0 ? 1 : 0 },
          // Received and closed at the same moment (the collection closes it as it saves).
          receivedAt: now.toISOString(),
        },
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (!(await deleteMember(db, locked.id, { reason: 'request' }, now))) throw new AccountGone()
      return newsletter
    })
    await finishNewsletterErasure(erased.subscriberIds)
    return true
  } catch (error) {
    if (error instanceof AccountGone) return false
    throw error
  }
}

/** What the deletion route reads and does (the route gives the real ones). */
export type AccountDeletionDeps = {
  now: Date
  env?: Record<string, string | undefined>
  /** The member of the request's session cookie, or null. */
  member(): Promise<MemberRecord | null>
  deleteAccount(member: MemberRecord): Promise<boolean>
}

const SIGNED_OUT = [clearedCookie(SESSION_COOKIE), clearedCookie(SIGN_IN_COOKIE)]

/**
 * POST `/en/account/privacy/delete/use/`: only from the site's own pages (`sameOrigin`), so no other
 * site can delete an account, and only while signed in. Ends at "Your account has been deleted"
 * without this browser's cookies, also when the account went while this request waited for it (two
 * presses at the same moment). A request that finds no session leads, without this browser's
 * cookies, to the privacy page, which says "You are not signed in. If you have just deleted your
 * account, it has been deleted." above the sign-in panel: it can only come from a confirmation page
 * shown while signed in, so it is a second press after the deletion (a double click, or Back and
 * the button again) or a session that ended meanwhile, which the server cannot tell apart. A
 * failure keeps everything as it was and leads back to the confirmation page with a reference.
 */
export async function handleAccountDeletion(
  request: Request,
  deps: AccountDeletionDeps,
): Promise<Response> {
  if (!sameOrigin(request.headers, deps.env)) return forbidden()
  try {
    const member = await deps.member()
    if (!member) {
      return seeOther(outcomePath(MEMBER_PATHS.privacy, { done: 'not-signed-in' }), SIGNED_OUT)
    }
    await deps.deleteAccount(member)
    return seeOther(MEMBER_PATHS.accountDeleted, SIGNED_OUT)
  } catch (error) {
    const reference = newReference()
    console.error(`Account deletion failed (reference ${reference}): ${errorSummary(error)}`)
    return seeOther(outcomePath(MEMBER_PATHS.privacyDelete, { error: 'failed', reference }))
  }
}
