import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type AccountDeletionDeps, handleAccountDeletion } from './account-deletion'
import type { MemberRecord } from './store'

// "Delete my account" (src/lib/members/account-deletion.ts): the route's checks and answers. The
// deletion itself (the record, the member, the log, in one transaction) is tested against
// PostgreSQL in tests/integration/members.db.test.ts, and end to end in
// tests/e2e/account-delete.spec.ts.

const ORIGIN = 'http://localhost:3000'
const ENV = { SERVER_URL: '', PAYLOAD_JOBS_AUTORUN: 'false' }
const NOW = new Date('2026-10-01T09:00:00Z')

const member: MemberRecord = {
  id: 7,
  email: 'member@example.org',
  emailVerifiedAt: NOW,
  emailVerifiedBy: 'link',
  googleId: null,
  orcidId: null,
  displayName: null,
  digestOptIn: false,
  digestChangedAt: null,
  digestConsentVersion: null,
  lastSeenAt: NOW,
  deletionWarnedAt: null,
  warningRefusedAt: null,
  createdAt: NOW,
}

function fakes(signedIn: MemberRecord | null = member, deleted = true) {
  return {
    now: NOW,
    env: ENV,
    member: vi.fn(async () => signedIn),
    deleteAccount: vi.fn(async () => deleted),
  } satisfies AccountDeletionDeps
}

function post(headers: Record<string, string> = { origin: ORIGIN }) {
  return new Request(`${ORIGIN}/en/account/privacy/delete/use/`, {
    method: 'POST',
    headers: { host: 'localhost:3000', ...headers },
  })
}

const cookiesOf = (response: Response) => response.headers.getSetCookie()

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the account deletion route', () => {
  it('refuses posts from other sites, and posts that do not say where they come from', async () => {
    for (const headers of [
      { origin: 'https://example.org' },
      { origin: 'null' },
      { origin: ORIGIN, 'sec-fetch-site': 'cross-site' },
      { origin: ORIGIN, 'sec-fetch-site': 'same-site' },
      {},
    ] as Record<string, string>[]) {
      const deps = fakes()
      const response = await handleAccountDeletion(post(headers), deps)
      expect(response.status, JSON.stringify(headers)).toBe(403)
      expect(deps.deleteAccount).not.toHaveBeenCalled()
    }
  })

  it('sends a visitor who is signed out to the privacy page with a message, deleting nothing', async () => {
    // A second press after the deletion: the session is gone, and the cookie with it.
    const deps = fakes(null)
    const response = await handleAccountDeletion(post(), deps)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/en/account/privacy/?done=not-signed-in#outcome')
    expect(cookiesOf(response)).toEqual([
      '__Host-gliagora-session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
      '__Host-gliagora-signin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
    ])
    expect(deps.deleteAccount).not.toHaveBeenCalled()
  })

  it('deletes the account, clears both cookies and says so', async () => {
    const deps = fakes()
    const response = await handleAccountDeletion(
      post({ origin: ORIGIN, 'sec-fetch-site': 'same-origin' }),
      deps,
    )
    expect(deps.deleteAccount).toHaveBeenCalledWith(member)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/en/account/deleted/')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(cookiesOf(response)).toEqual([
      '__Host-gliagora-session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
      '__Host-gliagora-signin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
    ])
  })

  it('ends at the same page when the account went while the request waited (two presses at once)', async () => {
    const response = await handleAccountDeletion(post(), fakes(member, false))
    expect(response.headers.get('location')).toBe('/en/account/deleted/')
    expect(cookiesOf(response)).toHaveLength(2)
  })

  it('keeps everything and leads back with a reference when the deletion fails', async () => {
    const deps = fakes()
    deps.deleteAccount.mockRejectedValueOnce(new Error('member@example.org'))
    const response = await handleAccountDeletion(post(), deps)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toMatch(
      /^\/en\/account\/privacy\/delete\/\?error=failed&ref=[0-9A-F]{10}#outcome$/,
    )
    expect(cookiesOf(response)).toEqual([])
    const logged = vi.mocked(console.error).mock.calls.flat().join(' ')
    expect(logged).not.toContain('member@example.org')
  })
})
