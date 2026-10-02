import type { Payload } from 'payload'

import type { Locale } from '@/i18n/routing'
import { deliverWhileWaiting } from '@/lib/email/deliver'
import { newsletterConfirmEmail } from '@/lib/email/messages'
import { createEmailToken, deleteEmailToken, memberDb } from '@/lib/members/store'
import { NEWSLETTER_COOKIE_MINUTES } from '@/lib/retention/rules'

import { NEWSLETTER_PATHS } from './paths'

// A Glia Notes signup waiting for its confirmation (M2, D50; PLAN §13): one `newsletter` link in
// `email_tokens` (only the token's SHA-256), holding the address, the locale and what the consent
// record needs (the consent text's version the form showed, the form, and when it was sent; for
// "Send it again" the same as the form's, from the sealed cookie). It works for 7 days; the hourly task
// `purgeMemberAuth` deletes it after that, and backups leave it out, so an unconfirmed address is
// gone after 7 days and never reaches listmonk. The link is emailed while the person waits; if the
// mail server does not take it, the link is deleted again and the form says it could not send the
// email.

export type PendingSignupInput = {
  email: string
  locale: Locale
  /** When the form was sent, and the consent text's version it showed. */
  requested: { at: Date; version: string }
}

/** How long before its link the form may have been sent: the cookie's hour, and a minute. */
const REQUESTED_WITHIN_MS = (NEWSLETTER_COOKIE_MINUTES + 1) * 60_000

/**
 * Stores a signup's link and emails it (the form, and "Send it again"): `'unavailable'` when the
 * email could not be sent, with the link deleted again. `origin` is the site's own (`appOrigin()`),
 * which the link starts with.
 */
export async function recordAndSendSignup(
  payload: Payload,
  signup: PendingSignupInput,
  { origin, now }: { origin: string; now: Date },
): Promise<void | 'unavailable'> {
  const requestedAt = signup.requested.at.getTime()
  if (!(requestedAt <= now.getTime() && requestedAt >= now.getTime() - REQUESTED_WITHIN_MS)) {
    throw new RangeError('A signup is sent within the hour after its form')
  }
  const db = memberDb(payload)
  const { token } = await createEmailToken(
    db,
    {
      purpose: 'newsletter',
      email: signup.email,
      locale: signup.locale,
      requestData: {
        version: signup.requested.version,
        source: 'newsletter-form',
        requestedAt: signup.requested.at.toISOString(),
      },
    },
    now,
  )
  const link = `${origin}${NEWSLETTER_PATHS.confirm}?token=${token}`
  const delivery = await deliverWhileWaiting(
    payload,
    signup.email,
    newsletterConfirmEmail({ locale: signup.locale, link }),
    'Newsletter signup',
  )
  if (delivery === 'sent') return
  await deleteEmailToken(db, token)
  return 'unavailable'
}
