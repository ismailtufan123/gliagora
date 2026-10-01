import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EmailTokenRecord } from '@/lib/members/store'

import {
  type Confirmation,
  type ConfirmationDeps,
  handleConfirmation,
  pendingRequest,
} from './confirm'

// Confirming a data request (src/lib/data-requests/confirm.ts): the route's checks and answers,
// and what it reads of a link. The confirmation itself (the deletion, the record, the log, in one
// transaction) is tested against PostgreSQL in tests/integration/data-requests.db.test.ts, and end
// to end in tests/e2e/data-requests.spec.ts.

const ORIGIN = 'http://localhost:3000'
const ENV = { SERVER_URL: '', PAYLOAD_JOBS_AUTORUN: 'false' }
const TOKEN = 'a'.repeat(43)

function fakes(result: Confirmation | null | Error) {
  return {
    env: ENV,
    confirm: vi.fn(async () => {
      if (result instanceof Error) throw result
      return result
    }),
  } satisfies ConfirmationDeps
}

function post(token: string | null = TOKEN, headers: Record<string, string> = { origin: ORIGIN }) {
  const body = new URLSearchParams()
  if (token !== null) body.set('token', token)
  return new Request(`${ORIGIN}/en/legal/data-requests/confirm/use/`, {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      'content-type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body,
  })
}

const NONE = {
  suggestionsDeleted: 0,
  accountDeleted: 0,
  newsletterRemoved: 0,
  reportAddressesCleared: 0,
  personalRightsReportsKept: 0,
} as const

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the confirmation route', () => {
  it('refuses posts from other sites, and posts that do not say where they come from', async () => {
    for (const headers of [
      { origin: 'https://evil.example' },
      { origin: 'null' },
      {},
      { 'sec-fetch-site': 'cross-site', origin: ORIGIN },
      { 'sec-fetch-site': 'same-site', origin: ORIGIN },
    ] as Record<string, string>[]) {
      const deps = fakes({ kind: 'registered' })
      const response = await handleConfirmation(post(TOKEN, headers), deps)
      expect(response.status, JSON.stringify(headers)).toBe(403)
      expect(deps.confirm).not.toHaveBeenCalled()
    }
  })

  it('leads a deletion to done/ and any other request to received/, with relative 303s', async () => {
    const deleted = fakes({ kind: 'deleted', outcome: { ...NONE, accountDeleted: 1 } })
    const response = await handleConfirmation(post(), deleted)
    expect(deleted.confirm).toHaveBeenCalledWith(TOKEN)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/en/legal/data-requests/done/')
    expect(response.headers.get('cache-control')).toBe('no-store')

    const registered = await handleConfirmation(
      post(TOKEN, { 'sec-fetch-site': 'same-origin' }),
      fakes({ kind: 'registered' }),
    )
    expect(registered.status).toBe(303)
    expect(registered.headers.get('location')).toBe('/en/legal/data-requests/received/')
  })

  it('leads an unknown, used or expired link to the link page without it, which says so', async () => {
    for (const token of [TOKEN, 'not-a-token', null]) {
      const response = await handleConfirmation(post(token), fakes(null))
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe('/en/legal/data-requests/confirm/')
    }
  })

  it('leads a failure back to the link, which still works, with a reference and no details', async () => {
    const failure = Object.assign(new Error('Key (email)=(someone@example.org) is wrong'), {
      code: '23514',
    })
    const response = await handleConfirmation(post(), fakes(failure))
    expect(response.status).toBe(303)
    const location = response.headers.get('location')!
    expect(location).toMatch(
      new RegExp(
        `^/en/legal/data-requests/confirm/\\?token=${TOKEN}&error=failed&ref=[0-9A-F]{10}#outcome$`,
      ),
    )
    const logged = vi.mocked(console.error).mock.calls.flat().join(' ')
    expect(logged).toContain(location.match(/ref=([0-9A-F]{10})/)![1])
    expect(logged).not.toContain('someone@example.org')
    expect(logged).not.toContain(TOKEN)
  })

  it('never puts a malformed token back into the address', async () => {
    const response = await handleConfirmation(post('<script>'), fakes(new Error('x')))
    expect(response.headers.get('location')).toMatch(
      /^\/en\/legal\/data-requests\/confirm\/\?error=failed&ref=[0-9A-F]{10}#outcome$/,
    )
  })
})

describe('pendingRequest', () => {
  const link = (overrides: Partial<EmailTokenRecord> = {}): EmailTokenRecord => ({
    purpose: 'data-request',
    email: 'someone@example.org',
    memberId: null,
    browserHash: null,
    requestId: 1,
    next: null,
    save: null,
    locale: 'en',
    requestData: { kind: 'access', name: 'Ada', details: 'A copy, please.' },
    expiresAt: new Date(),
    ...overrides,
  })

  it('reads what the form said', () => {
    expect(pendingRequest(link())).toEqual({
      kind: 'access',
      name: 'Ada',
      details: 'A copy, please.',
    })
    expect(
      pendingRequest(link({ requestData: { kind: 'deletion', name: null, details: null } })),
    ).toEqual({ kind: 'deletion', name: null, details: null })
  })

  it('is null for another kind of link, or one it cannot read', () => {
    expect(pendingRequest(null)).toBeNull()
    expect(pendingRequest(link({ purpose: 'sign-in' }))).toBeNull()
    expect(pendingRequest(link({ requestData: null }))).toBeNull()
    expect(pendingRequest(link({ requestData: { kind: 'delete' } }))).toBeNull()
  })
})
