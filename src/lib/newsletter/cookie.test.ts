import { describe, expect, it } from 'vitest'

import { NEWSLETTER_COOKIE, newsletterCookie, setCookieHeader } from '@/lib/members/cookies'
import { openSignIn, sealSignIn } from '@/lib/members/seal'

import { GLIA_NOTES_CONSENT_VERSION } from './consent'
import { inboxSecondsLeft, maskEmail, newInbox, openInbox, sealInbox } from './cookie'

// The sealed cookie after the newsletter form (src/lib/newsletter/cookie.ts): it opens only as
// itself, for an hour from the form, with the consent the form gave, and the page shows its
// address masked.

const SECRET = 'test-only-payload-secret'
const NOW = new Date('2026-10-02T12:00:00.000Z')
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)
const STATE = newInbox({ email: 'reader@example.org', locale: 'en' }, NOW)

describe('the newsletter cookie', () => {
  it('opens for an hour, with the address, the locale, the last email and the form’s consent', () => {
    expect(STATE).toEqual({
      email: 'reader@example.org',
      locale: 'en',
      sentAt: NOW,
      requested: { at: NOW, version: GLIA_NOTES_CONSENT_VERSION },
      expiresAt: later(60),
    })
    const sealed = sealInbox(STATE, SECRET)
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+$/)
    expect(sealed).not.toContain('reader')
    expect(openInbox(sealed, SECRET, later(59))).toEqual(STATE)
    expect(openInbox(sealed, SECRET, later(60))).toBeNull()
    expect(inboxSecondsLeft(STATE, later(45))).toBe(15 * 60)
  })

  it('keeps the hour from the form when it is sealed again with a later email', () => {
    const again = { ...STATE, sentAt: later(50) }
    const sealed = sealInbox(again, SECRET)
    expect(openInbox(sealed, SECRET, later(59))).toEqual(again)
    expect(openInbox(sealed, SECRET, later(60))).toBeNull()
    expect(newsletterCookie(sealed, inboxSecondsLeft(again, later(50))).maxAge).toBe(600)
    // Never longer than an hour, never negative.
    expect(newsletterCookie(sealed, 7200).maxAge).toBe(3600)
    expect(newsletterCookie(sealed, -5).maxAge).toBe(0)
  })

  it('opens with nothing else: another key, a changed value, the sign-in cookie, no secret', () => {
    const sealed = sealInbox(STATE, SECRET)
    expect(openInbox(sealed, 'another-secret', NOW)).toBeNull()
    expect(openInbox(`${sealed.slice(0, -2)}AA`, SECRET, NOW)).toBeNull()
    expect(openInbox(sealed, '', NOW)).toBeNull()
    expect(openInbox(undefined, SECRET, NOW)).toBeNull()
    expect(openInbox('v1.', SECRET, NOW)).toBeNull()
    // Each cookie's name is bound into its seal, under a key of its own.
    const signIn = sealSignIn({ kind: 'email', bind: 'b'.repeat(22) }, SECRET, NOW)
    expect(openInbox(signIn, SECRET, NOW)).toBeNull()
    expect(openSignIn(sealed, SECRET, NOW, 'email')).toBeNull()
  })

  it('is a __Host- cookie for an hour: Secure, HttpOnly, Path=/, SameSite=Lax', () => {
    const cookie = newsletterCookie('v1.abc')
    expect(cookie).toEqual({
      name: NEWSLETTER_COOKIE,
      value: 'v1.abc',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 3600,
    })
    expect(NEWSLETTER_COOKIE).toBe('__Host-gliagora-newsletter')
    expect(setCookieHeader(cookie)).toBe(
      '__Host-gliagora-newsletter=v1.abc; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax',
    )
  })
})

describe('maskEmail', () => {
  it('shows the first character, the dots and the domain', () => {
    expect(maskEmail('reader@example.org')).toBe('r•••@example.org')
    expect(maskEmail('a@example.org')).toBe('a•••@example.org')
    expect(maskEmail('not-an-address')).toBe('•••')
  })
})
