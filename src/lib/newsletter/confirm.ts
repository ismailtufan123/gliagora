import type { Payload } from 'payload'

import { type TransactionDb, inTransaction } from '@/jobs/maintenance/task'
import type { Locale } from '@/i18n/routing'
import { type Delivery, deliverWhileWaiting } from '@/lib/email/deliver'
import { newsletterWelcomeEmail } from '@/lib/email/messages'
import { errorSummary } from '@/lib/errors'
import { newReference } from '@/lib/forms/public-form'
import { sameOrigin } from '@/lib/members/origin'
import { outcomePath } from '@/lib/members/outcome'
import { forbidden, formValue, readForm, seeOther } from '@/lib/members/responses'
import {
  type EmailTokenRecord,
  consumeEmailToken,
  deletePendingLinks,
  joinDigestBySignup,
  releaseDigestSubscriber,
} from '@/lib/members/store'
import { isToken } from '@/lib/members/tokens'

import { type PendingSignup, pendingSignupSchema } from './consent'
import { type ListmonkClient, ListmonkError, type Subscriber } from './listmonk'
import { NEWSLETTER_PATHS, oneClickUrl, unsubscribePageUrl } from './paths'
import { recordConsent } from './store'

// Confirming a Glia Notes signup (M2, D50; PLAN §9.10, §13): the button on the page the emailed
// link opens posts to /en/newsletter/confirm/use/. In one transaction:
// 1. the link is consumed for its own purpose (one statement: of two presses, one wins);
// 2. listmonk makes the address a confirmed subscriber of Glia Notes (the only call to listmonk,
//    and the first time listmonk sees the address). listmonk commits this in its own database at
//    once, before the app's transaction does: if its answer is lost (a timeout, a reset
//    connection, an unreadable or 5xx answer), it may have acted all the same, so the call is made
//    once more, which then finds the address and adds it to the list again (never a second
//    subscriber);
// 3. the consent records are written with the subscriber's UUID and ID: `requested` at the time the
//    form was sent (kept in the link, also for a link from "Send it again"), `confirmed` now, both
//    with the consent text's version the form showed and the source `newsletter-form`;
// 4. the address's other pending signup links stop working;
// 5. a member with that address has Glia Notes on from now, with the form's consent version, the
//    form's time and the subscriber, synced (`joinDigestBySignup`; the form's records stand for the
//    member's); when listmonk had the address already, a member whose row still names that
//    subscriber under another address (an address change the sync has not carried yet) no longer
//    holds it (`releaseDigestSubscriber`), so that member's sync never moves this signup away.
// A failure in 1–2 changes nothing in the app and the link still works ("try again"). A failure in
// 3–4 rolls the app's side back; if step 2 made a new subscriber, it is deleted again in listmonk
// before the transaction ends (best effort, logged by class), so listmonk keeps no subscriber
// without its consent records; an address listmonk had before keeps its subscriber. What remains is
// a failure of the commit itself (the database may then have committed or not, so nothing is
// undone), or a lost answer from listmonk followed by a failure of step 2's second call: listmonk
// may then hold the address without consent records until the person uses the link again (it
// still works). After the commit the welcome email goes out, best effort: its failure is logged by
// class and the subscription stands. The same address may confirm again (a second signup):
// listmonk keeps one subscriber, and the new consent records sit beside the old ones.

/** What a newsletter link asks for, or null if the link is not one (or cannot be read). */
export function pendingSignup(link: EmailTokenRecord | null): PendingSignup | null {
  if (!link || link.purpose !== 'newsletter') return null
  const parsed = pendingSignupSchema.safeParse(link.requestData)
  return parsed.success ? parsed.data : null
}

/** A confirmed signup: where the welcome email goes, and the subscriber it names. */
export type Confirmed = { email: string; locale: Locale; id: number; uuid: string }

/** A link whose row the site wrote itself, yet cannot read: nothing is done, nothing changes. */
class UnreadableSignup extends Error {
  override name = 'UnreadableSignup'
}

/** Whether a failed call may still have been carried out by listmonk (its answer was lost). */
function mayHaveActed(error: unknown): boolean {
  if (!(error instanceof ListmonkError)) return false
  if (error.kind === 'status') return (error.status ?? 0) >= 500
  return error.kind === 'timeout' || error.kind === 'unreachable' || error.kind === 'invalid'
}

/** Step 2 above: subscribes the address, once more after a lost answer. */
async function subscribeConfirmed(
  listmonk: ListmonkClient,
  email: string,
): Promise<Subscriber & { created: boolean }> {
  try {
    return await listmonk.subscribe(email)
  } catch (error) {
    if (!mayHaveActed(error)) throw error
    console.error(
      `Newsletter confirmation: listmonk's answer was lost, asking again (${errorSummary(error)})`,
    )
    return listmonk.subscribe(email)
  }
}

/** Steps 1–4 above, in the caller's transaction (`db`). Null for an unknown, used or expired link. */
export async function confirmInTransaction(
  db: TransactionDb,
  listmonk: ListmonkClient,
  token: string | null | undefined,
  now: Date,
): Promise<Confirmed | null> {
  const link = await consumeEmailToken(db, token, 'newsletter', now)
  if (!link) return null
  const pending = pendingSignup(link)
  if (!pending) throw new UnreadableSignup()
  const subscriber = await subscribeConfirmed(listmonk, link.email)
  const named = { subscriberUuid: subscriber.uuid, subscriberId: subscriber.id }
  try {
    await recordConsent(
      db,
      [
        {
          ...named,
          event: 'requested',
          consentVersion: pending.version,
          source: pending.source,
          at: new Date(pending.requestedAt),
        },
        {
          ...named,
          event: 'confirmed',
          consentVersion: pending.version,
          source: pending.source,
          at: now,
        },
      ],
      now,
    )
    await deletePendingLinks(db, 'newsletter', link.email)
    const held = { id: subscriber.id, uuid: subscriber.uuid }
    if (!subscriber.created) await releaseDigestSubscriber(db, link.email, held, now)
    await joinDigestBySignup(
      db,
      link.email,
      held,
      { version: pending.version, requestedAt: new Date(pending.requestedAt) },
      now,
    )
  } catch (error) {
    // The transaction is rolled back: a subscriber this made goes too (an existing one stays).
    if (subscriber.created) {
      try {
        await listmonk.remove(subscriber.id)
      } catch (undo) {
        console.error(
          `Newsletter confirmation: the new subscriber could not be deleted again (${errorSummary(undo)})`,
        )
      }
    }
    throw error
  }
  return { email: link.email, locale: link.locale, id: subscriber.id, uuid: subscriber.uuid }
}

/** Uses a newsletter link (see above), in a transaction of its own. */
export function confirmSignup(
  payload: Payload,
  listmonk: ListmonkClient,
  token: string | null | undefined,
  now: Date,
): Promise<Confirmed | null> {
  return inTransaction(payload, (_req, db) => confirmInTransaction(db, listmonk, token, now))
}

/**
 * The welcome email of a confirmed signup, while the person waits (best effort: it never throws
 * for a mail problem, and is not sent again), with the subscriber's unsubscribe links on the
 * site's own `origin`.
 */
export const sendWelcome =
  (payload: Payload, origin: string) =>
  ({ email, locale, id, uuid }: Confirmed): Promise<Delivery> =>
    deliverWhileWaiting(
      payload,
      email,
      newsletterWelcomeEmail({
        locale,
        unsubscribePage: unsubscribePageUrl(origin, id, uuid),
        unsubscribeUrl: oneClickUrl(origin, id, uuid),
      }),
      'Newsletter welcome',
    )

/** What the confirmation route reads and does (the route gives the real ones). */
export type ConfirmDependencies = {
  env?: Record<string, string | undefined>
  /** Null while the newsletter is off (no listmonk settings). */
  confirm: ((token: string | null) => Promise<Confirmed | null>) | null
  /** The welcome email (`sendWelcome`; best effort, never throws for a mail problem). */
  welcome: (confirmed: Confirmed) => Promise<Delivery>
}

/**
 * POST `/en/newsletter/confirm/use/`: only from the site's own pages (`sameOrigin`), so another
 * site cannot subscribe an address with a link it got hold of. A confirmed signup ends on
 * `confirmed/`, whatever became of the welcome email (the page does not say it arrived). A link
 * that is unknown, used or expired leads to the link's page without it, which says so (and that a
 * signup confirmed a moment ago, by a double press, is done). A failure leaves the link working:
 * back to the link's page with a reference that the log line repeats with the error's class and
 * code only. While the newsletter is off: back to the page with "temporarily unavailable", the
 * link untouched.
 */
export async function handleConfirmation(
  request: Request,
  deps: ConfirmDependencies,
): Promise<Response> {
  if (!sameOrigin(request.headers, deps.env)) return forbidden()
  const token = formValue(await readForm(request), 'token')
  const keep = { token: isToken(token) ? token : null }
  if (!deps.confirm) {
    return seeOther(outcomePath(NEWSLETTER_PATHS.confirm, { error: 'unavailable' }, keep))
  }
  let confirmed: Confirmed | null
  try {
    confirmed = await deps.confirm(token)
  } catch (error) {
    const reference = newReference()
    console.error(`Newsletter confirmation failed (reference ${reference}): ${errorSummary(error)}`)
    return seeOther(outcomePath(NEWSLETTER_PATHS.confirm, { error: 'failed', reference }, keep))
  }
  if (!confirmed) return seeOther(NEWSLETTER_PATHS.confirm)
  try {
    await deps.welcome(confirmed)
  } catch (error) {
    console.error(`Newsletter welcome email not sent: ${errorSummary(error)}`)
  }
  return seeOther(NEWSLETTER_PATHS.confirmed)
}
