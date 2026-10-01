import { randomInt } from 'node:crypto'

import { createChallenge } from 'altcha-lib/v1'
import { describe, expect, it, vi } from 'vitest'

import { ALTCHA_MAX_NUMBER, ALTCHA_TTL_MS } from './altcha'
import { memoryLimitStore } from './memory-limit-store'
import { FORWARDED_ACTION_HEADER, type FormDependencies } from './public-form'
import { EMAILS_PER_ADDRESS, MEMBER_VERIFY_PER_HOUR, VERIFY_EMAIL_LIMIT } from './rate-limit'
import { handleSignInRequest } from './sign-in'
import {
  type VerifyEmailData,
  type VerifyEmailMember,
  handleVerifyEmailRequest,
  parseVerifyEmail,
} from './verify-email'

// Adding an address to the signed-in member's account (src/lib/forms/verify-email.ts): only for a
// member, with a limit per member besides the per-IP one, and the budget of the address that every
// form sending an email shares.

const KEY = 'test-only-hmac-key-0123456789abcdef0123456789abcdef'
const MEMBER = { id: 7, email: 'member@example.org' }

async function form(email: string) {
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

function dependencies({
  ip = '203.0.113.9',
  store = memoryLimitStore(),
  member = MEMBER as VerifyEmailMember,
  headers = {} as Record<string, string>,
} = {}) {
  const save = vi.fn(async (_data: VerifyEmailData): Promise<void | 'unavailable'> => {})
  const deps: FormDependencies<VerifyEmailData> & { member: VerifyEmailMember } = {
    altchaKey: KEY,
    secret: 'test-only-payload-secret',
    headers: new Headers({ 'x-forwarded-for': ip, ...headers }),
    now: new Date(),
    limits: async () => store,
    save,
    member,
  }
  return { deps, save, store }
}

describe('parseVerifyEmail', () => {
  const parse = (email: string, current: string | null = MEMBER.email) =>
    parseVerifyEmail({ email }, 'en', current)

  it.each([
    ['', 'emailMissing'],
    ['not an address', 'emailInvalid'],
    [`${'a'.repeat(250)}@example.org`, 'emailTooLong'],
    // The account's own address, however it is typed: nothing would change.
    [' Member@Example.ORG ', 'emailSame'],
  ])('refuses %j (%s)', (email, code) => {
    expect(parse(email)).toEqual({ ok: false, errors: { email: code } })
  })

  it('takes the stored form of a new address', () => {
    expect(parse(' New.Address+x@Example.org')).toEqual({
      ok: true,
      data: { email: 'new.address+x@example.org', locale: 'en' },
    })
    expect(parse('new@example.org', null)).toMatchObject({ ok: true })
  })
})

describe('handleVerifyEmailRequest', () => {
  it('sends a link and counts it for the IP address, the member and the address', async () => {
    const { deps, save, store } = dependencies()
    expect(await handleVerifyEmailRequest(await form('new@example.org'), deps)).toEqual({
      kind: 'sent',
    })
    expect(save).toHaveBeenCalledWith({ email: 'new@example.org', locale: 'en' })
    const keys = store.rows.map((row) => row.key.split(':').slice(0, 2).join(':'))
    expect(keys).toEqual(
      expect.arrayContaining(['ip:verify', 'member:verify', 'mail:addr', 'mail:all']),
    )
    expect(store.rows.map((row) => row.key)).toContain('member:verify:7')
  })

  it('refuses a visitor who is signed out before anything is checked or counted', async () => {
    const { deps, save, store } = dependencies({ member: null })
    expect(await handleVerifyEmailRequest(await form('new@example.org'), deps)).toMatchObject({
      kind: 'refused',
      status: 401,
      problem: 'signedOut',
      values: { email: 'new@example.org' },
    })
    expect(save).not.toHaveBeenCalled()
    expect(store.rows).toEqual([])
  })

  it('refuses a forwarded Server Action, signed in or not', async () => {
    for (const member of [MEMBER, null]) {
      const { deps, save, store } = dependencies({
        member,
        headers: { [FORWARDED_ACTION_HEADER]: '1' },
      })
      expect(await handleVerifyEmailRequest(await form('new@example.org'), deps)).toMatchObject({
        kind: 'refused',
        problem: 'spamCheck',
      })
      expect(save).not.toHaveBeenCalled()
      expect(store.rows).toEqual([])
    }
  })

  it('takes at most 3 links an hour from one member, from any IP address', async () => {
    const store = memoryLimitStore()
    for (let i = 0; i < MEMBER_VERIFY_PER_HOUR; i++) {
      const { deps } = dependencies({ ip: `198.51.100.${i}`, store })
      expect(await handleVerifyEmailRequest(await form(`m-${i}@example.org`), deps)).toEqual({
        kind: 'sent',
      })
    }
    const { deps, save } = dependencies({ ip: '198.51.100.99', store })
    expect(await handleVerifyEmailRequest(await form('m-last@example.org'), deps)).toMatchObject({
      kind: 'refused',
      status: 429,
      problem: 'rateLimited',
    })
    expect(save).not.toHaveBeenCalled()
    // Another member is not held back by it.
    const other = dependencies({ ip: '198.51.100.98', store, member: { id: 8, email: null } })
    expect(await handleVerifyEmailRequest(await form('m-other@example.org'), other.deps)).toEqual({
      kind: 'sent',
    })
  })

  it('takes at most 10 links an hour from one IP address', async () => {
    const store = memoryLimitStore()
    for (let i = 0; i < VERIFY_EMAIL_LIMIT.perWindow; i++) {
      const { deps } = dependencies({ store, member: { id: 100 + i, email: null } })
      expect(await handleVerifyEmailRequest(await form(`ip-${i}@example.org`), deps)).toEqual({
        kind: 'sent',
      })
    }
    const { deps } = dependencies({ store, member: { id: 200, email: null } })
    expect(await handleVerifyEmailRequest(await form('ip-last@example.org'), deps)).toMatchObject({
      kind: 'refused',
      problem: 'rateLimited',
    })
  })

  it('shares the budget of an address with the sign-in form', async () => {
    const store = memoryLimitStore()
    for (let i = 0; i < EMAILS_PER_ADDRESS.hour; i++) {
      const { deps } = dependencies({ ip: `192.0.2.${i}`, store })
      // Sign-in links for the same mailbox, from anywhere.
      expect(await handleSignInRequest(await form(`shared+${i}@example.org`), deps)).toEqual({
        kind: 'sent',
      })
    }
    const { deps, save } = dependencies({ ip: '192.0.2.200', store })
    expect(await handleVerifyEmailRequest(await form('Shared@example.org'), deps)).toMatchObject({
      kind: 'refused',
      problem: 'rateLimited',
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('answers a filled-in hidden field as if it sent a link, and sends nothing', async () => {
    const { deps, save, store } = dependencies()
    const sent = await form('new@example.org')
    sent.set('reference_code', 'spam')
    expect(await handleVerifyEmailRequest(sent, deps)).toEqual({ kind: 'sent' })
    expect(save).not.toHaveBeenCalled()
    expect(store.rows).toEqual([])
  })

  it('says "temporarily unavailable" when the email could not be sent', async () => {
    const { deps } = dependencies()
    deps.save = async () => 'unavailable'
    expect(await handleVerifyEmailRequest(await form('new@example.org'), deps)).toMatchObject({
      kind: 'refused',
      status: 503,
      problem: 'unavailable',
    })
  })
})
