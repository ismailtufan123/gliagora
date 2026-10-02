import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { memoryLimitStore } from '@/lib/forms/memory-limit-store'
import { EMAILS_SITE_WIDE, NEWSLETTER_LIMIT, NEWSLETTER_WAIT_MS } from '@/lib/forms/rate-limit'

import { type InboxState, newInbox, openInbox, sealInbox } from './cookie'
import { type ResendDependencies, handleResend } from './resend'

// "Send it again" on "Check your inbox" (src/lib/newsletter/resend.ts): only from the site's own
// pages, only to the address in the sealed cookie, once a minute, within the form's limits.

const ORIGIN = 'http://localhost:3000'
const ENV = { SERVER_URL: '', PAYLOAD_JOBS_AUTORUN: 'false' }
const SECRET = 'test-only-payload-secret'
const T0 = new Date('2026-10-02T12:00:00.000Z')
const at = (ms: number) => new Date(T0.getTime() + ms)
const INBOX: InboxState = newInbox({ email: 'reader@example.org', locale: 'en' }, T0)

function fakes({
  now = at(NEWSLETTER_WAIT_MS),
  inbox = INBOX as InboxState | null,
  store = memoryLimitStore(),
  on = true,
}: Partial<{
  now: Date
  inbox: InboxState | null
  store: ReturnType<typeof memoryLimitStore>
  on: boolean
}> = {}) {
  const send = vi.fn(async (_inbox: InboxState): Promise<void | 'unavailable'> => {})
  const deps: ResendDependencies = {
    env: ENV,
    now,
    secret: SECRET,
    cookie: inbox ? sealInbox(inbox, SECRET) : undefined,
    on,
    limits: async () => store,
    send,
  }
  return { deps, send, store }
}

function post(
  headers: Record<string, string> = { 'sec-fetch-site': 'same-origin' },
  ip = '203.0.113.7',
) {
  return new Request(`${ORIGIN}/en/newsletter/resend/`, {
    method: 'POST',
    headers: { host: 'localhost:3000', 'x-forwarded-for': ip, ...headers },
  })
}

const location = (response: Response) => response.headers.get('location')

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleResend', () => {
  it('refuses posts from other sites', async () => {
    for (const headers of [
      { origin: 'https://evil.example' },
      {},
      { 'sec-fetch-site': 'cross-site' },
    ] as Record<string, string>[]) {
      const { deps, send } = fakes()
      expect((await handleResend(post(headers), deps)).status).toBe(403)
      expect(send).not.toHaveBeenCalled()
    }
  })

  it('sends a new link to the cookie’s address, with the form’s consent, and keeps the cookie’s hour', async () => {
    const { deps, send, store } = fakes()
    const response = await handleResend(post(), deps)
    expect(response.status).toBe(303)
    expect(location(response)).toBe('/en/newsletter/check-your-inbox/?done=resent#outcome')
    // The consent the form gave (its time and the text's version) goes with the new link.
    expect(send).toHaveBeenCalledWith(INBOX)
    expect(send.mock.calls[0]![0].requested).toEqual({ at: T0, version: INBOX.requested.version })
    const cookie = response.headers.get('set-cookie')!
    // A minute after the form: 59 minutes left of its hour, not a new hour.
    expect(cookie).toMatch(
      /^__Host-gliagora-newsletter=v1\.[^;]+; Path=\/; Max-Age=3540; HttpOnly; Secure; SameSite=Lax$/,
    )
    const sealed = cookie.split(';')[0]!.split('=')[1]
    expect(openInbox(sealed, SECRET, deps.now)).toEqual({ ...INBOX, sentAt: deps.now })
    expect(openInbox(sealed, SECRET, at(60 * 60_000))).toBeNull()
    const keys = store.rows.map((row) => row.key.split(':').slice(0, 2).join(':'))
    expect(keys).toEqual(
      expect.arrayContaining(['ip:newsletter', 'newsletter:wait', 'mail:addr', 'mail:all']),
    )
  })

  it('waits a minute after the last email, by the cookie and by the address’s limit', async () => {
    const early = fakes({ now: at(NEWSLETTER_WAIT_MS - 1) })
    expect(location(await handleResend(post(), early.deps))).toBe(
      '/en/newsletter/check-your-inbox/?error=wait#outcome',
    )
    expect(early.send).not.toHaveBeenCalled()
    expect(early.store.rows).toEqual([])

    // An older cookie (another tab) does not get round the address's own minute.
    const store = memoryLimitStore()
    const first = fakes({ store })
    expect(location(await handleResend(post(), first.deps))).toContain('done=resent')
    const second = fakes({ store, now: at(NEWSLETTER_WAIT_MS + 30_000) })
    expect(location(await handleResend(post(), second.deps))).toBe(
      '/en/newsletter/check-your-inbox/?error=wait#outcome',
    )
    expect(second.send).not.toHaveBeenCalled()
  })

  it('counts with the form against the limit per IP address', async () => {
    const store = memoryLimitStore()
    // As many sends from this IP address as the form allows, to other addresses: its limit is reached.
    const { deps: first } = fakes({ store, inbox: { ...INBOX, email: 'one@example.org' } })
    for (let i = 0; i < NEWSLETTER_LIMIT.perWindow; i++) {
      const { deps } = fakes({
        store,
        inbox: { ...INBOX, email: `n-${i}@example.org` },
      })
      expect(location(await handleResend(post(), deps)), String(i)).toContain('done=resent')
    }
    expect(location(await handleResend(post(), first))).toBe(
      '/en/newsletter/check-your-inbox/?error=limited#outcome',
    )
  })

  it('says "temporarily unavailable" when off, at the site-wide cap, or when no email went', async () => {
    const off = fakes({ on: false })
    expect(location(await handleResend(post(), off.deps))).toContain('error=unavailable')
    expect(off.send).not.toHaveBeenCalled()

    const store = memoryLimitStore()
    for (let i = 0; i < EMAILS_SITE_WIDE.hour; i++)
      store.rows.push({ key: 'mail:all', at: T0.getTime() })
    const capped = fakes({ store })
    expect(location(await handleResend(post(), capped.deps))).toContain('error=unavailable')
    expect(capped.send).not.toHaveBeenCalled()

    const unsent = fakes()
    unsent.send.mockResolvedValue('unavailable')
    const response = await handleResend(post(), unsent.deps)
    expect(location(response)).toContain('error=unavailable')
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('without the cookie, leads to the page, which then shows its general text', async () => {
    const { deps, send } = fakes({ inbox: null })
    expect(location(await handleResend(post(), deps))).toBe('/en/newsletter/check-your-inbox/')
    expect(send).not.toHaveBeenCalled()
    const expired = fakes({ now: at(61 * 60_000) })
    expect(location(await handleResend(post(), expired.deps))).toBe(
      '/en/newsletter/check-your-inbox/',
    )
  })

  it('logs a failure with a reference and its class, never the address', async () => {
    const { deps, send } = fakes()
    send.mockRejectedValue(new Error('reader@example.org: not stored'))
    const response = await handleResend(post(), deps)
    expect(location(response)).toMatch(
      /^\/en\/newsletter\/check-your-inbox\/\?error=failed&ref=[0-9A-F]{10}#outcome$/,
    )
    const logged = vi.mocked(console.error).mock.calls.flat().join(' ')
    expect(logged).toMatch(/reference [0-9A-F]{10}\): Error$/)
    expect(logged).not.toContain('reader@example.org')
  })
})
