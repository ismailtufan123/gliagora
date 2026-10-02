import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MemberCookie } from './cookies'
import {
  CONSENT_GIVEN,
  type SettingsDeps,
  handleSettings,
  readDisplayName,
  readSubfields,
} from './settings'
import type { MemberRecord } from './store'

// The account's settings (src/lib/members/settings.ts): Glia Notes, the preferred subfields, the
// display name and removing a way to sign in, each answered with a 303 to the account page and an
// outcome. The database is replaced by recording fakes.

const ORIGIN = 'http://localhost:3000'
const ENV = { SERVER_URL: '', PAYLOAD_JOBS_AUTORUN: 'false' }
const TOKEN = 't'.repeat(43)
const CONSENT_VERSION = '2026-09-27'

const member = (changes: Partial<MemberRecord> = {}): MemberRecord => ({
  id: 7,
  email: 'member@example.org',
  emailVerifiedAt: new Date('2026-09-30T10:00:00Z'),
  emailVerifiedBy: 'link',
  googleId: null,
  orcidId: null,
  displayName: null,
  digestOptIn: false,
  digestChangedAt: null,
  digestConsentVersion: null,
  digestConsentSource: null,
  digestRequestedAt: null,
  digestSyncedAt: null,
  digestSubscriber: null,
  digestAdoptCheckAt: null,
  lastSeenAt: new Date('2026-10-01T08:00:00Z'),
  deletionWarnedAt: null,
  warningRefusedAt: null,
  createdAt: new Date('2026-09-30T10:00:00Z'),
  ...changes,
})

const COOKIE: MemberCookie = {
  name: '__Host-gliagora-session',
  value: 'n'.repeat(43),
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 60,
}

function fakes(signedIn: MemberRecord | null = member()) {
  return {
    now: new Date('2026-10-01T09:00:00Z'),
    consentVersion: CONSENT_VERSION,
    env: ENV,
    session: vi.fn(async () => signedIn && { member: signedIn, token: TOKEN }),
    setDigest: vi.fn(async (_id: number, choice: { optIn: boolean }) =>
      choice.optIn ? signedIn?.email != null : true,
    ),
    syncDigest: vi.fn(),
    setSubfields: vi.fn(async (_id: number, slugs: string[]) => slugs.length),
    setName: vi.fn(async () => true),
    unlink: vi.fn(async (): Promise<Awaited<ReturnType<SettingsDeps['unlink']>>> => ({
      kind: 'done',
      changed: true,
    })),
    rotate: vi.fn(async () => ({ cookie: COOKIE, othersEnded: 2 })),
  } satisfies SettingsDeps
}

function post(fields: [string, string][], headers: Record<string, string> = { origin: ORIGIN }) {
  const body = new URLSearchParams(fields)
  return new Request(`${ORIGIN}/en/account/settings/`, {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      'content-type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body,
  })
}

const location = (response: Response) => response.headers.get('location')

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the settings route', () => {
  it('refuses posts from other sites, and does nothing without a session', async () => {
    const deps = fakes()
    for (const headers of [{ origin: 'https://example.org' }, { origin: 'null' }, {}] as Record<
      string,
      string
    >[]) {
      const response = await handleSettings(post([['intent', 'name']], headers), deps)
      expect(response.status).toBe(403)
    }
    const signedOut = fakes(null)
    const response = await handleSettings(
      post([
        ['intent', 'digest'],
        ['digest', 'off'],
      ]),
      signedOut,
    )
    expect(response.status).toBe(303)
    expect(location(response)).toBe('/en/account/')
    expect(signedOut.setDigest).not.toHaveBeenCalled()
  })

  it('answers an unknown intent with a failure, changing nothing', async () => {
    const deps = fakes()
    const response = await handleSettings(post([['intent', 'merge']]), deps)
    expect(location(response)).toBe('/en/account/?error=failed#outcome')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})

describe('Glia Notes', () => {
  it('switches on only with the consent box ticked, recording the consent text’s date', async () => {
    const deps = fakes()
    const without = await handleSettings(
      post([
        ['intent', 'digest'],
        ['digest', 'on'],
      ]),
      deps,
    )
    expect(location(without)).toBe('/en/account/?error=digest-consent#outcome')
    const wrong = await handleSettings(
      post([
        ['intent', 'digest'],
        ['digest', 'on'],
        ['consent', 'on'],
      ]),
      deps,
    )
    expect(location(wrong)).toBe('/en/account/?error=digest-consent#outcome')
    expect(deps.setDigest).not.toHaveBeenCalled()

    const ticked = await handleSettings(
      post([
        ['intent', 'digest'],
        ['digest', 'on'],
        ['consent', CONSENT_GIVEN],
      ]),
      deps,
    )
    expect(location(ticked)).toBe('/en/account/?done=digest-on#outcome')
    expect(deps.setDigest).toHaveBeenCalledWith(7, { optIn: true, version: CONSENT_VERSION })
    // The stored choice goes to listmonk once right after the answer (M2), and only then.
    expect(deps.syncDigest).toHaveBeenCalledTimes(1)
    expect(deps.syncDigest).toHaveBeenCalledWith(7)
  })

  it('needs an email address', async () => {
    const deps = fakes(
      member({ email: null, emailVerifiedAt: null, orcidId: '9999-0000-0000-0027' }),
    )
    const response = await handleSettings(
      post([
        ['intent', 'digest'],
        ['digest', 'on'],
        ['consent', CONSENT_GIVEN],
      ]),
      deps,
    )
    expect(location(response)).toBe('/en/account/?error=digest-needs-email#outcome')
    expect(deps.setDigest).not.toHaveBeenCalled()
    expect(deps.syncDigest).not.toHaveBeenCalled()
  })

  it('tries no sync when the choice was not stored', async () => {
    const deps = fakes()
    deps.setDigest.mockResolvedValue(false)
    const response = await handleSettings(
      post([
        ['intent', 'digest'],
        ['digest', 'on'],
        ['consent', CONSENT_GIVEN],
      ]),
      deps,
    )
    expect(location(response)).toBe('/en/account/?error=digest-needs-email#outcome')
    expect(deps.syncDigest).not.toHaveBeenCalled()
  })

  it('switches off in one press, without the box', async () => {
    const deps = fakes(member({ digestOptIn: true }))
    const response = await handleSettings(
      post([
        ['intent', 'digest'],
        ['digest', 'off'],
      ]),
      deps,
    )
    expect(location(response)).toBe('/en/account/?done=digest-off#outcome')
    expect(deps.setDigest).toHaveBeenCalledWith(7, { optIn: false })
    expect(deps.syncDigest).toHaveBeenCalledWith(7)
  })
})

describe('preferred subfields', () => {
  const ticked = (...slugs: string[]) => [
    ['intent', 'subfields'] as [string, string],
    ...slugs.map((slug) => ['subfield', slug] as [string, string]),
  ]

  it('stores the ticked subfields, each once', async () => {
    const deps = fakes()
    const response = await handleSettings(post(ticked('glia', 'cognitive', 'glia')), deps)
    expect(location(response)).toBe('/en/account/?done=subfields-saved#outcome')
    expect(deps.setSubfields).toHaveBeenCalledWith(7, ['glia', 'cognitive'])
  })

  it('removes them all when no box is ticked', async () => {
    const deps = fakes()
    const response = await handleSettings(post(ticked()), deps)
    expect(location(response)).toBe('/en/account/?done=subfields-removed#outcome')
    expect(deps.setSubfields).toHaveBeenCalledWith(7, [])
  })

  it('refuses more than 12, and values no box sends', async () => {
    const deps = fakes()
    const thirteen = Array.from({ length: 13 }, (_, i) => `subfield-${i}`)
    expect(location(await handleSettings(post(ticked(...thirteen)), deps))).toBe(
      '/en/account/?error=subfields-too-many#outcome',
    )
    expect(location(await handleSettings(post(ticked('Glia!')), deps))).toBe(
      '/en/account/?error=failed#outcome',
    )
    expect(deps.setSubfields).not.toHaveBeenCalled()
  })
})

describe('display name', () => {
  it('saves a name, and removes it when the field is empty', async () => {
    const deps = fakes()
    const saved = await handleSettings(
      post([
        ['intent', 'name'],
        ['displayName', '  Ayşe   Yılmaz '],
      ]),
      deps,
    )
    expect(location(saved)).toBe('/en/account/?done=name-saved#outcome')
    expect(deps.setName).toHaveBeenLastCalledWith(7, 'Ayşe Yılmaz')
    const removed = await handleSettings(
      post([
        ['intent', 'name'],
        ['displayName', '   '],
      ]),
      deps,
    )
    expect(location(removed)).toBe('/en/account/?done=name-removed#outcome')
    expect(deps.setName).toHaveBeenLastCalledWith(7, null)
  })

  it('refuses a name that is too long or has control characters', async () => {
    const deps = fakes()
    for (const name of ['a'.repeat(81), 'Bell\u0007', 'Null\u0000', 'Ana\u0085\u009B\u202EBob']) {
      const response = await handleSettings(
        post([
          ['intent', 'name'],
          ['displayName', name],
        ]),
        deps,
      )
      expect(location(response), JSON.stringify(name)).toBe(
        '/en/account/?error=name-invalid#outcome',
      )
    }
    expect(deps.setName).not.toHaveBeenCalled()
  })
})

describe('removing Google or ORCID', () => {
  it('gives this browser a new session and ends the others', async () => {
    const deps = fakes(member({ googleId: '1'.repeat(21) }))
    const response = await handleSettings(post([['intent', 'unlink-google']]), deps)
    expect(location(response)).toBe('/en/account/?done=unlinked-google&others=ended#outcome')
    expect(deps.unlink).toHaveBeenCalledWith(7, 'google')
    expect(deps.rotate).toHaveBeenCalledWith(7, TOKEN)
    expect(response.headers.get('set-cookie')).toContain('__Host-gliagora-session=')
  })

  it('refuses the last way in, and changes nothing when there was nothing to remove', async () => {
    const deps = fakes()
    deps.unlink.mockResolvedValueOnce({ kind: 'refused', reason: 'last-method' })
    expect(location(await handleSettings(post([['intent', 'unlink-orcid']]), deps))).toBe(
      '/en/account/?error=last-method#outcome',
    )
    deps.unlink.mockResolvedValueOnce({ kind: 'done', changed: false })
    expect(location(await handleSettings(post([['intent', 'unlink-orcid']]), deps))).toBe(
      '/en/account/?done=unlinked-orcid#outcome',
    )
    expect(deps.rotate).not.toHaveBeenCalled()
  })
})

it('turns a failure into a message with a reference, logging no values', async () => {
  const deps = fakes()
  deps.setName.mockRejectedValueOnce(new Error('Key (display_name)=(Ayşe) secret'))
  const response = await handleSettings(
    post([
      ['intent', 'name'],
      ['displayName', 'Ayşe'],
    ]),
    deps,
  )
  expect(location(response)).toMatch(/^\/en\/account\/\?error=failed&ref=[0-9A-F]{10}#outcome$/)
  const logged = vi.mocked(console.error).mock.calls.flat().join(' ')
  expect(logged).not.toContain('Ayşe')
})

describe('reading the fields', () => {
  it('reads subfields as well-formed slugs', () => {
    const form = new FormData()
    for (const slug of ['glia', ' motor ', 'glia']) form.append('subfield', slug)
    expect(readSubfields(form)).toEqual(['glia', 'motor'])
    form.append('subfield', '../etc')
    expect(readSubfields(form)).toBeNull()
  })

  it('reads a display name in its stored form', () => {
    expect(readDisplayName('Josiah\tCarberry')).toBe('Josiah Carberry')
    expect(readDisplayName('é')).toBe('é')
    expect(readDisplayName('')).toBeNull()
    expect(readDisplayName(null)).toBe('invalid')
    expect(readDisplayName('a'.repeat(80))).toBe('a'.repeat(80))
    expect(readDisplayName('Josiah\r\n\u000B\u000C\u2028 Carberry')).toBe('Josiah Carberry')
  })

  it('refuses C1 control characters and direction controls in a display name', () => {
    for (const name of [
      'Ana\u0085Bob',
      'Ana\u009BBob',
      'Ana\u202EBob',
      'Ana\u2066Bob',
      'Ana\u200FBob',
      'Ana\u007FBob',
    ]) {
      expect(readDisplayName(name), JSON.stringify(name)).toBe('invalid')
    }
  })
})
