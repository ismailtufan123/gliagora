import { randomInt } from 'node:crypto'

import { createChallenge } from 'altcha-lib/v1'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderContentFile } from '@/lib/markdown'

import { ALTCHA_MAX_NUMBER, ALTCHA_TTL_MS } from './altcha'
import { memoryLimitStore } from './memory-limit-store'
import { SUGGESTIONS_PER_WINDOW } from './rate-limit'
import { SUGGEST_LEGAL_LINKS, type SuggestDependencies, handleSuggestion } from './suggest'

const KEY = 'test-only-hmac-key-0123456789abcdef0123456789abcdef'
const SECRET = 'test-only-payload-secret'
const IP = '203.0.113.77'

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * A correct spam-check answer, as the solver in the browser sends it. The test knows the secret
 * number, so it need not search for it (altcha.test.ts runs the real solver).
 */
async function answer() {
  const number = randomInt(ALTCHA_MAX_NUMBER)
  const { algorithm, challenge, salt, signature } = await createChallenge({
    hmacKey: KEY,
    algorithm: 'SHA-256',
    number,
    maxnumber: ALTCHA_MAX_NUMBER,
    expires: new Date(Date.now() + ALTCHA_TTL_MS),
  })
  const payload = { algorithm, challenge, number, salt, signature }
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

/** A form as the browser sends it, with a correct spam-check answer unless `solve` is false. */
async function form(fields: Record<string, string> = {}, { solve = true } = {}) {
  const data = new FormData()
  const all: Record<string, string> = {
    url: 'https://www.example.org/jobs/123',
    kind: 'position',
    note: 'Seen on a mailing list.',
    email: '',
    locale: 'en',
    reference_code: '',
    ...fields,
  }
  if (solve && !('altcha' in fields)) all.altcha = await answer()
  for (const [name, value] of Object.entries(all)) data.set(name, value)
  return data
}

function dependencies(overrides: Partial<SuggestDependencies> = {}) {
  const store = memoryLimitStore()
  const save = vi.fn(async () => {})
  const limits = vi.fn(async () => store)
  const deps: SuggestDependencies = {
    altchaKey: KEY,
    secret: SECRET,
    headers: new Headers({ 'x-forwarded-for': IP }),
    now: new Date(),
    limits,
    save,
    ...overrides,
  }
  return { deps, store, save, limits }
}

describe('sending a suggestion', () => {
  it('stores it and leads to the confirmation page', async () => {
    const { deps, save, store } = dependencies()
    const sent = await form({ email: ' someone@example.org ', consent: 'yes' })
    expect(await handleSuggestion(sent, deps)).toEqual({ kind: 'sent' })
    expect(save).toHaveBeenCalledWith({
      url: 'https://www.example.org/jobs/123',
      kind: 'position',
      note: 'Seen on a mailing list.',
      email: 'someone@example.org',
      consentToContact: true,
      locale: 'en',
    })
    // A hashed address and the used answer, never the address itself.
    expect(store.rows).toHaveLength(2)
    expect(JSON.stringify(store.rows)).not.toContain(IP)
  })

  it('shows problems with the fields and keeps what was typed, storing nothing', async () => {
    const { deps, save, limits } = dependencies()
    const outcome = await handleSuggestion(
      await form({ url: 'javascript:alert(1)', email: 'someone@example.org' }),
      deps,
    )
    expect(outcome).toMatchObject({
      kind: 'invalid',
      status: 400,
      errors: { url: 'urlScheme', consent: 'consentMissing' },
      values: { url: 'javascript:alert(1)', email: 'someone@example.org', consent: false },
    })
    expect(save).not.toHaveBeenCalled()
    // A mistake in the form does not count against the address's limit.
    expect(limits).not.toHaveBeenCalled()
  })

  it('answers a filled-in hidden field as if it worked, and stores and counts nothing', async () => {
    const { deps, save, limits } = dependencies()
    const outcome = await handleSuggestion(
      await form({ reference_code: 'https://spam.example.com' }, { solve: false }),
      deps,
    )
    expect(outcome).toEqual({ kind: 'sent' })
    expect(save).not.toHaveBeenCalled()
    expect(limits).not.toHaveBeenCalled()
  })

  it('asks for JavaScript when the spam check was not run', async () => {
    const { deps, save } = dependencies()
    expect(await handleSuggestion(await form({}, { solve: false }), deps)).toMatchObject({
      kind: 'refused',
      status: 400,
      problem: 'needsJs',
      values: { url: 'https://www.example.org/jobs/123' },
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('refuses a wrong answer without counting it against the address', async () => {
    const { deps, limits } = dependencies()
    const wrong = await form({ altcha: Buffer.from('{"number":1}').toString('base64') })
    expect(await handleSuggestion(wrong, deps)).toMatchObject({
      kind: 'refused',
      status: 400,
      problem: 'spamCheck',
    })
    expect(limits).not.toHaveBeenCalled()
  })

  it('refuses a spam-check answer used before', async () => {
    const { deps, save } = dependencies()
    const sent = await form()
    expect(await handleSuggestion(sent, deps)).toEqual({ kind: 'sent' })
    expect(await handleSuggestion(sent, deps)).toMatchObject({
      kind: 'refused',
      status: 400,
      problem: 'spamCheck',
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('refuses the 6th suggestion within an hour from one address (429), not from another', async () => {
    const { deps, save } = dependencies()
    for (let i = 0; i < SUGGESTIONS_PER_WINDOW; i++) {
      expect(await handleSuggestion(await form(), deps)).toEqual({ kind: 'sent' })
    }
    expect(await handleSuggestion(await form(), deps)).toMatchObject({
      kind: 'refused',
      status: 429,
      problem: 'rateLimited',
    })
    const other = { ...deps, headers: new Headers({ 'x-forwarded-for': '198.51.100.1' }) }
    expect(await handleSuggestion(await form(), other)).toEqual({ kind: 'sent' })
    expect(save).toHaveBeenCalledTimes(SUGGESTIONS_PER_WINDOW + 1)
  })

  it('says the form is unavailable without the ALTCHA key or PAYLOAD_SECRET', async () => {
    for (const missing of [{ altchaKey: null }, { secret: '' }]) {
      const { deps, save } = dependencies(missing)
      expect(await handleSuggestion(await form(), deps)).toMatchObject({
        kind: 'refused',
        status: 503,
        problem: 'unavailable',
      })
      expect(save).not.toHaveBeenCalled()
    }
  })

  it('reports a database error with a reference and logs no personal data', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = Object.assign(
      new Error('insert failed: someone@example.org, https://www.example.org/jobs/123'),
      { code: '23505' },
    )
    const { deps } = dependencies({ save: vi.fn(async () => Promise.reject(failure)) })
    const outcome = await handleSuggestion(
      await form({ email: 'someone@example.org', consent: 'yes' }),
      deps,
    )
    expect(outcome).toMatchObject({ kind: 'failed', status: 500 })
    const reference = outcome.kind === 'failed' ? outcome.reference : ''
    expect(reference).toMatch(/^[0-9A-F]{10}$/)
    const logged = JSON.stringify(error.mock.calls)
    expect(logged).toContain(reference)
    expect(logged).toContain('23505')
    for (const personal of ['someone@example.org', 'example.org/jobs', IP]) {
      expect(logged).not.toContain(personal)
    }
  })

  it('logs the database code of an error wrapped by Drizzle, never the query’s values', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    // What Drizzle throws: its message quotes the query and its parameters; the code is on the
    // driver's error, its cause.
    const failure = Object.assign(
      new Error(
        'Failed query: insert into "submissions" … params: https://www.example.org/jobs/123,someone@example.org',
      ),
      { cause: Object.assign(new Error('invalid byte sequence'), { code: '22021' }) },
    )
    const { deps } = dependencies({ save: vi.fn(async () => Promise.reject(failure)) })
    const outcome = await handleSuggestion(
      await form({ email: 'someone@example.org', consent: 'yes' }),
      deps,
    )
    expect(outcome).toMatchObject({ kind: 'failed', status: 500 })
    const logged = JSON.stringify(error.mock.calls)
    expect(logged).toContain('22021')
    for (const personal of ['someone@example.org', 'example.org/jobs', 'Failed query', IP]) {
      expect(logged).not.toContain(personal)
    }
  })

  it('reports a failing rate-limit table the same way', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { deps, save } = dependencies({
      limits: vi.fn(async () => Promise.reject(new Error('connection refused'))),
    })
    expect(await handleSuggestion(await form(), deps)).toMatchObject({ kind: 'failed' })
    expect(save).not.toHaveBeenCalled()
  })
})

describe('links to the legal texts', () => {
  it('lead to headings that exist', () => {
    const pages: Record<string, string> = {
      '/en/legal/privacy/': renderContentFile('en/legal/privacy.md'),
      '/tr/legal/kvkk-aydinlatma-metni/': renderContentFile('tr/legal/kvkk-aydinlatma-metni.md'),
    }
    for (const link of Object.values(SUGGEST_LEGAL_LINKS)) {
      const [path = '', id] = link.split('#')
      expect(pages[path], link).toContain(`id="${id}"`)
    }
  })
})
