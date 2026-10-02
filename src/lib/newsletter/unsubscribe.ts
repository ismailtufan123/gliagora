import { timingSafeEqual } from 'node:crypto'

import type { Payload } from 'payload'

import type { ConsentSource } from '@/collections/ConsentLog'
import { inTransaction } from '@/jobs/maintenance/task'
import { errorSummary } from '@/lib/errors'
import { newReference } from '@/lib/forms/public-form'
import { normaliseEmail } from '@/lib/members/email-address'
import { type ErrorCode, outcomePath } from '@/lib/members/outcome'
import { formValue, readForm, seeOther } from '@/lib/members/responses'
import { deletePendingLinks, leaveDigestByUnsubscribe } from '@/lib/members/store'

import { PREVIEW_UUID, unsubscribeLink } from './consent'
import type { ListmonkClient, Subscriber } from './listmonk'
import { NEWSLETTER_PATHS, unsubscribePagePathFor } from './paths'
import { logSubscriberDeletion, recordConsent } from './store'

// Unsubscribing from Glia Notes (M2, D50; PLAN §13, §18.1), without JavaScript and without signing
// in: the link in every email opens /en/newsletter/unsubscribe/?id=<ID>&s=<UUID> (listmonk's
// subscriber ID and UUID), whose button posts here, and mail programs post here themselves
// (`List-Unsubscribe`, RFC 8058's one-click, body `List-Unsubscribe=One-Click`). It takes effect at
// once:
// 1. listmonk is asked for the subscriber with that ID (`GET /api/subscribers/:id`; never an SQL
//    expression, src/lib/newsletter/listmonk.ts), and its UUID is compared with the link's in
//    constant time: the UUID, in the emails only, is what proves the link is the subscriber's;
// 2. in one transaction, the consent record of the unsubscribe, a deletion-log row for the
//    subscriber (so `applyDeletionLog` deletes it again if step 3 fails, or after a restore of
//    listmonk's database brought it back), the end of the address's pending signup links (a link
//    asked for earlier no longer subscribes it again), and Glia Notes off for a member with that
//    address or that subscriber (`leaveDigestByUnsubscribe`: synced, so the members' sync never
//    subscribes the address again);
// 3. the subscriber is deleted in listmonk: the address is gone then (§18.1). A failure here is
//    logged by class; the deletion log repeats it within 10 minutes, and the answer is the same.
// An unknown ID, a UUID that is not the subscriber's, or listmonk's preview UUID get the same
// answer as an unsubscribe, and nothing is done; that answer says the address is deleted only "if
// it was on the list". A link that is incomplete (either value missing or malformed, which anyone
// can see from the address itself) leads back to the page, which says so.

/** Where an unsubscribe came from. */
export type UnsubscribeSource = Extract<ConsentSource, 'unsubscribe-link' | 'one-click'>

/**
 * Writes the unsubscribe's consent record, its deletion-log row, the end of the address's pending
 * signup links and Glia Notes off for its member, in one transaction.
 */
export function recordUnsubscribe(
  payload: Payload,
  subscriber: Subscriber,
  source: UnsubscribeSource,
  now: Date,
): Promise<void> {
  return inTransaction(payload, async (_req, db) => {
    await recordConsent(
      db,
      [
        {
          subscriberUuid: subscriber.uuid,
          subscriberId: subscriber.id,
          event: 'unsubscribed',
          consentVersion: null,
          source,
          at: now,
        },
      ],
      now,
    )
    await logSubscriberDeletion(db, subscriber.id, now)
    // A pending link only ever holds an address in its stored form; an odd one listmonk holds
    // (only an admin could make it) has none, and never blocks the unsubscribe.
    const email = normaliseEmail(subscriber.email)
    if (email) await deletePendingLinks(db, 'newsletter', email)
    await leaveDigestByUnsubscribe(db, email, { id: subscriber.id, uuid: subscriber.uuid }, now)
  })
}

export type UnsubscribeDependencies = {
  /** Null while the newsletter is off (no listmonk settings). */
  listmonk: ListmonkClient | null
  /** Step 2 above (`recordUnsubscribe`). */
  record: (subscriber: Subscriber, source: UnsubscribeSource) => Promise<void>
}

/** Whether two UUIDs in their stored form are the same, in constant time. */
function sameUuid(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Steps 1–3 above: `unsubscribed` for the link's subscriber, `unknown` for an ID listmonk does not
 * have or a UUID that is not its subscriber's. Throws when listmonk cannot be asked (also for a
 * subscriber outside Glia Notes, which the app may not change) or the records cannot be written
 * (nothing changed then).
 */
export async function unsubscribe(
  deps: UnsubscribeDependencies & { listmonk: ListmonkClient },
  { id, uuid, source }: { id: number; uuid: string; source: UnsubscribeSource },
): Promise<'unsubscribed' | 'unknown'> {
  const subscriber = await deps.listmonk.findById(id)
  if (!subscriber || !sameUuid(subscriber.uuid, uuid)) return 'unknown'
  await deps.record(subscriber, source)
  try {
    await deps.listmonk.remove(subscriber.id)
  } catch (error) {
    console.error(
      `Newsletter unsubscribe: the subscriber is deleted again by the deletion log (${errorSummary(error)})`,
    )
  }
  return 'unsubscribed'
}

/** The body of a mail program's one-click POST (RFC 8058). */
const ONE_CLICK = 'One-Click'

const text = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })

/** The link's values: from the address (`?id=&s=`, one-click) or else from the page's form. */
function linkValues(request: Request, form: FormData | null) {
  const query = new URL(request.url).searchParams
  if (query.has('id') || query.has('s')) return { id: query.get('id'), s: query.get('s') }
  return { id: formValue(form, 'id'), s: formValue(form, 's') }
}

/**
 * POST `/en/newsletter/unsubscribe/use/` (`?id=&s=` in the address, or `id` and `s` in the form).
 * There is no `sameOrigin()` check here, unlike every other POST route of the site, on purpose:
 * RFC 8058's one-click unsubscribe is posted by the mail provider's servers, from another site,
 * without cookies, Origin or Sec-Fetch-Site, and must work; the subscriber's UUID (random, in the
 * emails only) is the credential, and all the request can do is unsubscribe that subscriber, which
 * is what its owner may do at any time anyway. It has no rate limit either (a mail provider's
 * servers must reach it); guessing an ID's UUID is not practical. A one-click POST gets 200 (text),
 * a press of the page's button a 303 to `unsubscribed/`. A failure (listmonk unreachable, the
 * database) changes nothing: one-click gets 503 so the mail program can try again, the page its
 * message with a reference.
 */
export async function handleUnsubscribe(
  request: Request,
  deps: UnsubscribeDependencies,
): Promise<Response> {
  const form = await readForm(request)
  const oneClick = formValue(form, 'List-Unsubscribe') === ONE_CLICK
  const values = linkValues(request, form)
  const link = unsubscribeLink(values.id, values.s)
  const done = () =>
    oneClick
      ? text(200, 'Unsubscribed from Glia Notes. If this address was on the list, it is deleted.')
      : seeOther(NEWSLETTER_PATHS.unsubscribed)
  // An incomplete link: the page says so (it shows no button then).
  if (link === null) {
    return oneClick
      ? text(400, 'This unsubscribe link is incomplete.')
      : seeOther(NEWSLETTER_PATHS.unsubscribe)
  }
  if (link === 'preview') return done()
  const failed = (error: ErrorCode, reference?: string) =>
    oneClick
      ? text(503, 'Not unsubscribed: please try again later.')
      : seeOther(
          outcomePath(
            NEWSLETTER_PATHS.unsubscribe,
            { error, reference },
            { id: String(link.id), s: link.uuid },
          ),
        )
  if (!deps.listmonk) return failed('unavailable')
  try {
    await unsubscribe(
      { ...deps, listmonk: deps.listmonk },
      { ...link, source: oneClick ? 'one-click' : 'unsubscribe-link' },
    )
  } catch (error) {
    const reference = newReference()
    console.error(`Newsletter unsubscribe failed (reference ${reference}): ${errorSummary(error)}`)
    return failed('failed', reference)
  }
  return done()
}

/** A GET of the route (an address opened in the browser): the page, which asks first. */
export function unsubscribePagePath(request: Request): string {
  const query = new URL(request.url).searchParams
  const link = unsubscribeLink(query.get('id'), query.get('s'))
  if (link === null) return NEWSLETTER_PATHS.unsubscribe
  if (link === 'preview')
    return `${NEWSLETTER_PATHS.unsubscribe}?s=${encodeURIComponent(PREVIEW_UUID)}`
  return unsubscribePagePathFor(link.id, link.uuid)
}
