import { describe, expect, it } from 'vitest'

import {
  type Holders,
  type IdentityEvent,
  type Incoming,
  type MemberIdentity,
  type ProviderIncoming,
  googleEmail,
  isGoogleSubject,
  isOrcidSubject,
  resolve,
} from './identity'

// The decision table of the M4b design §7.3, row by row, and the rule behind it: two existing
// accounts are never merged.

// Fake iDs: checksum-valid, starting with 9999, outside ORCID's issued ranges.
const ORCID_A = '9999-0000-0000-0019'
const ORCID_B = '9999-0000-0000-0027'

const member = (id: number, fields: Partial<MemberIdentity> = {}): MemberIdentity => ({
  id,
  email: null,
  googleId: null,
  orcidId: null,
  ...fields,
})

const google = (sub: string, email: string | null = null): ProviderIncoming => ({
  method: 'google',
  sub,
  email,
})

describe('signed out', () => {
  it('signs in the member who has the Google account, whatever its address says now', () => {
    const owner = member(1, { googleId: 'g1', email: 'old@gmail.com' })
    const other = member(2, { email: 'new@gmail.com' })
    expect(
      resolve(
        { kind: 'sign-in', incoming: google('g1', 'new@gmail.com') },
        { byGoogleId: owner, byEmail: other },
      ),
    ).toEqual({ action: 'sign-in', memberId: 1, changes: null, endsOtherSessions: false })
  })

  it('links Google to the member with its authoritative address, if that member has none', () => {
    const owner = member(1, { email: 'someone@gmail.com' })
    expect(
      resolve({ kind: 'sign-in', incoming: google('g1', 'someone@gmail.com') }, { byEmail: owner }),
    ).toEqual({
      action: 'sign-in',
      memberId: 1,
      changes: { googleId: 'g1' },
      endsOtherSessions: true,
    })
  })

  it('refuses when that address belongs to an account with another Google account', () => {
    const owner = member(1, { email: 'someone@gmail.com', googleId: 'g-other' })
    expect(
      resolve({ kind: 'sign-in', incoming: google('g1', 'someone@gmail.com') }, { byEmail: owner }),
    ).toEqual({ action: 'refuse', reason: 'email-has-other-google' })
  })

  it('offers a new account with the authoritative address, or without any', () => {
    expect(resolve({ kind: 'sign-in', incoming: google('g1', 'someone@gmail.com') })).toEqual({
      action: 'create',
      account: { email: 'someone@gmail.com', emailVerifiedBy: 'google', googleId: 'g1' },
    })
    expect(resolve({ kind: 'sign-in', incoming: google('g1', null) })).toEqual({
      action: 'create',
      account: { googleId: 'g1' },
    })
  })

  it('matches nobody by an address Google is not authoritative for (it arrives as none)', () => {
    // googleEmail() turns such an address into null before the decision.
    const holder = member(1, { email: 'someone@university.example.edu' })
    expect(
      resolve(
        {
          kind: 'sign-in',
          incoming: google('g1', googleEmail({ email: holder.email, email_verified: true })),
        },
        { byEmail: null },
      ),
    ).toEqual({ action: 'create', account: { googleId: 'g1' } })
  })

  it('signs in with ORCID, or offers a new account', () => {
    const owner = member(1, { orcidId: ORCID_A })
    expect(
      resolve(
        { kind: 'sign-in', incoming: { method: 'orcid', sub: ORCID_A } },
        { byOrcidId: owner },
      ),
    ).toMatchObject({ action: 'sign-in', memberId: 1, changes: null })
    expect(resolve({ kind: 'sign-in', incoming: { method: 'orcid', sub: ORCID_A } })).toEqual({
      action: 'create',
      account: { orcidId: ORCID_A },
    })
  })

  it('signs in by email link, or offers "Create account"', () => {
    const owner = member(1, { email: 'someone@example.org' })
    const incoming: Incoming = { method: 'email', email: 'someone@example.org' }
    expect(resolve({ kind: 'sign-in', incoming }, { byEmail: owner })).toMatchObject({
      action: 'sign-in',
      memberId: 1,
      changes: null,
    })
    expect(resolve({ kind: 'sign-in', incoming })).toEqual({
      action: 'create',
      account: { email: 'someone@example.org', emailVerifiedBy: 'link' },
    })
  })
})

describe('signed in', () => {
  it('links a free ORCID iD to an account without one', () => {
    const me = member(1, { email: 'me@example.org' })
    expect(
      resolve({ kind: 'link', member: me, incoming: { method: 'orcid', sub: ORCID_A } }),
    ).toEqual({
      action: 'update',
      memberId: 1,
      changes: { orcidId: ORCID_A },
      endsOtherSessions: true,
    })
  })

  it('refuses another iD while the account has one, and an iD of another account', () => {
    const me = member(1, { email: 'me@example.org', orcidId: ORCID_B })
    expect(
      resolve({ kind: 'link', member: me, incoming: { method: 'orcid', sub: ORCID_A } }),
    ).toEqual({ action: 'refuse', reason: 'orcid-already-linked' })
    const fresh = member(1, { email: 'me@example.org' })
    expect(
      resolve(
        { kind: 'link', member: fresh, incoming: { method: 'orcid', sub: ORCID_A } },
        { byOrcidId: member(2, { orcidId: ORCID_A }) },
      ),
    ).toEqual({ action: 'refuse', reason: 'orcid-elsewhere' })
  })

  it('changes nothing when the identity is already this account’s', () => {
    const me = member(1, { orcidId: ORCID_A, googleId: 'g1' })
    const incomings: ProviderIncoming[] = [{ method: 'orcid', sub: ORCID_A }, google('g1')]
    for (const incoming of incomings) {
      expect(
        resolve({ kind: 'link', member: me, incoming }, { byOrcidId: me, byGoogleId: me }),
      ).toEqual({
        action: 'update',
        memberId: 1,
        changes: null,
        endsOtherSessions: false,
      })
    }
  })

  it('links Google, taking its authoritative address only into an account without one', () => {
    const noEmail = member(1, { orcidId: ORCID_A })
    expect(
      resolve({ kind: 'link', member: noEmail, incoming: google('g1', 'me@gmail.com') }),
    ).toMatchObject({
      action: 'update',
      changes: { googleId: 'g1', email: 'me@gmail.com', emailVerifiedBy: 'google' },
    })
    const withEmail = member(1, { email: 'me@example.org' })
    expect(
      resolve({ kind: 'link', member: withEmail, incoming: google('g1', 'me@gmail.com') }),
    ).toMatchObject({ action: 'update', changes: { googleId: 'g1' } })
    // The address is another account's: Google is linked without it.
    expect(
      resolve(
        { kind: 'link', member: noEmail, incoming: google('g1', 'me@gmail.com') },
        { byEmail: member(2, { email: 'me@gmail.com' }) },
      ),
    ).toEqual({
      action: 'update',
      memberId: 1,
      changes: { googleId: 'g1' },
      endsOtherSessions: true,
    })
  })

  it('refuses a Google account of another account, or a second one', () => {
    const me = member(1, { email: 'me@example.org' })
    expect(
      resolve(
        { kind: 'link', member: me, incoming: google('g1') },
        { byGoogleId: member(2, { googleId: 'g1' }) },
      ),
    ).toEqual({ action: 'refuse', reason: 'google-elsewhere' })
    expect(
      resolve({ kind: 'link', member: member(1, { googleId: 'g2' }), incoming: google('g1') }),
    ).toEqual({ action: 'refuse', reason: 'google-already-linked' })
  })

  it('adds an address only for the member who asked, and only a free one', () => {
    const me = member(1, { orcidId: ORCID_A })
    const event = (tokenMemberId: number): IdentityEvent => ({
      kind: 'verify-email',
      member: me,
      tokenMemberId,
      email: 'me@example.org',
    })
    expect(resolve(event(2))).toEqual({ action: 'refuse', reason: 'not-token-member' })
    expect(resolve(event(1))).toEqual({
      action: 'update',
      memberId: 1,
      changes: { email: 'me@example.org', emailVerifiedBy: 'link' },
      endsOtherSessions: true,
    })
    expect(resolve(event(1), { byEmail: member(3, { email: 'me@example.org' }) })).toEqual({
      action: 'refuse',
      reason: 'email-taken',
    })
    // A link replaces an earlier address.
    const changing = member(1, { email: 'old@example.org' })
    expect(
      resolve({
        kind: 'verify-email',
        member: changing,
        tokenMemberId: 1,
        email: 'new@example.org',
      }),
    ).toMatchObject({ action: 'update', changes: { email: 'new@example.org' } })
  })

  it('removes a method only while another way in remains', () => {
    const both = member(1, { googleId: 'g1', orcidId: ORCID_A })
    expect(resolve({ kind: 'unlink', member: both, method: 'google' })).toEqual({
      action: 'update',
      memberId: 1,
      changes: { clear: 'googleId' },
      endsOtherSessions: true,
    })
    expect(
      resolve({ kind: 'unlink', member: member(1, { orcidId: ORCID_A }), method: 'orcid' }),
    ).toEqual({ action: 'refuse', reason: 'last-method' })
    expect(
      resolve({
        kind: 'unlink',
        member: member(1, { email: 'me@example.org', orcidId: ORCID_A }),
        method: 'orcid',
      }),
    ).toMatchObject({ action: 'update', changes: { clear: 'orcidId' } })
    expect(
      resolve({ kind: 'unlink', member: member(1, { email: 'me@example.org' }), method: 'google' }),
    ).toMatchObject({ action: 'update', changes: null })
  })

  it('switches accounts when signing in with another method', () => {
    const other = member(2, { orcidId: ORCID_A })
    expect(
      resolve(
        { kind: 'sign-in', incoming: { method: 'orcid', sub: ORCID_A } },
        { byOrcidId: other },
      ),
    ).toMatchObject({ action: 'sign-in', memberId: 2 })
  })
})

describe('no merges, ever', () => {
  // Every set of accounts that can exist together (identifiers are unique), and every event in it:
  // whatever one account gets is never held by another, and only one account is ever touched.
  const people = [
    member(1, { email: 'a@gmail.com' }),
    member(2, { googleId: 'g1' }),
    member(3, { orcidId: ORCID_A }),
    member(4, { email: 'b@gmail.com', googleId: 'g2', orcidId: ORCID_B }),
    member(5, { email: 'c@example.org' }),
    member(6, { email: 'a@gmail.com', googleId: 'g3' }),
    member(7, { email: 'd@example.org', orcidId: ORCID_A }),
  ]
  const unique = (world: MemberIdentity[]) =>
    (['email', 'googleId', 'orcidId'] as const).every((key) => {
      const values = world.map((person) => person[key]).filter(Boolean)
      return new Set(values).size === values.length
    })
  const worlds = Array.from({ length: 2 ** people.length }, (_, mask) =>
    people.filter((_, index) => mask & (1 << index)),
  ).filter(unique)

  const incomings: Incoming[] = [
    google('g1', 'a@gmail.com'),
    google('g4', 'a@gmail.com'),
    google('g4', 'b@gmail.com'),
    google('g4', null),
    google('g2', null),
    { method: 'orcid', sub: ORCID_A },
    { method: 'orcid', sub: ORCID_B },
    { method: 'email', email: 'a@gmail.com' },
  ]

  /** What the callers look up: the members of `world` who hold the incoming identifiers. */
  const lookups = (world: MemberIdentity[], incoming: Incoming | { email: string }): Holders => ({
    byGoogleId:
      'method' in incoming && incoming.method === 'google'
        ? (world.find((person) => person.googleId === incoming.sub) ?? null)
        : null,
    byOrcidId:
      'method' in incoming && incoming.method === 'orcid'
        ? (world.find((person) => person.orcidId === incoming.sub) ?? null)
        : null,
    byEmail:
      'email' in incoming && incoming.email
        ? (world.find((person) => person.email === incoming.email) ?? null)
        : null,
  })

  it('never moves an identifier another account holds, and touches one account at most', () => {
    let checked = 0
    for (const world of worlds) {
      const events: [IdentityEvent, Holders][] = [
        ...incomings.map((incoming): [IdentityEvent, Holders] => [
          { kind: 'sign-in', incoming },
          lookups(world, incoming),
        ]),
        ...world.flatMap((me) => [
          ...incomings.flatMap((incoming): [IdentityEvent, Holders][] =>
            incoming.method === 'email'
              ? []
              : [[{ kind: 'link', member: me, incoming }, lookups(world, incoming)]],
          ),
          ...['a@gmail.com', 'c@example.org'].map((email): [IdentityEvent, Holders] => [
            { kind: 'verify-email', member: me, tokenMemberId: me.id, email },
            lookups(world, { email }),
          ]),
          [{ kind: 'unlink', member: me, method: 'google' }, {}] as [IdentityEvent, Holders],
          [{ kind: 'unlink', member: me, method: 'orcid' }, {}] as [IdentityEvent, Holders],
        ]),
      ]
      for (const [event, found] of events) {
        const result = resolve(event, found)
        checked++
        if (result.action !== 'sign-in' && result.action !== 'update') continue
        if (event.kind !== 'sign-in') expect(result.memberId).toBe(event.member.id)
        expect(world.map((person) => person.id)).toContain(result.memberId)
        const changes = result.changes ?? {}
        for (const other of world.filter((person) => person.id !== result.memberId)) {
          if (changes.googleId) expect(other.googleId).not.toBe(changes.googleId)
          if (changes.orcidId) expect(other.orcidId).not.toBe(changes.orcidId)
          if (changes.email) expect(other.email).not.toBe(changes.email)
        }
        // A method is removed only while another way in remains.
        if (changes.clear) {
          const me = world.find((person) => person.id === result.memberId)!
          const left = { ...me, [changes.clear]: null }
          expect(Boolean(left.email || left.googleId || left.orcidId)).toBe(true)
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })
})

describe('provider claims', () => {
  it('count a Google address only when verified and Google is authoritative for it', () => {
    expect(googleEmail({ email: 'Someone@Gmail.com', email_verified: true })).toBe(
      'someone@gmail.com',
    )
    expect(googleEmail({ email: 'someone@googlemail.com', email_verified: true })).toBe(
      'someone@googlemail.com',
    )
    expect(
      googleEmail({
        email: 'someone@university.example.edu',
        email_verified: true,
        hd: 'university.example.edu',
      }),
    ).toBe('someone@university.example.edu')
    for (const claims of [
      { email: 'someone@university.example.edu', email_verified: true },
      { email: 'someone@gmail.com', email_verified: false },
      { email: 'someone@gmail.com', email_verified: 'true' },
      { email: 'someone@gmail.com' },
      { email: 'someone@gmail.com.example.org', email_verified: true },
      { email: 'not an address', email_verified: true, hd: 'example.org' },
      { email_verified: true, hd: 'example.org' },
      { email: 'someone@university.example.edu', email_verified: true, hd: '' },
    ]) {
      expect(googleEmail(claims), JSON.stringify(claims)).toBeNull()
    }
  })

  it('take Google’s sub and ORCID’s iD only in their own shapes', () => {
    expect(isGoogleSubject('110169484474386276334')).toBe(true)
    expect(isGoogleSubject('x'.repeat(256))).toBe(false)
    expect(isGoogleSubject('with space')).toBe(false)
    expect(isGoogleSubject('')).toBe(false)
    expect(isGoogleSubject(12345)).toBe(false)
    expect(isOrcidSubject(ORCID_A)).toBe(true)
    expect(isOrcidSubject('9999-0000-0000-0018')).toBe(false)
  })
})
