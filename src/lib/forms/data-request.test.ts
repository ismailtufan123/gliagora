import { randomInt } from 'node:crypto'

import { createChallenge } from 'altcha-lib/v1'
import { describe, expect, it, vi } from 'vitest'

import { ALTCHA_MAX_NUMBER, ALTCHA_TTL_MS } from './altcha'
import { handleDataRequest } from './data-request'
import type { DataRequestData } from './data-request-schema'
import { memoryLimitStore } from './memory-limit-store'
import { FORWARDED_ACTION_HEADER, type FormDependencies } from './public-form'
import { DATA_REQUEST_LIMIT, EMAILS_PER_ADDRESS, EMAILS_SITE_WIDE } from './rate-limit'
import { type SignInData, handleSignInRequest } from './sign-in'

// The data-request form (src/lib/forms/data-request.ts): its limits, shared with the other forms
// that send an email, and the answers that are the same for every address.

const KEY = 'test-only-hmac-key-0123456789abcdef0123456789abcdef'

async function form(email: string, kind = 'deletion', details = '') {
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
  data.set('kind', kind)
  data.set('name', '')
  data.set('details', details)
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

function dependencies(ip = '203.0.113.9', store = memoryLimitStore(), headers: object = {}) {
  const save = vi.fn(async (_data: DataRequestData): Promise<void | 'unavailable'> => {})
  const deps: FormDependencies<DataRequestData> = {
    altchaKey: KEY,
    secret: 'test-only-payload-secret',
    headers: new Headers({ 'x-forwarded-for': ip, ...headers }),
    now: new Date(),
    limits: async () => store,
    save,
  }
  return { deps, save, store }
}

describe('handleDataRequest', () => {
  it('records a request, counted per IP address, per address and site-wide', async () => {
    const { deps, save, store } = dependencies()
    expect(await handleDataRequest(await form('A@Example.org'), deps)).toEqual({ kind: 'sent' })
    expect(save).toHaveBeenCalledWith({
      email: 'a@example.org',
      kind: 'deletion',
      name: null,
      details: null,
      locale: 'en',
    })
    const keys = store.rows.map((row) => row.key.split(':').slice(0, 2).join(':'))
    expect(keys).toEqual(expect.arrayContaining(['ip:request', 'mail:addr', 'mail:all']))
  })

  it('takes at most 5 requests an hour from one IP address', async () => {
    const { deps, save } = dependencies()
    for (let i = 0; i < DATA_REQUEST_LIMIT.perWindow; i++) {
      expect(await handleDataRequest(await form(`r-${i}@example.org`), deps)).toEqual({
        kind: 'sent',
      })
    }
    expect(await handleDataRequest(await form('r-last@example.org'), deps)).toMatchObject({
      kind: 'refused',
      status: 429,
      problem: 'rateLimited',
    })
    expect(save).toHaveBeenCalledTimes(DATA_REQUEST_LIMIT.perWindow)
  })

  it('shares the budget of an address with the other forms that send an email', async () => {
    const store = memoryLimitStore()
    // Sign-in links to variants of one mailbox, from other IP addresses, use up its hour.
    for (let i = 0; i < EMAILS_PER_ADDRESS.hour; i++) {
      const { deps } = dependencies(`198.51.100.${i}`, store)
      const signIn = deps as unknown as FormDependencies<SignInData>
      expect(await handleSignInRequest(await form(`m-shared+${i}@example.org`), signIn)).toEqual({
        kind: 'sent',
      })
    }
    const { deps, save } = dependencies('198.51.100.99', store)
    expect(await handleDataRequest(await form('M-Shared@example.org'), deps)).toMatchObject({
      kind: 'refused',
      problem: 'rateLimited',
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('says "temporarily unavailable" once the site-wide cap on emails is reached', async () => {
    const store = memoryLimitStore()
    const at = Date.now()
    for (let i = 0; i < EMAILS_SITE_WIDE.hour; i++) store.rows.push({ key: 'mail:all', at })
    const { deps, save } = dependencies('198.51.100.7', store)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await handleDataRequest(await form('someone@example.org'), deps)).toMatchObject({
      kind: 'refused',
      status: 503,
      problem: 'unavailable',
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('says "temporarily unavailable" when the confirmation email could not be sent', async () => {
    const { deps } = dependencies()
    deps.save = async () => 'unavailable'
    expect(
      await handleDataRequest(await form('someone@example.org', 'access', 'A copy.'), deps),
    ).toMatchObject({
      kind: 'refused',
      status: 503,
      problem: 'unavailable',
      values: { email: 'someone@example.org', kind: 'access', details: 'A copy.' },
    })
  })

  it('answers a filled-in hidden field as if it worked, and records nothing', async () => {
    const { deps, save, store } = dependencies()
    const sent = await form('someone@example.org')
    sent.set('reference_code', 'spam')
    expect(await handleDataRequest(sent, deps)).toEqual({ kind: 'sent' })
    expect(save).not.toHaveBeenCalled()
    expect(store.rows).toEqual([])
  })

  it('refuses a call Next.js forwarded from another page, before reading it', async () => {
    const { deps, save, store } = dependencies('203.0.113.9', memoryLimitStore(), {
      [FORWARDED_ACTION_HEADER]: '1',
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await handleDataRequest(await form('someone@example.org'), deps)).toMatchObject({
      kind: 'refused',
      problem: 'spamCheck',
    })
    expect(save).not.toHaveBeenCalled()
    expect(store.rows).toEqual([])
  })

  it('is unavailable without the spam check, before anything is checked or counted', async () => {
    const { deps, save, store } = dependencies()
    deps.altchaKey = null
    expect(await handleDataRequest(await form(''), deps)).toMatchObject({
      kind: 'refused',
      status: 503,
      problem: 'unavailable',
    })
    expect(save).not.toHaveBeenCalled()
    expect(store.rows).toEqual([])
  })
})
