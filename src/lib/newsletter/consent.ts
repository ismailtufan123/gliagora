import { z } from 'zod'

import { CONTENT_PAGES } from '@/lib/content'

// Consent to Glia Notes (M2, D50; PLAN §5.1, §13): what a person agrees to, and how the site keeps
// a record of it. No heavy imports: the member store, the form and the account's settings all use
// these.

/**
 * The version of the consent text a person agrees to: the date of the açık rıza metni
 * (`CONTENT_PAGES.acikRiza.updated`, content/tr/legal/acik-riza-metni.md), which changes with the
 * text (D28; git keeps every version). The newsletter form and the account's Glia Notes setting
 * both store it with the consent.
 */
export const GLIA_NOTES_CONSENT_VERSION = CONTENT_PAGES.acikRiza.updated

/** What a consent version may look like: no address or free text ever fits (the database checks it too). */
export const CONSENT_VERSION_PATTERN = /^[0-9A-Za-z._-]{1,40}$/

/**
 * What a pending signup's link keeps besides the address and the locale (`email_tokens.request_data`
 * of a `newsletter` link): the version of the text agreed to, the form it came from and when the
 * form was sent (ISO), which the consent records copy once the person confirms. "Send it again"
 * stores the same version and time as the form (they travel in the sealed cookie), so a resent
 * link records what the person agreed to, and when (the database checks the shape too,
 * 20261002_190000_newsletter_constraints).
 */
export const pendingSignupSchema = z.strictObject({
  version: z.string().regex(CONSENT_VERSION_PATTERN),
  source: z.literal('newsletter-form'),
  requestedAt: z.iso.datetime(),
})

export type PendingSignup = z.infer<typeof pendingSignupSchema>

/** A listmonk subscriber's UUID as the site stores and links it: lower-case, hyphenated. */
export const SUBSCRIBER_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * The UUID listmonk puts in its previews of a campaign: it belongs to nobody, so an unsubscribe
 * with it does nothing (M6, M11, when issues are sent).
 */
export const PREVIEW_UUID = '00000000-0000-0000-0000-000000000000'

/** listmonk's subscriber IDs are PostgreSQL integers (`int4`). */
export const SUBSCRIBER_ID_MAX = 2_147_483_647

/** Whether `value` is a listmonk subscriber ID. */
export const isSubscriberId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= SUBSCRIBER_ID_MAX

/**
 * A subscriber's UUID from an address (`?s=`), in its stored form, or null: anything that is not a
 * UUID (also the preview UUID) is refused before anything is looked up.
 */
export function subscriberUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const uuid = value.trim().toLowerCase()
  return SUBSCRIBER_UUID_PATTERN.test(uuid) && uuid !== PREVIEW_UUID ? uuid : null
}

/**
 * A subscriber's ID from an address (`?id=`), or null: only the digits of a positive `int4`, no
 * sign, no leading zero, no spaces, so nothing else ever reaches listmonk's address.
 */
export function subscriberId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,9}$/.test(value)) return null
  const id = Number(value)
  return isSubscriberId(id) ? id : null
}

/**
 * What an unsubscribe link names (`?id=` listmonk's subscriber ID, `?s=` its UUID; M2, D50):
 * a subscriber; `preview`, listmonk's preview UUID (whatever the ID), which belongs to nobody; or
 * null, a link that is incomplete or changed (either value missing or malformed), which anyone can
 * see from the address itself.
 */
export function unsubscribeLink(
  id: unknown,
  s: unknown,
): { id: number; uuid: string } | 'preview' | null {
  if (typeof s === 'string' && s.trim().toLowerCase() === PREVIEW_UUID) return 'preview'
  const uuid = subscriberUuid(s)
  const number = subscriberId(id)
  return uuid && number ? { id: number, uuid } : null
}
