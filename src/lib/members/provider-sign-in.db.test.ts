import { randomUUID } from 'node:crypto'

import { type MigrateUpArgs, sql } from '@payloadcms/db-postgres'
import { drizzle } from '@payloadcms/db-postgres/drizzle/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrations } from '@/migrations'

import { orcidCheckCharacter } from './orcid-id'
import { linkProvider, rotateSession, signInWithProvider, unlinkProvider } from './provider-sign-in'
import { type MemberDb, createMember, createSession, findMember, findSession } from './store'

// Signing in with Google and ORCID, linking and removing them, as they change the accounts
// (src/lib/members/provider-sign-in.ts; the M4b design §7.3), against a real PostgreSQL
// (`pnpm test:db`): the decisions of `resolve()` applied in SQL, and what happens when two
// requests meet. A scratch database owned by a role that is not a superuser, dropped at the end, as
// in store.db.test.ts. Fake data only (example.org, ORCID iDs starting 9999).

const ADMIN_URL = process.env.TEST_DATABASE_URL

type Database = ReturnType<typeof drizzle>

const NOW = new Date('2026-10-01T12:00:00.000Z')

describe.skipIf(!ADMIN_URL)('provider sign-in on a scratch database', () => {
  const name = `provider_test_${process.pid}_${Date.now()}`
  const password = randomUUID()
  let admin: Database
  let db: Database
  let store: MemberDb
  let counter = 0

  const email = () => `provider-${++counter}@example.org`
  const googleSub = () => `10${String(++counter).padStart(19, '0')}`
  const orcid = () => {
    const digits = `99990000001${String(++counter).padStart(4, '0')}`
    return `${digits}${orcidCheckCharacter(digits)}`.replace(
      /^(\d{4})(\d{4})(\d{4})(.{4})$/,
      '$1-$2-$3-$4',
    )
  }
  const sessionsOf = async (memberId: number) =>
    Number(
      (
        await db.execute<{ n: number }>(
          sql`select count(*)::int as n from member_sessions where member_id = ${memberId}`,
        )
      ).rows[0]?.n,
    )
  const google = (sub: string, address: string | null = null) =>
    ({ method: 'google', sub, email: address }) as const
  const orcidOf = (sub: string) => ({ method: 'orcid', sub }) as const
  const create = { displayName: null }

  beforeAll(async () => {
    admin = drizzle(ADMIN_URL!)
    // Identifiers cannot be parameters; these are made here, from digits and a UUID.
    await admin.execute(
      sql.raw(
        `CREATE ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`,
      ),
    )
    await admin.execute(sql.raw(`CREATE DATABASE ${name} OWNER ${name}`))
    const url = new URL(ADMIN_URL!)
    url.username = name
    url.password = password
    url.pathname = `/${name}`
    db = drizzle(url.toString())
    store = db as unknown as MemberDb
    for (const migration of migrations) {
      await migration.up({ db } as unknown as MigrateUpArgs)
    }
  })

  afterAll(async () => {
    await db?.$client.end()
    if (admin) {
      // As in search.db.test.ts: wait until the pool's connections are gone, then drop.
      for (let tries = 0; tries < 50; tries++) {
        const { rows: left } = await admin.execute<{ n: number }>(
          sql`select count(*)::int as n from pg_stat_activity where datname = ${name}`,
        )
        if (Number(left[0]?.n ?? 0) === 0) break
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      await admin.execute(sql.raw(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`))
      await admin.execute(sql.raw(`DROP ROLE IF EXISTS ${name}`))
      await admin.$client.end()
    }
  })

  describe('signing in', () => {
    it('a new identity waits for "Create account", then makes the account, then signs in', async () => {
      const sub = googleSub()
      const address = email()
      expect(await signInWithProvider(store, google(sub, address), NOW)).toEqual({
        kind: 'confirm',
      })
      expect(await findMember(store, { googleId: sub })).toBeNull()
      const made = await signInWithProvider(store, google(sub, address), NOW, create)
      expect(made.kind).toBe('created')
      expect(await findMember(store, { googleId: sub })).toMatchObject({
        email: address,
        emailVerifiedBy: 'google',
      })
      // Later sign-ins go to it, whatever address Google sends then.
      expect(await signInWithProvider(store, google(sub, email()), NOW)).toEqual({
        kind: 'signed-in',
        memberId: made.kind === 'created' ? made.memberId : -1,
        changed: false,
      })
    })

    it("Google's authoritative address signs in to its account and links Google to it", async () => {
      const address = email()
      const member = await createMember(store, { email: address, emailVerifiedBy: 'link' }, NOW)
      const sub = googleSub()
      expect(await signInWithProvider(store, google(sub, address), NOW)).toEqual({
        kind: 'signed-in',
        memberId: member.id,
        changed: true,
      })
      expect((await findMember(store, { id: member.id }))?.googleId).toBe(sub)
      // Another Google account with that address is refused: no account gets a second one.
      expect(await signInWithProvider(store, google(googleSub(), address), NOW)).toEqual({
        kind: 'refused',
        reason: 'email-has-other-google',
      })
    })

    it('without an authoritative address, an account without one, matched to nobody', async () => {
      const address = email()
      const owner = await createMember(store, { email: address, emailVerifiedBy: 'link' }, NOW)
      const made = await signInWithProvider(store, google(googleSub(), null), NOW, create)
      expect(made.kind).toBe('created')
      if (made.kind !== 'created') return
      expect(made.memberId).not.toBe(owner.id)
      expect((await findMember(store, { id: made.memberId }))?.email).toBeNull()
    })

    it('ORCID keeps the display name only when given', async () => {
      const named = await signInWithProvider(store, orcidOf(orcid()), NOW, {
        displayName: 'Josiah Carberry',
      })
      const plain = await signInWithProvider(store, orcidOf(orcid()), NOW, create)
      if (named.kind !== 'created' || plain.kind !== 'created') throw new Error('not created')
      expect((await findMember(store, { id: named.memberId }))?.displayName).toBe('Josiah Carberry')
      expect((await findMember(store, { id: plain.memberId }))?.displayName).toBeNull()
    })

    it('"Create account" pressed twice at once makes one account; both sign in to it', async () => {
      const sub = orcid()
      const results = await Promise.all([
        signInWithProvider(store, orcidOf(sub), NOW, create),
        signInWithProvider(store, orcidOf(sub), NOW, create),
      ])
      const ids = results.map((result) => ('memberId' in result ? result.memberId : -1))
      expect(new Set(ids).size).toBe(1)
      expect(results.map((result) => result.kind).sort()).toEqual(['created', 'signed-in'])
      const { rows } = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from members where orcid_id = ${sub}`,
      )
      expect(Number(rows[0]?.n)).toBe(1)
    })
  })

  describe('linking', () => {
    it('links ORCID once; a second iD or one on another account is refused', async () => {
      const member = await createMember(store, { email: email(), emailVerifiedBy: 'link' }, NOW)
      const mine = orcid()
      expect(await linkProvider(store, member.id, orcidOf(mine), NOW)).toEqual({
        kind: 'done',
        changed: true,
      })
      expect(await linkProvider(store, member.id, orcidOf(mine), NOW)).toEqual({
        kind: 'done',
        changed: false,
      })
      expect(await linkProvider(store, member.id, orcidOf(orcid()), NOW)).toEqual({
        kind: 'refused',
        reason: 'orcid-already-linked',
      })
      const other = await createMember(store, { email: email(), emailVerifiedBy: 'link' }, NOW)
      expect(await linkProvider(store, other.id, orcidOf(mine), NOW)).toEqual({
        kind: 'refused',
        reason: 'orcid-elsewhere',
      })
    })

    it('Google brings its address to an account without one, unless another account has it', async () => {
      const free = email()
      const a = await createMember(store, { orcidId: orcid() }, NOW)
      expect(await linkProvider(store, a.id, google(googleSub(), free), NOW)).toMatchObject({
        changed: true,
      })
      expect(await findMember(store, { id: a.id })).toMatchObject({
        email: free,
        emailVerifiedBy: 'google',
      })

      const taken = email()
      await createMember(store, { email: taken, emailVerifiedBy: 'link' }, NOW)
      const b = await createMember(store, { orcidId: orcid() }, NOW)
      const sub = googleSub()
      expect(await linkProvider(store, b.id, google(sub, taken), NOW)).toMatchObject({
        changed: true,
      })
      expect(await findMember(store, { id: b.id })).toMatchObject({ googleId: sub, email: null })
    })

    it('one Google account linked to two accounts at once goes to one of them', async () => {
      const sub = googleSub()
      const a = await createMember(store, { orcidId: orcid() }, NOW)
      const b = await createMember(store, { orcidId: orcid() }, NOW)
      const results = await Promise.all([
        linkProvider(store, a.id, google(sub), NOW),
        linkProvider(store, b.id, google(sub), NOW),
      ])
      expect(results).toContainEqual({ kind: 'done', changed: true })
      expect(results).toContainEqual({ kind: 'refused', reason: 'google-elsewhere' })
    })
  })

  describe('removing', () => {
    it('removes a method while another way in remains, never the last one', async () => {
      const member = await createMember(store, { googleId: googleSub(), orcidId: orcid() }, NOW)
      expect(await unlinkProvider(store, member.id, 'google', NOW)).toEqual({
        kind: 'done',
        changed: true,
      })
      expect(await unlinkProvider(store, member.id, 'google', NOW)).toEqual({
        kind: 'done',
        changed: false,
      })
      expect(await unlinkProvider(store, member.id, 'orcid', NOW)).toEqual({
        kind: 'refused',
        reason: 'last-method',
      })
      expect((await findMember(store, { id: member.id }))?.orcidId).not.toBeNull()
    })

    it('two removals at once leave one way in', async () => {
      const member = await createMember(store, { googleId: googleSub(), orcidId: orcid() }, NOW)
      const results = await Promise.all([
        unlinkProvider(store, member.id, 'google', NOW),
        unlinkProvider(store, member.id, 'orcid', NOW),
      ])
      expect(results).toContainEqual({ kind: 'refused', reason: 'last-method' })
      const after = await findMember(store, { id: member.id })
      expect([after?.googleId, after?.orcidId].filter(Boolean)).toHaveLength(1)
    })
  })

  describe('sessions after a change', () => {
    it('gives this browser a new session and ends the others, when asked', async () => {
      const member = await createMember(store, { orcidId: orcid() }, NOW)
      const here = await createSession(store, member.id, NOW)
      await createSession(store, member.id, NOW)
      await createSession(store, member.id, NOW)
      const kept = await rotateSession(store, member.id, NOW, {
        replaces: here.token,
        endOthers: false,
      })
      expect(kept.othersEnded).toBe(0)
      expect(await sessionsOf(member.id)).toBe(3)
      expect(await findSession(store, here.token, NOW)).toBeNull()

      const ended = await rotateSession(store, member.id, NOW, {
        replaces: kept.cookie.value,
        endOthers: true,
      })
      expect(ended.othersEnded).toBe(2)
      expect(await sessionsOf(member.id)).toBe(1)
      expect(await findSession(store, ended.cookie.value, NOW)).not.toBeNull()
      expect(ended.cookie).toMatchObject({ name: '__Host-gliagora-session', httpOnly: true })
    })
  })
})
