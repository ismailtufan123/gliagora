import { randomInt } from 'node:crypto'

import { createChallenge } from 'altcha-lib/v1'
import { describe, expect, it, vi } from 'vitest'

import { ALTCHA_MAX_NUMBER, ALTCHA_TTL_MS } from './altcha'
import { memoryLimitStore } from './memory-limit-store'
import type { FormDependencies } from './public-form'
import { EMAILS_PER_ADDRESS, SIGN_IN_LIMIT } from './rate-limit'
import { type SignInData, handleSignInRequest, parseSignIn, readSignInValues } from './sign-in'

// Asking for a sign-in link (src/lib/forms/sign-in.ts): the address, its limits and the answers
// that are the same for every address.

const KEY = 'test-only-hmac-key-0123456789abcdef0123456789abcdef'

async function form(email: string, next = '') {
  const number = randomInt(ALTCHA_MAX_NUMBER)
  const { algorithm, challenge, salt, signature } = await createChallenge({
    hmacKey: KEY,
    algorithm: 'SHA-256',
    number,
    maxnumber: ALTCHA_MAX_NUMBER,
    expires: new Date(Date.now() + ALTCHA_TTL_MS),
  })
  const data = new FormData()
  data.set('email', email)
  data.set('next', next)
  data.set('locale', 'en')
  data.set('reference_code', '')
  data.set(
    'altcha',
    Buffer.from(JSON.stringify({ algorithm, challenge, number, salt, signature })).toString(
      'base64',
    ),
  )
  return data
}

function dependencies(ip = '203.0.113.9', store = memoryLimitStore()) {
  const save = vi.fn(async (_data: SignInData): Promise<void | 'unavailable'> => {})
  const deps: FormDependencies<SignInData> = {
    altchaKey: KEY,
    secret: 'test-only-payload-secret',
    headers: new Headers({ 'x-forwarded-for': ip }),
    now: new Date(),
    limits: async () => store,
    save,
  }
  return { deps, save, store }
}

describe('parseSignIn', () => {
  const make = (email: string, next: string) => {
    const data = new FormData()
    data.set('email', email)
    data.set('next', next)
    return data
  }
  const parse = (email: string, next = '', locale = 'en') =>
    parseSignIn(readSignInValues(make(email, next)), locale)

  it.each([
    ['', 'emailMissing'],
    ['   ', 'emailMissing'],
    ['not an address', 'emailInvalid'],
    ['name@example', 'emailInvalid'],
    [`${'a'.repeat(250)}@example.org`, 'emailTooLong'],
  ])('refuses %j (%s)', (email, code) => {
    expect(parse(email)).toEqual({ ok: false, errors: { email: code } })
  })

  it('uses the stored form of the address for both the email and the link', () => {
    expect(parse('  Someone.Else+news@Example.ORG ', '/en/jobs/?type=phd')).toEqual({
      ok: true,
      data: {
        email: 'someone.else+news@example.org',
        next: '/en/jobs/?type=phd',
        locale: 'en',
      },
    })
  })

  it('reads an unknown locale as English and an empty next as none', () => {
    expect(parse('a@example.org', ' ', 'xx')).toMatchObject({
      ok: true,
      data: { next: null, locale: 'en' },
    })
  })

  it('reads at most 2,000 characters of next', () => {
    expect(readSignInValues(make('a@example.org', `/en/${'x'.repeat(5000)}`)).next).toHaveLength(
      2000,
    )
  })
})

describe('handleSignInRequest', () => {
  it('sends a link and counts the request', async () => {
    const { deps, save, store } = dependencies()
    expect(await handleSignInRequest(await form('a@example.org', '/en/jobs/'), deps)).toEqual({
      kind: 'sent',
    })
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@example.org', next: '/en/jobs/' }),
    )
    const keys = store.rows.map((row) => row.key.split(':').slice(0, 2).join(':'))
    expect(keys).toEqual(expect.arrayContaining(['ip:signin', 'mail:addr', 'mail:all']))
  })

  it('shares one budget between the variants of an address, from any IP address', async () => {
    const store = memoryLimitStore()
    for (let i = 0; i < EMAILS_PER_ADDRESS.hour; i++) {
      const { deps } = dependencies(`198.51.100.${i}`, store)
      expect(await handleSignInRequest(await form(`m-x+${i}@example.org`), deps)).toEqual({
        kind: 'sent',
      })
    }
    const { deps, save } = dependencies('198.51.100.200', store)
    expect(await handleSignInRequest(await form('M-X@example.org'), deps)).toMatchObject({
      kind: 'refused',
      status: 429,
      problem: 'rateLimited',
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('takes at most 10 requests an hour from one IP address', async () => {
    const { deps, save } = dependencies()
    for (let i = 0; i < SIGN_IN_LIMIT.perWindow; i++) {
      expect(await handleSignInRequest(await form(`m-${i}@example.org`), deps)).toEqual({
        kind: 'sent',
      })
    }
    expect(await handleSignInRequest(await form('m-last@example.org'), deps)).toMatchObject({
      kind: 'refused',
      problem: 'rateLimited',
    })
    expect(save).toHaveBeenCalledTimes(SIGN_IN_LIMIT.perWindow)
  })

  it('answers a filled-in hidden field as if it sent a link, and sends nothing', async () => {
    const { deps, save, store } = dependencies()
    const sent = await form('a@example.org')
    sent.set('reference_code', 'spam')
    expect(await handleSignInRequest(sent, deps)).toEqual({ kind: 'sent' })
    expect(save).not.toHaveBeenCalled()
    expect(store.rows).toEqual([])
  })

  it('says "temporarily unavailable" when the email could not be sent', async () => {
    const { deps } = dependencies()
    deps.save = async () => 'unavailable'
    expect(await handleSignInRequest(await form('a@example.org'), deps)).toMatchObject({
      kind: 'refused',
      status: 503,
      problem: 'unavailable',
      values: { email: 'a@example.org' },
    })
  })
})
