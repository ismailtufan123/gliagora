import { errorSummary } from '@/lib/errors'
import { clientIp, hashClientIp } from '@/lib/forms/client-ip'
import { newsletterEmailLimits } from '@/lib/forms/newsletter'
import { newReference, warnSiteWideCap } from '@/lib/forms/public-form'
import {
  type LimitStore,
  NEWSLETTER_LIMIT,
  NEWSLETTER_WAIT_MS,
  admit,
  ipLimit,
} from '@/lib/forms/rate-limit'
import { newsletterCookie } from '@/lib/members/cookies'
import { sameOrigin } from '@/lib/members/origin'
import { type ErrorCode, outcomePath } from '@/lib/members/outcome'
import { forbidden, seeOther } from '@/lib/members/responses'

import { type InboxState, inboxSecondsLeft, openInbox, sealInbox } from './cookie'
import { NEWSLETTER_PATHS } from './paths'

// "Send it again" on "Check your inbox" (M2, D50; PLAN §9.10): POST /en/newsletter/resend/. It
// sends a new confirmation link to the address in the sealed cookie the form set (never to one
// the request names), at most once a minute for that address, within the form's limit per IP
// address (20 an hour, shared with the form), the address's budget and the site-wide cap. The new
// link records the consent the form gave (its time and the consent text's version, from the
// cookie), and the cookie set again keeps the hour from the form: "Send it again" never works
// longer than an hour after the one spam check the form passed. Earlier links keep working until
// they expire; using one deletes the others. Only from the site's own
// pages (`sameOrigin`); answers with a 303 back to the page, with what happened (`?done=resent`, or
// `?error=wait|limited|unavailable|failed`, src/lib/members/outcome.ts). Without JavaScript too:
// the minute is the server's rule, the page only says so.

export type ResendDependencies = {
  env?: Record<string, string | undefined>
  now: Date
  /** PAYLOAD_SECRET: opens the cookie and hashes the limits' keys. */
  secret: string
  /** The cookie's sealed value, if the request has it. */
  cookie: string | null | undefined
  /** Whether the signup is on (listmonk, a mail server, the spam check, a known origin). */
  on: boolean
  limits: () => Promise<LimitStore>
  /** Stores a new link and emails it (src/lib/newsletter/signup.ts). */
  send: (inbox: InboxState) => Promise<void | 'unavailable'>
}

const back = (error: ErrorCode, reference?: string) =>
  seeOther(outcomePath(NEWSLETTER_PATHS.checkInbox, { error, reference }))

export async function handleResend(request: Request, deps: ResendDependencies): Promise<Response> {
  if (!sameOrigin(request.headers, deps.env)) return forbidden()
  const inbox = openInbox(deps.cookie, deps.secret, deps.now)
  // An hour later, or another browser: the page's general text, which links back to the form.
  if (!inbox) return seeOther(NEWSLETTER_PATHS.checkInbox)
  if (!deps.on) return back('unavailable')
  // The cookie's own time first: no database work for a button pressed too soon.
  if (deps.now.getTime() - inbox.sentAt.getTime() < NEWSLETTER_WAIT_MS) return back('wait')
  const reference = newReference()
  try {
    const admission = await admit(await deps.limits(), {
      keys: [
        ipLimit(NEWSLETTER_LIMIT, hashClientIp(clientIp(request.headers), deps.secret)),
        ...newsletterEmailLimits(inbox.email, deps.secret),
      ],
      now: deps.now,
    })
    if (admission === 'wait') return back('wait')
    if (admission === 'rateLimited' || admission === 'replayed') return back('limited')
    if (admission === 'unavailable') {
      warnSiteWideCap('Newsletter link sent again', deps.now)
      return back('unavailable')
    }
    if ((await deps.send(inbox)) === 'unavailable') return back('unavailable')
  } catch (error) {
    console.error(`Newsletter link not sent again (reference ${reference}): ${errorSummary(error)}`)
    return back('failed', reference)
  }
  // The time of this email for the minute's wait; the form's consent and the hour stay as they were.
  return seeOther(outcomePath(NEWSLETTER_PATHS.checkInbox, { done: 'resent' }), [
    newsletterCookie(
      sealInbox({ ...inbox, sentAt: deps.now }, deps.secret),
      inboxSecondsLeft(inbox, deps.now),
    ),
  ])
}
