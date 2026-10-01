import { describe, expect, it } from 'vitest'

import { SIGN_IN_COOKIE_MINUTES } from '@/lib/retention/rules'

import { openSignIn, sealSignIn } from './seal'
import { newBinding } from './tokens'

const SECRET = 'test-only-payload-secret'
const NOW = new Date('2026-10-01T12:00:00.000Z')
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)

const oauth = {
  kind: 'oauth' as const,
  p: 'orcid' as const,
  state: 'state-0123456789abcdef',
  nonce: 'nonce-0123456789abcdef',
  intent: 'sign-in' as const,
  next: '/en/jobs/?type=phd',
  save: 'job:k3f9a',
}

/** Flips one character of the sealed part. */
function changed(sealed: string, at: number) {
  const chars = [...sealed]
  const index = 3 + at
  chars[index] = chars[index] === 'A' ? 'B' : 'A'
  return chars.join('')
}

describe('the sealed sign-in cookie', () => {
  it('opens to what was sealed, with its version and expiry', () => {
    const sealed = sealSignIn(oauth, SECRET, NOW)
    expect(sealed.startsWith('v1.')).toBe(true)
    expect(openSignIn(sealed, SECRET, NOW, 'oauth')).toEqual({
      ...oauth,
      v: 1,
      exp: later(SIGN_IN_COOKIE_MINUTES).getTime(),
    })
  })

  it('cannot be read without the key', () => {
    const sealed = sealSignIn(
      {
        kind: 'confirm',
        p: 'orcid',
        sub: '0000-0002-1825-0097',
        name: 'Josiah Carberry',
        next: '/en/account/',
      },
      SECRET,
      NOW,
    )
    const text = Buffer.from(sealed.slice(3), 'base64url').toString('latin1')
    for (const secret of ['Carberry', '0000-0002', '/en/account/', 'confirm']) {
      expect(text).not.toContain(secret)
    }
    expect(openSignIn(sealed, 'another-secret', NOW, 'confirm')).toBeNull()
  })

  it('refuses a value with any byte changed, or cut short', () => {
    const sealed = sealSignIn(oauth, SECRET, NOW)
    for (const at of [0, 5, 16, 40, sealed.length - 5]) {
      expect(openSignIn(changed(sealed, at), SECRET, NOW, 'oauth')).toBeNull()
    }
    expect(openSignIn(sealed.slice(0, -4), SECRET, NOW, 'oauth')).toBeNull()
    expect(openSignIn('v1.', SECRET, NOW, 'oauth')).toBeNull()
  })

  it('expires after 15 minutes', () => {
    const sealed = sealSignIn(oauth, SECRET, NOW)
    expect(openSignIn(sealed, SECRET, later(SIGN_IN_COOKIE_MINUTES - 1), 'oauth')).not.toBeNull()
    expect(openSignIn(sealed, SECRET, later(SIGN_IN_COOKIE_MINUTES), 'oauth')).toBeNull()
  })

  it('refuses another version or format', () => {
    const sealed = sealSignIn(oauth, SECRET, NOW)
    for (const value of [`v2.${sealed.slice(3)}`, sealed.slice(3), '', null, undefined]) {
      expect(openSignIn(value, SECRET, NOW, 'oauth')).toBeNull()
    }
  })

  it('opens only as the kind it was sealed as', () => {
    const email = sealSignIn({ kind: 'email', bind: newBinding() }, SECRET, NOW)
    expect(openSignIn(email, SECRET, NOW, 'email')).not.toBeNull()
    expect(openSignIn(email, SECRET, NOW, 'oauth')).toBeNull()
    expect(openSignIn(email, SECRET, NOW, 'confirm')).toBeNull()
  })

  it('refuses to seal what a flow never holds', () => {
    expect(() => sealSignIn({ ...oauth, next: 'x'.repeat(1001) }, SECRET, NOW)).toThrow()
    expect(() => sealSignIn({ ...oauth, memberId: -1 }, SECRET, NOW)).toThrow()
  })
})
