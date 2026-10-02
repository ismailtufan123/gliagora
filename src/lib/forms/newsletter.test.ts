import { randomInt } from 'node:crypto'

import { createChallenge } from 'altcha-lib/v1'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderContentFile } from '@/lib/markdown'
import { NEWSLETTER_LEGAL_LINKS } from '@/lib/newsletter/paths'

import en from '../../../messages/en.json'
import tr from '../../../messages/tr.json'
import { ALTCHA_MAX_NUMBER, ALTCHA_TTL_MS } from './altcha'
import { memoryLimitStore } from './memory-limit-store'
import { handleNewsletterSignup } from './newsletter'
import { type NewsletterData, parseNewsletter } from './newsletter-schema'
import { FORWARDED_ACTION_HEADER, type FormDependencies } from './public-form'
import {
  EMAILS_PER_ADDRESS,
  EMAILS_SITE_WIDE,
  NEWSLETTER_LIMIT,
  NEWSLETTER_WAIT_MS,
} from './rate-limit'
import { type SignInData, handleSignInRequest } from './sign-in'

// The Glia Notes signup form (src/lib/forms/newsletter.ts): what it accepts, its limits (its own
// per IP address, a minute between two emails to one address, and the budget it shares with the
// other forms that send an email), and the answers that are the same for every address.

const KEY = 'test-only-hmac-key-0123456789abcdef0123456789abcdef'
const T0 = new Date('2026-10-02T12:00:00.000Z')
const at = (ms: number) => new Date(T0.getTime() + ms)

async function form(email: string, { consent = true }: { consent?: boolean } = {}) {
  const number = randomInt(ALTCHA_MAX_NUMBER)
  const { algorithm, challenge, salt, signature } = await createChallenge({
    hmacKey: KEY,
    algorithm: 'SHA-256',
    number,
    maxnumber: ALTCHA_MAX_NUMBER,
    expires: new Date(T0.getTime() + ALTCHA_TTL_MS),
  })
  const data = new FormData()
  data.set('email', email)
  if (consent) data.set('consent', 'yes')
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

function dependencies(
  { ip = '203.0.113.9', store = memoryLimitStore(), now = T0, headers = {} } = {} as {
    ip?: string
    store?: ReturnType<typeof memoryLimitStore>
    now?: Date
    headers?: Record<string, string>
  },
) {
  const save = vi.fn(async (_data: NewsletterData): Promise<void | 'unavailable'> => {})
  const deps: FormDependencies<NewsletterData> = {
    altchaKey: KEY,
    secret: 'test-only-payload-secret',
    headers: new Headers({ 'x-forwarded-for': ip, ...headers }),
    now,
    limits: async () => store,
    save,
  }
  return { deps, save, store }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseNewsletter', () => {
  it('takes an address in its stored form, with the box ticked', () => {
    expect(parseNewsletter({ email: ' Reader@Example.ORG ', consent: true }, 'en')).toEqual({
      ok: true,
      data: { email: 'reader@example.org', locale: 'en' },
    })
    // The form's hidden field; anything else is read as English.
    expect(parseNewsletter({ email: 'a@example.org', consent: true }, 'xx')).toMatchObject({
      data: { locale: 'en' },
    })
  })

  it('names every problem at once', () => {
    expect(parseNewsletter({ email: '', consent: false }, 'en')).toEqual({
      ok: false,
      errors: { email: 'emailMissing', consent: 'consentMissing' },
    })
    expect(parseNewsletter({ email: 'no-at-sign', consent: true }, 'en')).toEqual({
      ok: false,
      errors: { email: 'emailInvalid' },
    })
    expect(
      parseNewsletter({ email: `${'a'.repeat(250)}@example.org`, consent: true }, 'en'),
    ).toEqual({ ok: false, errors: { email: 'emailTooLong' } })
  })
})

describe('handleNewsletterSignup', () => {
  it('takes a signup, counted per IP address, per address, site-wide and for the minute', async () => {
    const { deps, save, store } = dependencies()
    expect(await handleNewsletterSignup(await form('A@Example.org'), deps)).toEqual({
      kind: 'sent',
    })
    expect(save).toHaveBeenCalledWith({ email: 'a@example.org', locale: 'en' })
    const keys = store.rows.map((row) => row.key.split(':').slice(0, 2).join(':'))
    expect(keys).toEqual(
      expect.arrayContaining(['ip:newsletter', 'newsletter:wait', 'mail:addr', 'mail:all']),
    )
  })

  it('refuses a signup without the ticked box, and stores nothing', async () => {
    const { deps, save, store } = dependencies()
    expect(
      await handleNewsletterSignup(await form('a@example.org', { consent: false }), deps),
    ).toMatchObject({ kind: 'invalid', status: 400, errors: { consent: 'consentMissing' } })
    expect(save).not.toHaveBeenCalled()
    expect(store.rows).toEqual([])
  })

  it('waits a minute between two emails to one address, then its hourly budget', async () => {
    const store = memoryLimitStore()
    const send = async (ms: number, email = 'Wait.Here@example.org') =>
      handleNewsletterSignup(await form(email), dependencies({ store, now: at(ms) }).deps)
    expect(await send(0)).toEqual({ kind: 'sent' })
    // The same mailbox, written another way, within the minute.
    expect(await send(30_000, 'wait.here+news@example.org')).toMatchObject({
      kind: 'refused',
      status: 429,
      problem: 'wait',
    })
    expect(await send(NEWSLETTER_WAIT_MS - 1)).toMatchObject({ problem: 'wait' })
    expect(await send(NEWSLETTER_WAIT_MS)).toEqual({ kind: 'sent' })
    expect(await send(2 * NEWSLETTER_WAIT_MS)).toEqual({ kind: 'sent' })
    // Three emails an hour to one address, from every form that sends one.
    expect(EMAILS_PER_ADDRESS.hour).toBe(3)
    expect(await send(3 * NEWSLETTER_WAIT_MS)).toMatchObject({
      kind: 'refused',
      problem: 'rateLimited',
    })
    // Another address is not held up.
    expect(await send(30_000, 'other@example.org')).toEqual({ kind: 'sent' })
  })

  it('takes at most 20 signups an hour from one IP address (a campus network shares one)', async () => {
    expect(NEWSLETTER_LIMIT.perWindow).toBe(20)
    const store = memoryLimitStore()
    for (let i = 0; i < NEWSLETTER_LIMIT.perWindow; i++) {
      const { deps } = dependencies({ store })
      expect(await handleNewsletterSignup(await form(`n-${i}@example.org`), deps)).toEqual({
        kind: 'sent',
      })
    }
    const { deps, save } = dependencies({ store })
    expect(await handleNewsletterSignup(await form('n-last@example.org'), deps)).toMatchObject({
      kind: 'refused',
      status: 429,
      problem: 'rateLimited',
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('shares the budget of an address with the other forms that send an email', async () => {
    const store = memoryLimitStore()
    for (let i = 0; i < EMAILS_PER_ADDRESS.hour; i++) {
      const { deps } = dependencies({ ip: `198.51.100.${i}`, store })
      const signIn = deps as unknown as FormDependencies<SignInData>
      expect(await handleSignInRequest(await form(`shared+${i}@example.org`), signIn)).toEqual({
        kind: 'sent',
      })
    }
    const { deps, save } = dependencies({ ip: '198.51.100.99', store })
    expect(await handleNewsletterSignup(await form('Shared@example.org'), deps)).toMatchObject({
      kind: 'refused',
      problem: 'rateLimited',
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('says "temporarily unavailable" at the site-wide cap, or when the email was not sent', async () => {
    const store = memoryLimitStore()
    for (let i = 0; i < EMAILS_SITE_WIDE.hour; i++) {
      store.rows.push({ key: 'mail:all', at: T0.getTime() })
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const capped = dependencies({ store })
    expect(await handleNewsletterSignup(await form('a@example.org'), capped.deps)).toMatchObject({
      kind: 'refused',
      status: 503,
      problem: 'unavailable',
    })
    expect(capped.save).not.toHaveBeenCalled()

    const { deps } = dependencies()
    deps.save = async () => 'unavailable'
    expect(await handleNewsletterSignup(await form('b@example.org'), deps)).toMatchObject({
      kind: 'refused',
      status: 503,
      problem: 'unavailable',
      values: { email: 'b@example.org', consent: true },
    })
  })

  it('answers a filled-in hidden field as if it worked, and records nothing', async () => {
    const { deps, save, store } = dependencies()
    const sent = await form('a@example.org')
    sent.set('reference_code', 'spam')
    expect(await handleNewsletterSignup(sent, deps)).toEqual({ kind: 'sent' })
    expect(save).not.toHaveBeenCalled()
    expect(store.rows).toEqual([])
  })

  it('refuses a call Next.js forwarded from another page, and is off without the spam check', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const forwarded = dependencies({ headers: { [FORWARDED_ACTION_HEADER]: '1' } })
    expect(await handleNewsletterSignup(await form('a@example.org'), forwarded.deps)).toMatchObject(
      { kind: 'refused', problem: 'spamCheck' },
    )
    const off = dependencies()
    off.deps.altchaKey = null
    expect(await handleNewsletterSignup(await form('a@example.org'), off.deps)).toMatchObject({
      kind: 'refused',
      status: 503,
      problem: 'unavailable',
    })
    expect(forwarded.save).not.toHaveBeenCalled()
    expect(off.store.rows).toEqual([])
  })
})

describe('the signup’s texts', () => {
  it('ask for consent in the words of the account’s Glia Notes setting', () => {
    expect(en.newsletter.consent.label).toBe('I agree to receive Glia Notes by email.')
    expect(en.newsletter.consent.label).toBe(en.account.digest.consent)
    expect(tr.newsletter.consent.label).toBe(tr.account.digest.consent)
    expect(en.newsletter.consent.hint).toContain('16 or older')
    expect(en.newsletter.submit).toBe('Get the monthly digest')
  })

  it('link to headings of the legal texts that exist', () => {
    const pages: Record<string, string> = {
      '/en/legal/privacy/': renderContentFile('en/legal/privacy.md'),
      '/tr/legal/kvkk-aydinlatma-metni/': renderContentFile('tr/legal/kvkk-aydinlatma-metni.md'),
    }
    for (const link of Object.values(NEWSLETTER_LEGAL_LINKS)) {
      const [path = '', id] = link.split('#')
      if (!id) {
        expect(path).toBe('/tr/legal/acik-riza-metni/')
        continue
      }
      expect(pages[path], link).toContain(`id="${id}"`)
    }
  })
})
