import { randomInt } from 'node:crypto'

import { createChallenge } from 'altcha-lib/v1'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ALTCHA_MAX_NUMBER, ALTCHA_TTL_MS } from './altcha'
import { memoryLimitStore } from './memory-limit-store'
import {
  FORWARDED_ACTION_HEADER,
  type FormDependencies,
  type PublicForm,
  formText,
  handlePublicForm,
} from './public-form'
import { EMAILS_PER_ADDRESS, EMAILS_SITE_WIDE, emailLimits, hashLimitAddress } from './rate-limit'

// What every public form shares (src/lib/forms/public-form.ts), with a small form that sends an
// email, as the sign-in, address and data-request forms of M4b will. suggest.test.ts and
// report.test.ts cover the same steps with their own fields.

const KEY = 'test-only-hmac-key-0123456789abcdef0123456789abcdef'
const SECRET = 'test-only-payload-secret'

type Values = { email: string }
type Data = { email: string }
type Errors = { email?: 'emailMissing' }

const FORM: PublicForm<Values, Data, Errors> = {
  name: 'Test request',
  limit: { name: 'test', perWindow: 10 },
  moreLimits: (data, secret) => emailLimits(hashLimitAddress(data.email, secret)),
  read: (form) => ({ email: formText(form, 'email') }),
  parse: (values) =>
    values.email ? { ok: true, data: values } : { ok: false, errors: { email: 'emailMissing' } },
}

afterEach(() => {
  vi.restoreAllMocks()
})

/** A form with a correct spam-check answer (the test knows the number). */
async function form(email = 'someone@example.org') {
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

function dependencies(overrides: Partial<FormDependencies<Data>> = {}) {
  const store = memoryLimitStore()
  const save = vi.fn(async (): Promise<void | 'unavailable'> => {})
  const limits = vi.fn(async () => store)
  const deps: FormDependencies<Data> = {
    altchaKey: KEY,
    secret: SECRET,
    headers: new Headers({ 'x-forwarded-for': '203.0.113.9' }),
    now: new Date(),
    limits,
    save,
    ...overrides,
  }
  return { deps, store, save, limits }
}

describe('a forwarded Server Action', () => {
  it('is refused before the form is read: nothing is stored, counted or sent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const read = vi.spyOn(FORM, 'read')
    const { deps, save, limits } = dependencies({
      headers: new Headers({ 'x-forwarded-for': '203.0.113.9', [FORWARDED_ACTION_HEADER]: '1' }),
    })
    const outcome = await handlePublicForm(await form(), deps, FORM)
    expect(outcome).toEqual({
      kind: 'refused',
      status: 400,
      problem: 'spamCheck',
      values: { email: '' },
    })
    expect(save).not.toHaveBeenCalled()
    expect(limits).not.toHaveBeenCalled()
    // Only an empty form is read, for the empty values of the answer.
    expect(read).toHaveBeenCalledTimes(1)
    expect((read.mock.calls[0]![0] as FormData).get('email')).toBeNull()
    expect(warn).toHaveBeenCalledWith('Test request: a forwarded Server Action was refused')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('someone@example.org')
  })

  it('is told by the header Next.js adds when it forwards one (x-action-forwarded)', () => {
    expect(FORWARDED_ACTION_HEADER).toBe('x-action-forwarded')
  })
})

describe('the forms that send an email', () => {
  it('count each address and the whole site besides the IP address', async () => {
    const { deps, save } = dependencies()
    for (let i = 0; i < EMAILS_PER_ADDRESS.hour; i++) {
      const other = { ...deps, headers: new Headers({ 'x-forwarded-for': `203.0.113.${i}` }) }
      expect(await handlePublicForm(await form('Someone+x@example.org'), other, FORM)).toEqual({
        kind: 'sent',
      })
    }
    expect(await handlePublicForm(await form('someone@example.org'), deps, FORM)).toMatchObject({
      kind: 'refused',
      status: 429,
      problem: 'rateLimited',
      values: { email: 'someone@example.org' },
    })
    expect(save).toHaveBeenCalledTimes(EMAILS_PER_ADDRESS.hour)
  })

  it('say "temporarily unavailable" at the site-wide cap, with one warning an hour in the log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // The only test here that reaches the cap, so the once-an-hour warning starts afresh.
    const { deps, store } = dependencies()
    // The cap's rows, as other people's emails left them a moment ago.
    const at = deps.now.getTime() - 1000
    for (let i = 0; i < EMAILS_SITE_WIDE.hour; i++) store.rows.push({ key: 'mail:all', at })
    for (const minutes of [0, 30]) {
      const later = { ...deps, now: new Date(deps.now.getTime() + minutes * 60_000) }
      expect(await handlePublicForm(await form(), later, FORM)).toMatchObject({
        kind: 'refused',
        status: 503,
        problem: 'unavailable',
      })
    }
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toMatch(/^Test request: the site-wide limit on emails/)
    expect(JSON.stringify(warn.mock.calls)).not.toContain('someone@example.org')
  })

  it('say "temporarily unavailable" when the email could not be sent', async () => {
    const { deps } = dependencies({ save: vi.fn(async () => 'unavailable' as const) })
    expect(await handlePublicForm(await form(), deps, FORM)).toMatchObject({
      kind: 'refused',
      status: 503,
      problem: 'unavailable',
      values: { email: 'someone@example.org' },
    })
  })

  it('send nothing for a filled-in hidden field, and count nothing', async () => {
    const { deps, save, limits } = dependencies()
    const sent = await form()
    sent.set('reference_code', 'spam')
    expect(await handlePublicForm(sent, deps, FORM)).toEqual({ kind: 'sent' })
    expect(save).not.toHaveBeenCalled()
    expect(limits).not.toHaveBeenCalled()
  })
})
