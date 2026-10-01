import { describe, expect, it } from 'vitest'

import { SESSION_COOKIE, SIGN_IN_COOKIE, clearedCookie, sessionCookie } from './cookies'
import { forbidden, formValue, readForm, seeOther } from './responses'

// The answers of the member POST routes (src/lib/members/responses.ts): a 303 with a relative
// address, never stored, with the cookies it sets.

describe('seeOther', () => {
  it('answers 303 with a relative Location and the cookies', () => {
    const now = new Date('2026-10-01T12:00:00Z')
    const response = seeOther('/en/account/?done=created#outcome', [
      sessionCookie('a'.repeat(43), new Date(now.getTime() + 30 * 86_400_000), now),
      clearedCookie(SIGN_IN_COOKIE),
    ])
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/en/account/?done=created#outcome')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.getSetCookie()).toEqual([
      `${SESSION_COOKIE}=${'a'.repeat(43)}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
      `${SIGN_IN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    ])
  })

  it.each(['https://example.org/', '//example.org/', 'en/account/', '/\\example.org'])(
    'refuses to lead off the site: %s',
    (path) => {
      expect(() => seeOther(path)).toThrow()
    },
  )
})

describe('forbidden', () => {
  it('answers 403, never stored', async () => {
    const response = forbidden()
    expect(response.status).toBe(403)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('Forbidden')
  })
})

describe('reading a form', () => {
  it('reads a posted form, and nothing from another body', async () => {
    const form = await readForm(
      new Request('http://localhost/', {
        method: 'POST',
        body: new URLSearchParams({ token: 'x', scope: 'this' }),
      }),
    )
    expect(formValue(form, 'token')).toBe('x')
    expect(formValue(form, 'missing')).toBeNull()
    const json = await readForm(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"token":"x"}',
      }),
    )
    expect(formValue(json, 'token')).toBeNull()
  })
})
