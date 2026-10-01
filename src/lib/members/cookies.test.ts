import { describe, expect, it } from 'vitest'

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  SIGN_IN_COOKIE,
  clearedCookie,
  sessionCookie,
  setCookieHeader,
  signInCookie,
} from './cookies'

const NOW = new Date('2026-10-01T12:00:00.000Z')

describe('member cookies', () => {
  it('are __Host- cookies: Secure, Path=/, no Domain, HttpOnly, SameSite=Lax', () => {
    expect(SESSION_COOKIE).toBe('__Host-gliagora-session')
    expect(SIGN_IN_COOKIE).toBe('__Host-gliagora-signin')
    for (const cookie of [
      sessionCookie('token', new Date(NOW.getTime() + 1000), NOW),
      signInCookie('v1.sealed'),
      clearedCookie(SESSION_COOKIE),
    ]) {
      expect(cookie).toMatchObject({ path: '/', httpOnly: true, secure: true, sameSite: 'lax' })
      expect(cookie).not.toHaveProperty('domain')
      expect(setCookieHeader(cookie)).toMatch(
        /; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Lax$/,
      )
      expect(setCookieHeader(cookie)).not.toMatch(/Domain/i)
    }
  })

  it('keep a session until its row expires, 30 days from sign-in, never longer', () => {
    const in30Days = new Date(NOW.getTime() + SESSION_MAX_AGE_SECONDS * 1000)
    expect(sessionCookie('t', in30Days, NOW).maxAge).toBe(30 * 24 * 60 * 60)
    const later = new Date(NOW.getTime() + 10 * 24 * 60 * 60 * 1000)
    expect(sessionCookie('t', in30Days, later).maxAge).toBe(20 * 24 * 60 * 60)
    expect(sessionCookie('t', NOW, later).maxAge).toBe(0)
  })

  it('keep the sign-in state for 15 minutes, and delete either at once', () => {
    expect(signInCookie('v1.x').maxAge).toBe(15 * 60)
    expect(clearedCookie(SIGN_IN_COOKIE)).toMatchObject({ value: '', maxAge: 0 })
    expect(setCookieHeader(clearedCookie(SIGN_IN_COOKIE))).toBe(
      '__Host-gliagora-signin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
    )
  })
})
