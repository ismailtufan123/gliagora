import { z } from 'zod'

import { type Locale, locales } from '@/i18n/routing'
import { EMAIL_MAX } from '@/lib/forms/fields'
import { NEWSLETTER_COOKIE } from '@/lib/members/cookies'
import { openValue, sealValue } from '@/lib/members/seal'
import { NEWSLETTER_COOKIE_MINUTES } from '@/lib/retention/rules'

import { CONSENT_VERSION_PATTERN, GLIA_NOTES_CONSENT_VERSION } from './consent'

// The cookie after the newsletter form (M2, D50; PLAN §9.10): `__Host-gliagora-newsletter`, an
// hour from the form, sealed with AES-256-GCM like the sign-in cookie (src/lib/members/seal.ts, its
// own key label and the cookie's name bound in), so the browser can neither read nor change it. It
// holds the address the confirmation link went to and when it was last sent: "Check your inbox"
// shows the address masked, and "Send it again" sends the link to that address only, never to one
// the browser names. It also holds what the person agreed to on the form, and when (the consent
// text's version and the form's time), so a link sent again records the same consent as the
// first. "Send it again" seals it anew with the time of the new email, but never for longer than
// the hour from the form. Without it (an hour later, another browser) the page shows its general
// text.

const KEY_LABEL = 'gliagora/newsletter/inbox-cookie/v1'
const SEAL = { label: KEY_LABEL, cookie: NEWSLETTER_COOKIE }
const MINUTE_MS = 60_000

const inboxState = z.strictObject({
  // 2: with the form's consent (1, without it, no longer opens).
  v: z.literal(2),
  /** Where the link went, in its stored form. */
  email: z.string().min(3).max(EMAIL_MAX),
  /** The language of its email. */
  locale: z.enum(locales),
  /** When the link was last sent (milliseconds). */
  sentAt: z.number().int(),
  /** When the form was sent (milliseconds): the consent's `requested` time. */
  requestedAt: z.number().int(),
  /** The consent text's version the form showed. */
  version: z.string().regex(CONSENT_VERSION_PATTERN),
  /** The end of the hour from the form (milliseconds). */
  exp: z.number().int(),
})

export type InboxState = {
  email: string
  locale: Locale
  /** When the confirmation link was last sent. */
  sentAt: Date
  /** When the form was sent, with the consent text's version it showed. */
  requested: { at: Date; version: string }
  /** When the cookie ends: an hour after the form. */
  expiresAt: Date
}

/** The cookie's state after the form, sent at `now`: for NEWSLETTER_COOKIE_MINUTES. */
export const newInbox = (signup: { email: string; locale: Locale }, now: Date): InboxState => ({
  ...signup,
  sentAt: now,
  requested: { at: now, version: GLIA_NOTES_CONSENT_VERSION },
  expiresAt: new Date(now.getTime() + NEWSLETTER_COOKIE_MINUTES * MINUTE_MS),
})

/** Seals the cookie's state (until its `expiresAt`). */
export function sealInbox(state: InboxState, secret: string): string {
  const value = inboxState.parse({
    v: 2,
    email: state.email,
    locale: state.locale,
    sentAt: state.sentAt.getTime(),
    requestedAt: state.requested.at.getTime(),
    version: state.requested.version,
    exp: state.expiresAt.getTime(),
  })
  return sealValue(value, { secret, ...SEAL })
}

/** The cookie's remaining life at `now`, in whole seconds (its Max-Age when it is set again). */
export const inboxSecondsLeft = (state: InboxState, now: Date) =>
  Math.max(0, Math.floor((state.expiresAt.getTime() - now.getTime()) / 1000))

/** Opens the cookie, or null (missing, changed, another key or version, expired). Never throws. */
export function openInbox(
  sealed: string | null | undefined,
  secret: string,
  now: Date,
): InboxState | null {
  if (!secret) return null
  const result = inboxState.safeParse(openValue(sealed, { secret, ...SEAL }))
  if (!result.success || result.data.exp <= now.getTime()) return null
  const { email, locale, sentAt, requestedAt, version, exp } = result.data
  return {
    email,
    locale,
    sentAt: new Date(sentAt),
    requested: { at: new Date(requestedAt), version },
    expiresAt: new Date(exp),
  }
}

/**
 * An address as "Check your inbox" shows it: the first character of its local part, `•••`, and
 * its domain (`a•••@example.org`). Shown to the browser that sent the form only; never logged.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '•••'
  const first = Array.from(email.slice(0, at))[0] ?? ''
  return `${first}•••@${email.slice(at + 1)}`
}
