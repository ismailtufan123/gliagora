import { randomUUID } from 'node:crypto'

import { type MigrateUpArgs, sql } from '@payloadcms/db-postgres'
import type { SQL } from '@payloadcms/db-postgres/drizzle'
import { drizzle } from '@payloadcms/db-postgres/drizzle/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrations } from '@/migrations'
import * as members from '@/migrations/20261001_142245_members'
import * as constraints from '@/migrations/20261001_142246_member_constraints'
import * as memberTasks from '@/migrations/20261001_201739_member_tasks'
import * as requestGuards from '@/migrations/20261002_090000_data_request_guards'

import { orcidCheckCharacter } from './orcid-id'
import { redeemSignInLink } from './sign-in-link'
import { hashToken, newBinding, newToken } from './tokens'
import { redeemVerifyLink } from './verify-email'
import {
  type MemberDb,
  type MemberRecord,
  MemberStoreError,
  applyChanges,
  consumeEmailToken,
  countSavedItems,
  createEmailToken,
  createMember,
  createSession,
  deleteEmailToken,
  deleteMember,
  deleteSignInTokens,
  endAllSessions,
  endOtherSessions,
  endSession,
  findEmailToken,
  findMember,
  findSession,
  isUniqueViolation,
  listSavedJobs,
  markEmailVerified,
  preferredSubfields,
  saveJob,
  savedJobIds,
  setDigest,
  setDisplayName,
  setPreferredSubfields,
  touchMember,
  unsaveJob,
} from './store'

// The member store against a real PostgreSQL (`pnpm test:db`; the M4b design §10 "Database
// tests"). Like the search tests, it creates a scratch database owned by a new role that is not a
// superuser, as on the server, runs every migration there as that role, and drops both at the end.
// Needs a connection that may create roles and databases in TEST_DATABASE_URL (the local
// superuser from .env). Fake data only (example.org).

const ADMIN_URL = process.env.TEST_DATABASE_URL

type Database = ReturnType<typeof drizzle>

const NOW = new Date('2026-10-01T12:00:00.000Z')
const DAY = 86_400_000
const at = (days: number) => new Date(NOW.getTime() + days * DAY)

/** Every table whose rows refer to a member, and how deleteMember covers it. */
const MEMBER_REFERENCES = [
  'email_tokens.member_id (SET NULL: deleted by deleteMember)',
  'member_sessions.member_id (SET NULL: deleted by deleteMember)',
  'members_rels.parent_id (CASCADE)',
  'saved_items.member_id (SET NULL: deleted by deleteMember)',
]

describe.skipIf(!ADMIN_URL)('member store on a scratch database', () => {
  const name = `members_test_${process.pid}_${Date.now()}`
  const password = randomUUID()
  let admin: Database
  let db: Database
  let store: MemberDb
  let emails = 0
  const jobs: number[] = []
  const subfields: number[] = []

  const rows = async <T>(query: SQL) => (await db.execute(query)).rows as T[]
  const count = async (query: SQL) => Number((await rows<{ n: number }>(query))[0]?.n ?? Number.NaN)
  const email = () => `member-${++emails}@example.org`
  let orcids = 0
  /** A fresh, valid fake ORCID iD (9999-…, outside ORCID's ranges). */
  const orcid = () => {
    const digits = `99990000000${String(++orcids).padStart(4, '0')}`
    const id = `${digits}${orcidCheckCharacter(digits)}`
    return id.replace(/^(\d{4})(\d{4})(\d{4})(.{4})$/, '$1-$2-$3-$4')
  }
  const sessionsOf = (memberId: number) =>
    count(sql`select count(*)::int as n from member_sessions where member_id = ${memberId}`)
  /** The database error code of a statement that must fail. */
  const failure = async (query: SQL) => {
    try {
      await db.execute(query)
    } catch (error) {
      const cause = (error as { cause?: { code?: string }; code?: string }).cause
      return cause?.code ?? (error as { code?: string }).code
    }
    return 'no error'
  }

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
    const [institution] = await rows<{ id: number }>(sql`
      insert into institutions (name, slug, short_id, origin, status, country_id)
      values ('Test Institute', 'test-institute', 'tst01', 'manual', 'active', 'TR')
      returning id`)
    for (let i = 0; i < 3; i++) {
      const [job] = await rows<{ id: number }>(sql`
        insert into jobs (title, summary, institution_id, status, deadline_kind, deadline_at,
          published_at, short_id, slug)
        values (${`Test job ${i}`}, 'Fake.', ${institution!.id}, 'published', 'fixed',
          ${at(30).toISOString()}, ${at(-5).toISOString()}, ${`tj00${i}`}, 'test-job')
        returning id`)
      jobs.push(job!.id)
    }
    subfields.push(
      ...(
        await rows<{ id: number }>(
          sql`select id from terms where vocabulary = 'subfield' order by id limit 2`,
        )
      ).map((row) => row.id),
    )
  }, 120_000)

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

  const newMember = (fields: Parameters<typeof createMember>[1] = {}): Promise<MemberRecord> =>
    createMember(
      store,
      Object.keys(fields).length ? fields : { email: email(), emailVerifiedBy: 'link' },
      NOW,
    )

  describe('the tables', () => {
    it('have no saved versions, which would keep copies of deleted data', async () => {
      const tables = await rows<{ table_name: string }>(sql`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_name in ('_members_v', '_member_sessions_v',
          '_email_tokens_v', '_saved_items_v', '_deletion_log_v', '_data_requests_v')`)
      expect(tables).toEqual([])
    })

    it('are all covered by deleteMember: every reference to a member', async () => {
      const references = await rows<{ ref: string }>(sql`
        select kcu.table_name || '.' || kcu.column_name || ' (' ||
          case rc.delete_rule when 'CASCADE' then 'CASCADE'
            else rc.delete_rule || ': deleted by deleteMember' end || ')' as ref
        from information_schema.referential_constraints rc
        join information_schema.key_column_usage kcu
          on kcu.constraint_name = rc.constraint_name and kcu.constraint_schema = rc.constraint_schema
        join information_schema.constraint_column_usage ccu
          on ccu.constraint_name = rc.unique_constraint_name
          and ccu.constraint_schema = rc.unique_constraint_schema
        where ccu.table_name = 'members' and ccu.column_name = 'id'
        order by 1`)
      expect(
        references.map((row) => row.ref),
        'A new table refers to members: delete its rows in deleteMember (store.ts) and list it here',
      ).toEqual(MEMBER_REFERENCES)
    })
  })

  describe('the database constraints', () => {
    it('refuse a member without a way in, or with an uppercase address', async () => {
      expect(
        await failure(sql`insert into members (last_seen_at) values (${NOW.toISOString()})`),
      ).toBe('23514')
      expect(
        await failure(
          sql`insert into members (email, last_seen_at) values ('Someone@Example.org', ${NOW.toISOString()})`,
        ),
      ).toBe('23514')
      expect(
        await failure(
          sql`insert into members (orcid_id, last_seen_at) values ('0000-0002-1825-009', ${NOW.toISOString()})`,
        ),
      ).toBe('23514')
    })

    it('refuse a raw token where its hash belongs', async () => {
      const member = await newMember()
      expect(
        await failure(sql`
          insert into member_sessions (member_id, token_hash, expires_at)
          values (${member.id}, ${newToken()}, ${at(1).toISOString()})`),
      ).toBe('23514')
      expect(
        await failure(sql`
          insert into email_tokens (token_hash, purpose, email, locale, expires_at)
          values (${newToken()}, 'sign-in', 'someone@example.org', 'en', ${at(1).toISOString()})`),
      ).toBe('23514')
    })

    it('keep an unconfirmed data request to its kind, date and address hash', async () => {
      expect(
        await failure(sql`
          insert into data_requests (kind, status, source, locale, email)
          values ('access', 'unconfirmed', 'form', 'en', 'someone@example.org')`),
      ).toBe('23514')
      expect(
        await failure(sql`
          insert into data_requests (kind, status, source, locale, details)
          values ('access', 'unconfirmed', 'form', 'en', 'Some text')`),
      ).toBe('23514')
      // Nor an editor's note, an action or an outcome (20261002_090000_data_request_guards).
      expect(
        await failure(sql`
          insert into data_requests (kind, status, source, locale, action_note)
          values ('access', 'unconfirmed', 'form', 'en', 'Sent by someone, asked to resend.')`),
      ).toBe('23514')
      expect(
        await failure(sql`
          insert into data_requests (kind, status, source, locale, action)
          values ('access', 'unconfirmed', 'form', 'en', 'not-applicable')`),
      ).toBe('23514')
      expect(
        await failure(sql`
          insert into data_requests (kind, status, source, locale, outcome)
          values ('deletion', 'unconfirmed', 'form', 'en', '{"accountDeleted": 1}'::jsonb)`),
      ).toBe('23514')
      expect(
        await failure(sql`
          insert into data_requests (kind, status, source, locale, email_hash)
          values ('access', 'unconfirmed', 'form', 'en', ${'a'.repeat(64)})`),
      ).toBe('no error')
      // Confirmed requests keep their address, except an account deletion without one.
      expect(
        await failure(sql`
          insert into data_requests (kind, status, source, locale)
          values ('access', 'new', 'email', 'en')`),
      ).toBe('23514')
      expect(
        await failure(sql`
          insert into data_requests (kind, status, source, locale, action)
          values ('deletion', 'closed', 'account', 'en', 'deleted-automatically')`),
      ).toBe('no error')
    })

    it('are removed and added again by the migration', async () => {
      const names = () =>
        rows<{ conname: string }>(sql`
          select conname from pg_constraint where contype = 'c' and right(conname, 6) = '_check'
            and conrelid::regclass::text in ('members', 'member_sessions', 'email_tokens', 'data_requests')
          order by conname`)
      expect(await names()).toHaveLength(10)
      // The later migration that widens one of them first, as the migrations run backwards.
      await requestGuards.down({ db } as never)
      await constraints.down({ db } as never)
      expect(await names()).toEqual([])
      await constraints.up({ db } as never)
      await requestGuards.up({ db } as never)
      expect(await names()).toHaveLength(10)
    })
  })

  describe('sessions', () => {
    it('find the member by the cookie’s token, which is stored only hashed', async () => {
      const member = await newMember()
      const { token, expiresAt } = await createSession(store, member.id, NOW)
      expect(expiresAt).toEqual(at(30))
      const found = await findSession(store, token, at(1))
      expect(found?.member).toMatchObject({ id: member.id, email: member.email })
      expect(found?.expiresAt).toEqual(at(30))
      const stored = await rows<{ token_hash: string }>(
        sql`select token_hash from member_sessions where member_id = ${member.id}`,
      )
      expect(stored).toEqual([{ token_hash: hashToken(token) }])
      expect(await findSession(store, 'not-a-token', NOW)).toBeNull()
      expect(await findSession(store, newToken(), NOW)).toBeNull()
    })

    it('end 30 days after sign-in, however much they are used', async () => {
      const member = await newMember()
      const { token } = await createSession(store, member.id, NOW)
      expect(await findSession(store, token, new Date(at(30).getTime() - 1))).not.toBeNull()
      expect(await findSession(store, token, at(30))).toBeNull()
    })

    it('rotate at sign-in: the session the request carried is deleted', async () => {
      const first = await newMember()
      const second = await newMember()
      const old = await createSession(store, first.id, NOW)
      // Signing in as another member in the same browser (switching accounts).
      const fresh = await createSession(store, second.id, NOW, { replaces: old.token })
      expect(await findSession(store, old.token, NOW)).toBeNull()
      expect((await findSession(store, fresh.token, NOW))?.member.id).toBe(second.id)
    })

    it('are at most 20 per member: the oldest go', async () => {
      const member = await newMember()
      const tokens: string[] = []
      for (let i = 0; i < 22; i++) {
        tokens.push((await createSession(store, member.id, new Date(NOW.getTime() + i))).token)
      }
      expect(await sessionsOf(member.id)).toBe(20)
      expect(await findSession(store, tokens[0], at(1))).toBeNull()
      expect(await findSession(store, tokens[1], at(1))).toBeNull()
      expect(await findSession(store, tokens[2], at(1))).not.toBeNull()
    })

    it('end one, all the others, or all', async () => {
      const member = await newMember()
      const other = await newMember()
      const [a, b, c] = [
        await createSession(store, member.id, NOW),
        await createSession(store, member.id, NOW),
        await createSession(store, member.id, NOW),
      ]
      const elsewhere = await createSession(store, other.id, NOW)
      expect(await endOtherSessions(store, member.id, b!.token)).toBe(2)
      expect(await findSession(store, a!.token, NOW)).toBeNull()
      expect(await findSession(store, c!.token, NOW)).toBeNull()
      expect(await findSession(store, b!.token, NOW)).not.toBeNull()
      await endSession(store, b!.token)
      expect(await sessionsOf(member.id)).toBe(0)
      await createSession(store, member.id, NOW)
      expect(await endAllSessions(store, member.id)).toBe(1)
      expect(await findSession(store, elsewhere.token, NOW)).not.toBeNull()
    })
  })

  describe('email links', () => {
    it('are looked up without being used, any number of times', async () => {
      const address = email()
      const binding = newBinding()
      const { token } = await createEmailToken(
        store,
        {
          purpose: 'sign-in',
          email: address,
          browserHash: hashToken(binding),
          next: '/en/jobs/',
          save: 'job:k3f9a',
          locale: 'en',
        },
        NOW,
      )
      for (let i = 0; i < 3; i++) {
        expect(await findEmailToken(store, token, NOW)).toMatchObject({
          purpose: 'sign-in',
          email: address,
          browserHash: hashToken(binding),
          next: '/en/jobs/',
          save: 'job:k3f9a',
          expiresAt: new Date(NOW.getTime() + 15 * 60_000),
        })
      }
      expect(await consumeEmailToken(store, token, 'sign-in', NOW)).not.toBeNull()
      expect(await findEmailToken(store, token, NOW)).toBeNull()
    })

    it('are used once: of two uses at the same moment, exactly one wins', async () => {
      const { token } = await createEmailToken(
        store,
        { purpose: 'sign-in', email: email(), locale: 'en' },
        NOW,
      )
      const results = await Promise.all(
        Array.from({ length: 4 }, () => consumeEmailToken(store, token, 'sign-in', NOW)),
      )
      expect(results.filter(Boolean)).toHaveLength(1)
    })

    it('work only for their own purpose, and an address link only for its member', async () => {
      const member = await newMember()
      const other = await newMember()
      const signIn = await createEmailToken(
        store,
        { purpose: 'sign-in', email: email(), locale: 'en' },
        NOW,
      )
      for (const purpose of ['verify-email', 'data-request'] as const) {
        expect(
          await consumeEmailToken(store, signIn.token, purpose, NOW, { memberId: member.id }),
        ).toBeNull()
      }
      expect(await findEmailToken(store, signIn.token, NOW)).not.toBeNull()

      const verify = await createEmailToken(
        store,
        { purpose: 'verify-email', email: email(), memberId: member.id, locale: 'en' },
        NOW,
      )
      expect(
        await consumeEmailToken(store, verify.token, 'verify-email', NOW, { memberId: other.id }),
      ).toBeNull()
      expect(
        await consumeEmailToken(store, verify.token, 'verify-email', NOW, { memberId: member.id }),
      ).toMatchObject({ purpose: 'verify-email', memberId: member.id })
      // Without a member, an address link is refused before the database is asked.
      await expect(consumeEmailToken(store, newToken(), 'verify-email', NOW)).rejects.toThrow(
        MemberStoreError,
      )
    })

    it('expire: 15 minutes to sign in, 24 hours for the others', async () => {
      const signIn = await createEmailToken(
        store,
        { purpose: 'sign-in', email: email(), locale: 'en' },
        NOW,
      )
      const request = await createEmailToken(
        store,
        { purpose: 'data-request', email: email(), locale: 'tr', requestData: { kind: 'access' } },
        NOW,
      )
      const fifteen = new Date(NOW.getTime() + 15 * 60_000)
      expect(await consumeEmailToken(store, signIn.token, 'sign-in', fifteen)).toBeNull()
      expect(await findEmailToken(store, request.token, at(1))).toBeNull()
      expect(
        await consumeEmailToken(
          store,
          request.token,
          'data-request',
          new Date(at(1).getTime() - 1),
        ),
      ).toMatchObject({ locale: 'tr', requestData: { kind: 'access' } })
    })

    it('are deleted when their email could not be sent, or when another link was used', async () => {
      const address = email()
      const first = await createEmailToken(
        store,
        { purpose: 'sign-in', email: address, locale: 'en' },
        NOW,
      )
      const second = await createEmailToken(
        store,
        { purpose: 'sign-in', email: address, locale: 'en' },
        NOW,
      )
      await deleteEmailToken(store, first.token)
      expect(await findEmailToken(store, first.token, NOW)).toBeNull()
      expect(await deleteSignInTokens(store, address)).toBe(1)
      expect(await findEmailToken(store, second.token, NOW)).toBeNull()
    })

    it('refuse what a link never holds', async () => {
      for (const input of [
        { purpose: 'sign-in' as const, email: 'Someone@Example.org', locale: 'en' as const },
        { purpose: 'verify-email' as const, email: email(), locale: 'en' as const },
        { purpose: 'sign-in' as const, email: email(), locale: 'en' as const, save: 'job:../x' },
        {
          purpose: 'sign-in' as const,
          email: email(),
          locale: 'en' as const,
          next: 'x'.repeat(1001),
        },
        {
          purpose: 'data-request' as const,
          email: email(),
          locale: 'en' as const,
          browserHash: hashToken('x'),
        },
      ]) {
        await expect(createEmailToken(store, input, NOW), JSON.stringify(input)).rejects.toThrow(
          MemberStoreError,
        )
      }
    })
  })

  describe('members', () => {
    it('are created with what proved them, and found by each identifier', async () => {
      const address = email()
      const created = await createMember(
        store,
        { email: address, emailVerifiedBy: 'google', googleId: '110169484474386276334' },
        NOW,
      )
      expect(created).toMatchObject({
        email: address,
        emailVerifiedBy: 'google',
        emailVerifiedAt: NOW,
        googleId: '110169484474386276334',
        orcidId: null,
        lastSeenAt: NOW,
        deletionWarnedAt: null,
      })
      expect((await findMember(store, { email: address }))?.id).toBe(created.id)
      expect((await findMember(store, { googleId: '110169484474386276334' }))?.id).toBe(created.id)
      expect((await findMember(store, { id: created.id }))?.email).toBe(address)
      // A valid iD that orcid() never makes.
      expect(await findMember(store, { orcidId: '9999-0001-0000-0008' })).toBeNull()
    })

    it('meet a concurrent create with the same address at the unique index, without its value', async () => {
      const address = email()
      const results = await Promise.allSettled(
        Array.from({ length: 3 }, () =>
          createMember(store, { email: address, emailVerifiedBy: 'link' }, NOW),
        ),
      )
      const created = results.filter((result) => result.status === 'fulfilled')
      const refused = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      )
      expect(created).toHaveLength(1)
      expect(refused).toHaveLength(2)
      for (const error of refused) {
        expect(isUniqueViolation(error)).toBe(true)
        expect((error as MemberStoreError).target).toBe('members_email_idx')
        expect(`${String(error)} ${JSON.stringify(error)}`).not.toContain(address)
      }
    })

    it('refuse what an account never holds, before the database is asked', async () => {
      for (const account of [
        {},
        { email: 'Someone@Example.org', emailVerifiedBy: 'link' as const },
        { email: email() },
        { orcidId: '9999-0000-0000-0018' },
        { googleId: 'has space' },
        { orcidId: '9999-0000-0000-0019', displayName: 'x'.repeat(81) },
      ]) {
        await expect(createMember(store, account, NOW), JSON.stringify(account)).rejects.toThrow(
          MemberStoreError,
        )
      }
    })

    it('link a method only where it is free, and never take one from another account', async () => {
      const member = await newMember()
      const holder = await newMember({ orcidId: orcid() })
      expect(await applyChanges(store, member.id, { orcidId: orcid() }, NOW)).toBe(true)
      // Another iD while one is linked: the guard refuses.
      expect(await applyChanges(store, member.id, { orcidId: orcid() }, NOW)).toBe(false)
      // An iD of another account: the unique index refuses.
      const fresh = await newMember()
      const error = await applyChanges(store, fresh.id, { orcidId: holder.orcidId! }, NOW).catch(
        (caught: unknown) => caught,
      )
      expect(isUniqueViolation(error)).toBe(true)
      expect((await findMember(store, { id: holder.id }))?.orcidId).toBe(holder.orcidId)
    })

    it('take a Google address only into an account without one; a link replaces it', async () => {
      const member = await newMember({ orcidId: orcid() })
      const gmail = `g${emails++}@gmail.com`
      expect(
        await applyChanges(
          store,
          member.id,
          { googleId: 'g-link-1', email: gmail, emailVerifiedBy: 'google' },
          NOW,
        ),
      ).toBe(true)
      expect(await findMember(store, { id: member.id })).toMatchObject({
        email: gmail,
        emailVerifiedBy: 'google',
        googleId: 'g-link-1',
      })
      const withEmail = await newMember()
      expect(
        await applyChanges(
          store,
          withEmail.id,
          { googleId: 'g-link-2', email: `x${emails++}@gmail.com`, emailVerifiedBy: 'google' },
          NOW,
        ),
      ).toBe(false)
      const replaced = email()
      expect(
        await applyChanges(
          store,
          withEmail.id,
          { email: replaced, emailVerifiedBy: 'link' },
          at(1),
        ),
      ).toBe(true)
      expect(await findMember(store, { id: withEmail.id })).toMatchObject({
        email: replaced,
        emailVerifiedBy: 'link',
        emailVerifiedAt: at(1),
      })
    })

    it('remove a method only while another way in remains, also in the database itself', async () => {
      const member = await newMember({ googleId: 'g-unlink', orcidId: orcid() })
      expect(await applyChanges(store, member.id, { clear: 'googleId' }, NOW)).toBe(true)
      expect(await applyChanges(store, member.id, { clear: 'orcidId' }, NOW)).toBe(false)
      expect((await findMember(store, { id: member.id }))?.orcidId).toBe(member.orcidId)
      // Even a statement without the guard cannot leave the account without a way in.
      expect(await failure(sql`update members set orcid_id = null where id = ${member.id}`)).toBe(
        '23514',
      )
    })

    it('record activity at most once a day, which cancels an inactivity warning', async () => {
      const member = await newMember()
      expect(await touchMember(store, member.id, at(0.5))).toBe(false)
      await db.execute(sql`
        update members set last_seen_at = ${at(-800).toISOString()},
          deletion_warned_at = ${at(-3).toISOString()}, warning_refused_at = ${at(-10).toISOString()}
        where id = ${member.id}`)
      expect(await touchMember(store, member.id, NOW)).toBe(true)
      expect(await findMember(store, { id: member.id })).toMatchObject({
        lastSeenAt: NOW,
        deletionWarnedAt: null,
        warningRefusedAt: null,
      })
    })

    it('mark an address proved by a link, once', async () => {
      const member = await createMember(store, { email: email(), emailVerifiedBy: 'link' }, NOW)
      await db.execute(sql`update members set email_verified_at = null where id = ${member.id}`)
      await markEmailVerified(store, member.id, at(1))
      await markEmailVerified(store, member.id, at(2))
      expect((await findMember(store, { id: member.id }))?.emailVerifiedAt).toEqual(at(1))
    })
  })

  describe('saved items', () => {
    it('save a job once, remove it, and count', async () => {
      const member = await newMember()
      expect(await saveJob(store, member.id, jobs[0]!, NOW)).toBe('saved')
      expect(await saveJob(store, member.id, jobs[0]!, NOW)).toBe('already')
      expect(await saveJob(store, member.id, jobs[1]!, NOW)).toBe('saved')
      expect(await countSavedItems(store, member.id)).toBe(2)
      expect(await unsaveJob(store, member.id, jobs[0]!)).toBe(true)
      expect(await unsaveJob(store, member.id, jobs[0]!)).toBe(false)
      expect(await countSavedItems(store, member.id)).toBe(1)
    })

    it('stop at 500 per member, also for saves at the same moment', async () => {
      const member = await newMember()
      // 499 saved items of jobs that no longer exist (the job link cleared), then two saves at once.
      await db.execute(sql`
        insert into saved_items (member_id, item_type, job_id)
        select ${member.id}, 'job', null from generate_series(1, 499)`)
      const results = await Promise.all([
        saveJob(store, member.id, jobs[0]!, NOW),
        saveJob(store, member.id, jobs[1]!, NOW),
      ])
      expect(results.sort()).toEqual(['full', 'saved'])
      expect(await countSavedItems(store, member.id)).toBe(500)
    })

    it('say which of a page’s jobs the member saved', async () => {
      const member = await newMember()
      const other = await newMember()
      await saveJob(store, member.id, jobs[0]!, NOW)
      await saveJob(store, member.id, jobs[2]!, NOW)
      await saveJob(store, other.id, jobs[1]!, NOW)
      expect(await savedJobIds(store, member.id, jobs)).toEqual(new Set([jobs[0], jobs[2]]))
      expect(await savedJobIds(store, member.id, [jobs[1]!])).toEqual(new Set())
      expect(await savedJobIds(store, member.id, [])).toEqual(new Set())
    })

    it('list the saved jobs, the last saved first, with what says whether they are open', async () => {
      const member = await newMember()
      await saveJob(store, member.id, jobs[1]!, at(-2))
      await saveJob(store, member.id, jobs[0]!, at(-1))
      // A saved item whose job is gone is left out.
      await db.execute(sql`
        insert into saved_items (member_id, item_type, job_id) values (${member.id}, 'job', null)`)
      const listed = await listSavedJobs(store, member.id)
      expect(listed.map((row) => row.jobId)).toEqual([jobs[0], jobs[1]])
      expect(listed[0]).toMatchObject({
        savedAt: at(-1),
        status: 'published',
        deadlineKind: 'fixed',
        deadlineAt: at(30),
        expiredAt: null,
        withdrawnAt: null,
      })
    })
  })

  describe('deleting an account', () => {
    it('leaves nothing of the member but the log row, and keeps a pending data request', async () => {
      const address = email()
      const member = await createMember(
        store,
        { email: address, emailVerifiedBy: 'link', orcidId: orcid() },
        NOW,
      )
      const other = await newMember()
      await createSession(store, member.id, NOW)
      await createSession(store, member.id, NOW)
      await saveJob(store, member.id, jobs[2]!, NOW)
      for (const [order, term] of subfields.entries()) {
        await db.execute(sql`
          insert into members_rels ("order", parent_id, path, terms_id)
          values (${order + 1}, ${member.id}, 'subfieldPrefs', ${term})`)
      }
      // A sign-in link to the address (no member yet), an address link of the member, and a
      // data request sent from the address minutes earlier.
      await createEmailToken(store, { purpose: 'sign-in', email: address, locale: 'en' }, NOW)
      await createEmailToken(
        store,
        { purpose: 'verify-email', email: email(), memberId: member.id, locale: 'en' },
        NOW,
      )
      const request = await createEmailToken(
        store,
        { purpose: 'data-request', email: address, locale: 'en', requestData: { kind: 'access' } },
        NOW,
      )
      const otherSession = await createSession(store, other.id, NOW)

      expect(await deleteMember(store, member.id, { reason: 'request' }, NOW)).toBe(true)

      expect(await findMember(store, { id: member.id })).toBeNull()
      expect(await sessionsOf(member.id)).toBe(0)
      expect(
        await count(sql`select count(*)::int as n from saved_items where member_id = ${member.id}`),
      ).toBe(0)
      expect(
        await count(
          sql`select count(*)::int as n from members_rels where parent_id = ${member.id}`,
        ),
      ).toBe(0)
      expect(
        await count(sql`
          select count(*)::int as n from email_tokens
          where member_id = ${member.id} or (email = ${address} and purpose <> 'data-request')`),
      ).toBe(0)
      // Nothing was left behind with its member link cleared either.
      expect(
        await count(sql`select count(*)::int as n from member_sessions where member_id is null`),
      ).toBe(0)
      expect(await findEmailToken(store, request.token, NOW)).toMatchObject({
        purpose: 'data-request',
      })
      expect(
        await rows(sql`
          select target_collection, target_id::int as target_id, action from deletion_log
          where target_collection = 'members' and target_id = ${member.id}`),
      ).toEqual([{ target_collection: 'members', target_id: member.id, action: 'delete' }])
      // Other members are untouched.
      expect(await findSession(store, otherSession.token, NOW)).not.toBeNull()
      // Deleting again changes nothing.
      expect(await deleteMember(store, member.id, { reason: 'request' }, NOW)).toBe(false)
    })

    it('repeats a logged deletion after a restore without logging it again', async () => {
      // Created at NOW, the deletion logged a day later; the restore brought the member back.
      const member = await newMember()
      const reapply = { reason: 'reapply', loggedAt: at(1) } as const
      expect(await deleteMember(store, member.id, reapply, at(2))).toBe(true)
      expect(await findMember(store, { id: member.id })).toBeNull()
      expect(
        await count(sql`
          select count(*)::int as n from deletion_log
          where target_collection = 'members' and target_id = ${member.id}`),
      ).toBe(0)
    })

    it('never repeats a logged deletion on a newer member who got the same ID after a restore', async () => {
      const member = await newMember()
      expect(await deleteMember(store, member.id, { reason: 'request' }, at(1))).toBe(true)
      const [logged] = await rows<{ at: string | Date }>(sql`
        select at from deletion_log
        where target_collection = 'members' and target_id = ${member.id}`)
      // A restore set the sequence back, and someone else joined the next day with the same ID.
      const joined = at(2).toISOString()
      await db.execute(sql`
        insert into members (id, email, email_verified_at, email_verified_by, digest_opt_in,
          last_seen_at, created_at, updated_at)
        values (${member.id}, ${email()}, ${joined}, 'link', false, ${joined}, ${joined}, ${joined})`)
      const session = await createSession(store, member.id, at(2))
      await saveJob(store, member.id, jobs[0]!, at(2))

      const reapply = { reason: 'reapply', loggedAt: new Date(logged!.at) } as const
      expect(await deleteMember(store, member.id, reapply, at(3))).toBe(false)
      expect(await findMember(store, { id: member.id })).not.toBeNull()
      expect(await findSession(store, session.token, at(3))).not.toBeNull()
      expect(await countSavedItems(store, member.id)).toBe(1)
      // A logged time that is not a date is refused, never read as "no condition".
      await expect(
        deleteMember(
          store,
          member.id,
          { reason: 'reapply', loggedAt: new Date(Number.NaN) },
          at(3),
        ),
      ).rejects.toThrow(MemberStoreError)
      expect(await findMember(store, { id: member.id })).not.toBeNull()
    })

    it('for inactivity, keeps a member who came back between selection and deletion', async () => {
      const warned = async () => {
        const member = await newMember()
        await db.execute(sql`
          update members set last_seen_at = ${at(-800).toISOString()},
            deletion_warned_at = ${at(-31).toISOString()}
          where id = ${member.id}`)
        return member
      }
      const away = await warned()
      const back = await warned()
      await touchMember(store, back.id, NOW)
      const inactivity = { reason: 'inactivity', condition: 'warned' } as const
      expect(await deleteMember(store, back.id, inactivity, NOW)).toBe(false)
      expect(await findMember(store, { id: back.id })).not.toBeNull()
      expect(await deleteMember(store, away.id, inactivity, NOW)).toBe(true)
      // Warned less than 30 days ago: not yet.
      const recent = await newMember()
      await db.execute(sql`
        update members set last_seen_at = ${at(-800).toISOString()},
          deletion_warned_at = ${at(-29).toISOString()}
        where id = ${recent.id}`)
      expect(await deleteMember(store, recent.id, inactivity, NOW)).toBe(false)
    })

    it('for inactivity without an address, waits 24 months and 30 days', async () => {
      const condition = { reason: 'inactivity', condition: 'without-email' } as const
      const orcidOnly = await newMember({ orcidId: orcid() })
      // 24 months and 29 days: kept.
      await db.execute(sql`
        update members set last_seen_at = ${new Date(Date.UTC(2024, 8, 2, 12)).toISOString()}
        where id = ${orcidOnly.id}`)
      expect(await deleteMember(store, orcidOnly.id, condition, NOW)).toBe(false)
      await db.execute(sql`
        update members set last_seen_at = ${new Date(Date.UTC(2024, 8, 1, 12)).toISOString()}
        where id = ${orcidOnly.id}`)
      expect(await deleteMember(store, orcidOnly.id, condition, NOW)).toBe(true)
      // A member with an address is never deleted this way (they are warned first).
      const withEmail = await newMember()
      await db.execute(sql`
        update members set last_seen_at = ${at(-2000).toISOString()} where id = ${withEmail.id}`)
      expect(await deleteMember(store, withEmail.id, condition, NOW)).toBe(false)
    })
  })

  describe('redeeming a sign-in link (sign-in-link.ts)', () => {
    const link = async (address: string, next: string | null = null, save: string | null = null) =>
      (
        await createEmailToken(
          store,
          {
            purpose: 'sign-in',
            email: address,
            browserHash: hashToken(newBinding()),
            next,
            save,
            locale: 'en',
          },
          NOW,
        )
      ).token

    it('makes the account for a new address, once, and ends its other links', async () => {
      const address = email()
      const first = await link(address, '/en/jobs/')
      const other = await link(address)
      const used = await redeemSignInLink(store, first, at(0))
      expect(used).toEqual({
        memberId: expect.any(Number),
        created: true,
        next: '/en/jobs/',
        save: null,
      })
      expect(await findMember(store, { email: address })).toMatchObject({
        id: used!.memberId,
        emailVerifiedBy: 'link',
      })
      expect(await redeemSignInLink(store, first, at(0))).toBeNull()
      expect(await findEmailToken(store, other, NOW)).toBeNull()
    })

    it('signs in to the member who has the address', async () => {
      const member = await newMember()
      expect(await redeemSignInLink(store, await link(member.email!), NOW)).toEqual({
        memberId: member.id,
        created: false,
        next: null,
        save: null,
      })
    })

    it('gives back the position a Save link asked to save, for the route to save', async () => {
      const member = await newMember()
      expect(
        await redeemSignInLink(store, await link(member.email!, '/en/jobs/', 'job:k3f9a'), NOW),
      ).toMatchObject({ memberId: member.id, next: '/en/jobs/', save: 'job:k3f9a' })
    })

    it('gives two links to one new address used at once one account', async () => {
      const address = email()
      const [a, b] = [await link(address), await link(address)]
      const results = await Promise.all([
        redeemSignInLink(store, a, NOW),
        redeemSignInLink(store, b, NOW),
      ])
      const used = results.filter((result) => result !== null)
      expect(used.length).toBeGreaterThanOrEqual(1)
      expect(new Set(used.map((result) => result.memberId)).size).toBe(1)
      expect(used.filter((result) => result.created)).toHaveLength(1)
    })

    it('counts signing in as activity, which cancels a pending inactivity warning', async () => {
      const member = await newMember()
      await db.execute(sql`
        update members set last_seen_at = ${at(-800).toISOString()},
          deletion_warned_at = ${at(-31).toISOString()}, warning_refused_at = ${at(-40).toISOString()}
        where id = ${member.id}`)
      // Wherever the link leads: no page there has to read the session for this.
      const used = await redeemSignInLink(store, await link(member.email!, '/en/jobs/'), NOW)
      await createSession(store, used!.memberId, NOW)
      expect(await findMember(store, { id: member.id })).toMatchObject({
        lastSeenAt: NOW,
        deletionWarnedAt: null,
        warningRefusedAt: null,
      })
      // So the inactivity rule keeps the account.
      const inactivity = { reason: 'inactivity', condition: 'warned' } as const
      expect(await deleteMember(store, member.id, inactivity, NOW)).toBe(false)
      expect(await findMember(store, { id: member.id })).not.toBeNull()
    })

    it('uses no link of another purpose, and none that has expired', async () => {
      const member = await newMember()
      const { token: verify } = await createEmailToken(
        store,
        { purpose: 'verify-email', email: email(), memberId: member.id, locale: 'en' },
        NOW,
      )
      expect(await redeemSignInLink(store, verify, NOW)).toBeNull()
      expect(await findEmailToken(store, verify, NOW)).not.toBeNull()
      const old = await link(email())
      expect(await redeemSignInLink(store, old, at(1))).toBeNull()
      expect(await redeemSignInLink(store, 'not a token', NOW)).toBeNull()
    })
  })

  describe('settings', () => {
    it('switch Glia Notes on only for an account with an address, and off in one statement', async () => {
      const member = await newMember()
      expect(await setDigest(store, member.id, { optIn: true, version: '2026-09-27' }, NOW)).toBe(
        true,
      )
      expect(await findMember(store, { id: member.id })).toMatchObject({
        digestOptIn: true,
        digestChangedAt: NOW,
        digestConsentVersion: '2026-09-27',
      })
      expect(await setDigest(store, member.id, { optIn: false }, at(1))).toBe(true)
      expect(await findMember(store, { id: member.id })).toMatchObject({
        digestOptIn: false,
        digestChangedAt: at(1),
        // The text agreed to stays with the record of the choice.
        digestConsentVersion: '2026-09-27',
      })
      const orcidOnly = await newMember({ orcidId: orcid() })
      expect(
        await setDigest(store, orcidOnly.id, { optIn: true, version: '2026-09-27' }, NOW),
      ).toBe(false)
      expect(await findMember(store, { id: orcidOnly.id })).toMatchObject({ digestOptIn: false })
      await expect(setDigest(store, member.id, { optIn: true, version: '' }, NOW)).rejects.toThrow(
        MemberStoreError,
      )
    })

    it('store the preferred subfields that are active subfields, at most 12, and replace them', async () => {
      const member = await newMember()
      const slugs = await rows<{ slug: string }>(sql`
        select slug from terms where vocabulary = 'subfield' order by sort_order, id limit 13`)
      const [first, second, third] = slugs.map((row) => row.slug)
      // Another vocabulary's slug, and one that names nothing, are not stored.
      expect(
        await setPreferredSubfields(store, member.id, [second!, first!, 'phd', 'no-such'], NOW),
      ).toBe(2)
      expect((await preferredSubfields(store, member.id)).map((row) => row.slug)).toEqual([
        first,
        second,
      ])
      // Payload's own rows for the field, in its order.
      expect(
        await rows(sql`select "order", path from members_rels where parent_id = ${member.id}
          order by "order"`),
      ).toEqual([
        { order: 1, path: 'subfieldPrefs' },
        { order: 2, path: 'subfieldPrefs' },
      ])
      expect(await setPreferredSubfields(store, member.id, [third!], NOW)).toBe(1)
      expect((await preferredSubfields(store, member.id)).map((row) => row.slug)).toEqual([third])
      await expect(
        setPreferredSubfields(
          store,
          member.id,
          slugs.map((row) => row.slug),
          NOW,
        ),
      ).rejects.toThrow(MemberStoreError)
      expect(await setPreferredSubfields(store, member.id, [], NOW)).toBe(0)
      expect(await preferredSubfields(store, member.id)).toEqual([])
      await expect(setPreferredSubfields(store, 999_999, [first!], NOW)).rejects.toThrow(
        MemberStoreError,
      )
    })

    it('leave out a retired subfield from the preferences, without deleting it', async () => {
      const member = await newMember()
      const [term] = await rows<{ id: number; slug: string }>(sql`
        select id, slug from terms where vocabulary = 'subfield' order by sort_order desc limit 1`)
      expect(await setPreferredSubfields(store, member.id, [term!.slug], NOW)).toBe(1)
      await db.execute(sql`update terms set is_active = false where id = ${term!.id}`)
      try {
        expect(await preferredSubfields(store, member.id)).toEqual([])
        expect(await setPreferredSubfields(store, member.id, [term!.slug], NOW)).toBe(0)
      } finally {
        await db.execute(sql`update terms set is_active = true where id = ${term!.id}`)
      }
    })

    it('set and remove the display name, refusing what cannot be stored', async () => {
      const member = await newMember()
      expect(await setDisplayName(store, member.id, 'Josiah Carberry', NOW)).toBe(true)
      expect(await findMember(store, { id: member.id })).toMatchObject({
        displayName: 'Josiah Carberry',
      })
      expect(await setDisplayName(store, member.id, null, NOW)).toBe(true)
      expect(await findMember(store, { id: member.id })).toMatchObject({ displayName: null })
      for (const name of ['', 'a'.repeat(81), 'Bell\u0007', 'Ana\u0085Bob', 'Ana\u202EBob']) {
        await expect(setDisplayName(store, member.id, name, NOW)).rejects.toMatchObject({
          name: 'MemberStoreError',
          code: 'invalid',
          target: 'displayName',
        })
      }
    })
  })

  describe('redeeming a link to add an address (verify-email.ts)', () => {
    const link = async (memberId: number, address: string, now = NOW) =>
      (
        await createEmailToken(
          store,
          { purpose: 'verify-email', email: address, memberId, locale: 'en' },
          now,
        )
      ).token

    it('adds the address to the member who asked, or replaces theirs', async () => {
      const orcidOnly = await newMember({ orcidId: orcid() })
      const address = email()
      expect(
        await redeemVerifyLink(store, await link(orcidOnly.id, address), orcidOnly.id, NOW),
      ).toEqual({ kind: 'verified', changed: true })
      expect(await findMember(store, { id: orcidOnly.id })).toMatchObject({
        email: address,
        emailVerifiedBy: 'link',
        emailVerifiedAt: NOW,
      })
      const replacement = email()
      expect(
        await redeemVerifyLink(
          store,
          await link(orcidOnly.id, replacement, at(1)),
          orcidOnly.id,
          at(1),
        ),
      ).toEqual({ kind: 'verified', changed: true })
      expect(await findMember(store, { id: orcidOnly.id })).toMatchObject({ email: replacement })
      // Its own address again: nothing changes.
      expect(
        await redeemVerifyLink(
          store,
          await link(orcidOnly.id, replacement, at(1)),
          orcidOnly.id,
          at(1),
        ),
      ).toEqual({ kind: 'verified', changed: false })
    })

    it('works only for the member who asked: anyone else leaves the link usable', async () => {
      const member = await newMember()
      const other = await newMember()
      const token = await link(member.id, email())
      expect(await redeemVerifyLink(store, token, other.id, NOW)).toBeNull()
      expect(await findEmailToken(store, token, NOW)).not.toBeNull()
      expect(await redeemVerifyLink(store, token, member.id, NOW)).toMatchObject({
        kind: 'verified',
      })
      // Used once.
      expect(await redeemVerifyLink(store, token, member.id, NOW)).toBeNull()
    })

    it('never takes an address from another account: the two are never merged', async () => {
      const holder = await newMember()
      const member = await newMember({ orcidId: orcid() })
      expect(
        await redeemVerifyLink(store, await link(member.id, holder.email!), member.id, NOW),
      ).toEqual({ kind: 'refused', reason: 'email-taken' })
      expect(await findMember(store, { id: member.id })).toMatchObject({ email: null })
      expect(await findMember(store, { id: holder.id })).toMatchObject({ email: holder.email })
    })

    it('uses no sign-in link and none that has expired', async () => {
      const member = await newMember()
      const { token: signIn } = await createEmailToken(
        store,
        { purpose: 'sign-in', email: email(), locale: 'en' },
        NOW,
      )
      expect(await redeemVerifyLink(store, signIn, member.id, NOW)).toBeNull()
      expect(await findEmailToken(store, signIn, NOW)).not.toBeNull()
      expect(
        await redeemVerifyLink(store, await link(member.id, email()), member.id, at(1.01)),
      ).toBeNull()
    })
  })

  // Last: it drops the member tables and makes them again, empty.
  describe('the migrations', () => {
    it('of the member tasks can be undone and redone, with the trigger that keeps a recorded send', async () => {
      const trigger = () =>
        count(sql`
          select count(*)::int as n from pg_trigger
          where tgname = 'data_requests_keep_confirmation_sent_at'`)
      const taskNames = () =>
        count(sql`
          select count(*)::int as n from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname in ('enum_payload_jobs_task_slug', 'enum_payload_jobs_log_task_slug')
            and e.enumlabel in ('applyDeletionLog', 'purgeMemberAuth', 'cleanInactiveMembers',
              'sendRequestEmails')`)
      expect(await trigger()).toBe(1)
      expect(await taskNames()).toBe(8)
      // A recorded send stays, against a save that read the row before the email went.
      const { rows: created } = await db.execute<{ id: number }>(sql`
        insert into data_requests (kind, source, status, action, locale, received_at,
          closed_at, confirmation_sent_at)
        values ('deletion', 'account', 'closed', 'deleted-automatically', 'en', now(), now(), now())
        returning id`)
      const id = created[0]!.id
      await db.execute(sql`update data_requests set confirmation_sent_at = null where id = ${id}`)
      expect(
        await count(sql`
          select count(*)::int as n from data_requests
          where id = ${id} and confirmation_sent_at is not null`),
      ).toBe(1)
      await memberTasks.down({ db } as never)
      expect(await trigger()).toBe(0)
      expect(await taskNames()).toBe(0)
      await memberTasks.up({ db } as never)
      expect(await trigger()).toBe(1)
      expect(await taskNames()).toBe(8)
    })

    it('of the data-request guards can be undone and redone', async () => {
      const trigger = () =>
        count(sql`
          select count(*)::int as n from pg_trigger where tgname = 'data_requests_stay_confirmed'`)
      const noted = () =>
        failure(sql`
          insert into data_requests (kind, status, source, locale, action_note)
          values ('access', 'unconfirmed', 'form', 'en', 'A note.')`)
      expect(await trigger()).toBe(1)
      expect(await noted()).toBe('23514')

      // A confirmed request never goes back to unconfirmed, and keeps what was stored.
      const { rows: created } = await db.execute<{ id: number }>(sql`
        insert into data_requests (kind, source, status, locale, email, details, received_at)
        values ('access', 'email', 'new', 'en', 'kept@example.org', 'A copy, please.', now())
        returning id`)
      const id = created[0]!.id
      expect(
        await failure(sql`
          update data_requests set status = 'unconfirmed', email = null, details = null
          where id = ${id}`),
      ).toBe('23514')
      await db.execute(sql`update data_requests set email = null, details = null where id = ${id}`)
      expect(
        await rows<{ email: string; details: string }>(sql`
          select email, details from data_requests where id = ${id}`),
      ).toEqual([{ email: 'kept@example.org', details: 'A copy, please.' }])

      await requestGuards.down({ db } as never)
      expect(await trigger()).toBe(0)
      expect(await noted()).toBe('no error')
      // Up again: the note written meanwhile goes first, then the check holds again.
      await requestGuards.up({ db } as never)
      expect(await trigger()).toBe(1)
      expect(await noted()).toBe('23514')
      expect(
        await count(sql`
          select count(*)::int as n from data_requests
          where status = 'unconfirmed' and action_note is not null`),
      ).toBe(0)
    })

    it('can be undone and redone, the constraints first', async () => {
      const tables = () =>
        rows<{ table_name: string }>(sql`
          select table_name from information_schema.tables
          where table_schema = 'public' and table_name in ('members', 'members_rels',
            'member_sessions', 'email_tokens', 'saved_items', 'deletion_log', 'data_requests')
          order by table_name`)
      const lockColumn = () =>
        count(sql`
          select count(*)::int as n from information_schema.columns
          where table_name = 'payload_locked_documents_rels' and column_name = 'data_requests_id'`)
      expect(await tables()).toHaveLength(7)
      await constraints.down({ db } as never)
      await members.down({ db } as never)
      expect(await tables()).toEqual([])
      expect(await lockColumn()).toBe(0)
      await members.up({ db } as never)
      await constraints.up({ db } as never)
      expect(await tables()).toHaveLength(7)
      expect(await lockColumn()).toBe(1)
      expect(await newMember()).toMatchObject({ id: expect.any(Number) })
    })
  })
})
