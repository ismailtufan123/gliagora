import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Delivery } from '@/lib/email/deliver'
import type { EmailTokenRecord } from '@/lib/members/store'

import en from '../../../messages/en.json'
import tr from '../../../messages/tr.json'

import {
  type ConfirmDependencies,
  type Confirmed,
  handleConfirmation,
  pendingSignup,
} from './confirm'

// Confirming a Glia Notes signup (src/lib/newsletter/confirm.ts): the route's checks and answers,
// and what it reads of a link. The confirmation itself (the link, listmonk, the consent records,
// in one transaction) runs against PostgreSQL and a real listmonk in
// tests/integration/newsletter.db.test.ts, and end to end in tests/e2e/newsletter.spec.ts.

const ORIGIN = 'http://localhost:3000'
const ENV = { SERVER_URL: '', PAYLOAD_JOBS_AUTORUN: 'false' }
const TOKEN = 'a'.repeat(43)
const CONFIRMED: Confirmed = {
  email: 'reader@example.org',
  locale: 'en',
  id: 7,
  uuid: '0b2c6f8e-3f0a-4c1e-9d55-6f1d2a7b8c9d',
}

function fakes(result: Confirmed | null | Error, { on = true } = {}) {
  const confirm = vi.fn(async () => {
    if (result instanceof Error) throw result
    return result
  })
  return {
    env: ENV,
    confirm: on ? confirm : null,
    welcome: vi.fn(async (_confirmed: Confirmed): Promise<Delivery> => 'sent'),
    calls: confirm,
  } satisfies ConfirmDependencies & { calls: unknown }
}

function post(token: string | null = TOKEN, headers: Record<string, string> = { origin: ORIGIN }) {
  const body = new URLSearchParams()
  if (token !== null) body.set('token', token)
  return new Request(`${ORIGIN}/en/newsletter/confirm/use/`, {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      'content-type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body,
  })
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the newsletter confirmation route', () => {
  it('refuses posts from other sites, and posts that do not say where they come from', async () => {
    for (const headers of [
      { origin: 'https://evil.example' },
      { origin: 'null' },
      {},
      { 'sec-fetch-site': 'cross-site', origin: ORIGIN },
    ] as Record<string, string>[]) {
      const deps = fakes(CONFIRMED)
      const response = await handleConfirmation(post(TOKEN, headers), deps)
      expect(response.status, JSON.stringify(headers)).toBe(403)
      expect(deps.calls).not.toHaveBeenCalled()
      expect(deps.welcome).not.toHaveBeenCalled()
    }
  })

  it('confirms, sends the welcome email and leads to confirmed/', async () => {
    const deps = fakes(CONFIRMED)
    const response = await handleConfirmation(post(), deps)
    expect(deps.calls).toHaveBeenCalledWith(TOKEN)
    expect(deps.welcome).toHaveBeenCalledWith(CONFIRMED)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/en/newsletter/confirmed/')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('keeps the subscription when the welcome email fails, logging its class only', async () => {
    const deps = fakes(CONFIRMED)
    deps.welcome.mockRejectedValue(new Error('550 <reader@example.org> no such user'))
    const response = await handleConfirmation(post(), deps)
    expect(response.headers.get('location')).toBe('/en/newsletter/confirmed/')
    const logged = vi.mocked(console.error).mock.calls.flat().join(' ')
    expect(logged).toContain('welcome email not sent: Error')
    expect(logged).not.toContain('reader@example.org')
    for (const result of ['refused', 'unavailable'] as const) {
      const unsent = fakes(CONFIRMED)
      unsent.welcome.mockResolvedValue(result)
      const answer = await handleConfirmation(post(), unsent)
      expect(answer.headers.get('location')).toBe('/en/newsletter/confirmed/')
    }
  })

  it('never says on "confirmed" that the welcome email was sent: it may not have been', () => {
    // The page is the same whatever became of the welcome email (refused, or still on its way).
    expect(en.newsletter.confirmed.welcome).not.toMatch(/have sent|sent you/i)
    expect(en.newsletter.confirmed.welcome).toMatch(/If it does not arrive/)
    expect(tr.newsletter.confirmed.welcome).not.toMatch(/gönderdik/)
  })

  it('leads an unknown, used or expired link to the link page without it, which says so', async () => {
    for (const token of [TOKEN, 'not-a-token', null]) {
      const deps = fakes(null)
      const response = await handleConfirmation(post(token), deps)
      expect(response.headers.get('location')).toBe('/en/newsletter/confirm/')
      expect(deps.welcome).not.toHaveBeenCalled()
    }
  })

  it('leads a failure back to the link, which still works, with a reference and no details', async () => {
    const failure = Object.assign(new Error('listmonk said reader@example.org'), { code: 'x' })
    const response = await handleConfirmation(post(), fakes(failure))
    const location = response.headers.get('location')!
    expect(location).toMatch(
      new RegExp(
        `^/en/newsletter/confirm/\\?token=${TOKEN}&error=failed&ref=[0-9A-F]{10}#outcome$`,
      ),
    )
    const logged = vi.mocked(console.error).mock.calls.flat().join(' ')
    expect(logged).toContain(location.match(/ref=([0-9A-F]{10})/)![1])
    expect(logged).not.toContain('reader@example.org')
    expect(logged).not.toContain(TOKEN)
    // A malformed token never goes back into the address.
    const odd = await handleConfirmation(post('<script>'), fakes(new Error('x')))
    expect(odd.headers.get('location')).toMatch(
      /^\/en\/newsletter\/confirm\/\?error=failed&ref=[0-9A-F]{10}#outcome$/,
    )
  })

  it('says "temporarily unavailable" while the newsletter is off, and uses nothing', async () => {
    const deps = fakes(CONFIRMED, { on: false })
    const response = await handleConfirmation(post(), deps)
    expect(response.headers.get('location')).toBe(
      `/en/newsletter/confirm/?token=${TOKEN}&error=unavailable#outcome`,
    )
    expect(deps.calls).not.toHaveBeenCalled()
  })
})

describe('pendingSignup', () => {
  const link = (overrides: Partial<EmailTokenRecord> = {}): EmailTokenRecord => ({
    purpose: 'newsletter',
    email: 'reader@example.org',
    memberId: null,
    browserHash: null,
    requestId: null,
    next: null,
    save: null,
    locale: 'en',
    requestData: {
      version: '2026-09-27',
      source: 'newsletter-form',
      requestedAt: '2026-10-02T10:00:00.000Z',
    },
    expiresAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  })

  it('reads the consent version, the form and its time, of a newsletter link only', () => {
    expect(pendingSignup(link())).toEqual({
      version: '2026-09-27',
      source: 'newsletter-form',
      requestedAt: '2026-10-02T10:00:00.000Z',
    })
    expect(pendingSignup(link({ purpose: 'data-request' }))).toBeNull()
    expect(pendingSignup(null)).toBeNull()
    const requestedAt = '2026-10-02T10:00:00.000Z'
    for (const requestData of [
      { version: 'a@b.org', source: 'newsletter-form', requestedAt },
      { version: '2026-09-27', source: 'newsletter-form' },
      { version: '2026-09-27', source: 'newsletter-form', requestedAt: 'yesterday' },
      { version: '2026-09-27', source: 'newsletter-form', requestedAt, name: 'Reader' },
      null,
    ]) {
      expect(pendingSignup(link({ requestData })), JSON.stringify(requestData)).toBeNull()
    }
  })
})
