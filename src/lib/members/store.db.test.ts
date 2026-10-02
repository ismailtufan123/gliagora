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
import * as newsletter from '@/migrations/20261002_161547_newsletter'
import * as newsletterConstraints from '@/migrations/20261002_190000_newsletter_constraints'
import * as membersSync from '@/migrations/20261002_200000_members_sync'
import * as membersSyncConstraints from '@/migrations/20261002_210000_members_sync_constraints'

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
  deletePendingLinks,
  deleteSignInTokens,
  digestHolders,
  endAllSessions,
  endOtherSessions,
  endSession,
  findEmailToken,
  findMember,
  findSession,
  isUniqueViolation,
  joinDigestBySignup,
  leaveDigestByUnsubscribe,
  listSavedJobs,
  lockPendingDigest,
  markDigestPending,
  markEmailVerified,
  pendingDigestMembers,
  preferredSubfields,
  saveJob,
  savedJobIds,
  setDigest,
  setDisplayName,
  setPreferredSubfields,
  storeDigestSync,
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
  /** The scratch database, as its owner (a second connection, for a test of row locks). */
  let scratchUrl = ''
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
    scratchUrl = url.toString()
    db = drizzle(scratchUrl)
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

  /** What a Glia Notes signup's link holds besides the address (M2). */
  const signupData = {
    version: '2026-09-27',
    source: 'newsletter-form',
    requestedAt: NOW.toISOString(),
  }

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
          '_email_tokens_v', '_saved_items_v', '_deletion_log_v', '_data_requests_v',
          '_consent_log_v')`)
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
      // Ten for members and data requests (M4b), one for Glia Notes' links and four for members'
      // Glia Notes (M2).
      expect(await names()).toHaveLength(15)
      // The later migrations first (one widens a check, others add more), as migrations run
      // backwards.
      await membersSyncConstraints.down({ db } as never)
      await newsletterConstraints.down({ db } as never)
      await requestGuards.down({ db } as never)
      await constraints.down({ db } as never)
      expect(await names()).toEqual([])
      await constraints.up({ db } as never)
      await requestGuards.up({ db } as never)
      await newsletterConstraints.up({ db } as never)
      await membersSyncConstraints.up({ db } as never)
      expect(await names()).toHaveLength(15)
    })

    it("refuse a member's Glia Notes subscriber named by half, or malformed, and a free-text version (M2)", async () => {
      const member = await newMember()
      const set = (values: SQL) =>
        failure(sql`update members set ${values} where id = ${member.id}`)
      const uuid = '0b2c6f8e-3f0a-4c1e-9d55-000000000001'
      for (const [values, name] of [
        [sql`digest_subscriber_id = 1`, 'id without uuid'],
        [sql`digest_subscriber_uuid = ${uuid}`, 'uuid without id'],
        [sql`digest_subscriber_id = 0, digest_subscriber_uuid = ${uuid}`, 'id 0'],
        [sql`digest_subscriber_id = 1.5, digest_subscriber_uuid = ${uuid}`, 'id 1.5'],
        [sql`digest_subscriber_id = 2147483648, digest_subscriber_uuid = ${uuid}`, 'id too large'],
        [sql`digest_subscriber_id = 1, digest_subscriber_uuid = ${uuid.toUpperCase()}`, 'uuid'],
        [sql`digest_consent_version = 'someone@example.org'`, 'version'],
      ] as const) {
        expect(await set(values), name).toBe('23514')
      }
      expect(await set(sql`digest_subscriber_id = 1, digest_subscriber_uuid = ${uuid}`)).toBe(
        'no error',
      )
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

    it('keep a Glia Notes signup 7 days, with what its consent record needs (M2)', async () => {
      const address = email()
      const signup = signupData
      const first = await createEmailToken(
        store,
        { purpose: 'newsletter', email: address, locale: 'en', requestData: signup },
        NOW,
      )
      const second = await createEmailToken(
        store,
        { purpose: 'newsletter', email: address, locale: 'en', requestData: signup },
        NOW,
      )
      expect(first.expiresAt).toEqual(at(7))
      expect(await findEmailToken(store, first.token, new Date(at(7).getTime() - 1))).toMatchObject(
        { purpose: 'newsletter', email: address, requestData: signup, createdAt: NOW },
      )
      expect(await findEmailToken(store, first.token, at(7))).toBeNull()
      // It works for its own purpose only, and using one ends the address's others.
      expect(await consumeEmailToken(store, first.token, 'sign-in', NOW)).toBeNull()
      expect(await consumeEmailToken(store, first.token, 'newsletter', NOW)).toMatchObject({
        email: address,
      })
      expect(await deletePendingLinks(store, 'sign-in', address)).toBe(0)
      expect(await deletePendingLinks(store, 'newsletter', address)).toBe(1)
      expect(await findEmailToken(store, second.token, NOW)).toBeNull()
    })

    it('refuse a Glia Notes signup without its consent data, or bound to a member or browser', async () => {
      const member = await newMember()
      const signup = signupData
      for (const input of [
        { purpose: 'newsletter' as const, email: email(), locale: 'en' as const },
        {
          purpose: 'newsletter' as const,
          email: email(),
          locale: 'en' as const,
          requestData: { ...signup, version: 'someone@example.org' },
        },
        {
          purpose: 'newsletter' as const,
          email: email(),
          locale: 'en' as const,
          requestData: { version: signup.version, source: signup.source },
        },
        {
          purpose: 'newsletter' as const,
          email: email(),
          locale: 'en' as const,
          requestData: signup,
          next: '/en/account/',
        },
        {
          purpose: 'newsletter' as const,
          email: email(),
          locale: 'en' as const,
          requestData: { ...signup, extra: 'x' },
        },
        {
          purpose: 'newsletter' as const,
          email: email(),
          locale: 'en' as const,
          requestData: signup,
          browserHash: hashToken('x'),
        },
        {
          purpose: 'newsletter' as const,
          email: email(),
          locale: 'en' as const,
          requestData: signup,
          memberId: member.id,
        },
      ]) {
        await expect(createEmailToken(store, input, NOW), JSON.stringify(input)).rejects.toThrow(
          MemberStoreError,
        )
      }
      // The database refuses the same, whoever writes: exactly the version (in the consent
      // records' format), the form and the form's time, and no binding, `next` or `save`.
      expect(
        await failure(sql`
          insert into email_tokens (token_hash, purpose, email, locale, expires_at)
          values (${hashToken(newToken())}, 'newsletter', ${email()}, 'en', now())`),
      ).toBe('23514')
      expect(
        await failure(sql`
          insert into email_tokens (token_hash, purpose, email, locale, member_id, request_data,
            expires_at)
          values (${hashToken(newToken())}, 'newsletter', ${email()}, 'en', ${member.id},
            ${JSON.stringify(signup)}::jsonb, now())`),
      ).toBe('23514')
      const stored = (data: unknown, next: string | null = null) =>
        failure(sql`
          insert into email_tokens (token_hash, purpose, email, locale, request_data, next,
            expires_at)
          values (${hashToken(newToken())}, 'newsletter', ${email()}, 'en',
            ${JSON.stringify(data)}::jsonb, ${next}, now())`)
      for (const [data, name] of [
        [{ ...signup, version: 'someone@example.org' }, 'an address as the version'],
        [{ ...signup, name: 'Reader' }, 'another key'],
        [{ version: signup.version, source: signup.source }, 'no time'],
        [{ ...signup, requestedAt: 'yesterday' }, 'a time that is not ISO'],
        [{ ...signup, source: 'account' }, 'another source'],
        ['a string', 'not an object'],
        [[signup], 'an array'],
      ] as const) {
        expect(await stored(data), name).toBe('23514')
      }
      expect(await stored(signup, '/en/'), 'next').toBe('23514')
      expect(await stored(signup), 'the right shape').toBe('no error')
    })

    it('let two confirmations of one address end each other’s links without waiting (no deadlock)', async () => {
      const address = email()
      const input = { purpose: 'newsletter' as const, email: address, locale: 'en' as const }
      const a = await createEmailToken(store, { ...input, requestData: signupData }, NOW)
      const b = await createEmailToken(store, { ...input, requestData: signupData }, NOW)
      const consumed: Array<() => void> = []
      const bothConsumed = new Promise<void>((resolve) => {
        let left = 2
        consumed.push(() => (--left === 0 ? resolve() : undefined))
      })
      // Each holds its own link (consumed), then ends the address's others: without SKIP LOCKED
      // each would wait for the other's row, and PostgreSQL would refuse one (40P01).
      const confirm = (token: string) =>
        db.transaction(async (tx) => {
          const own = tx as unknown as MemberDb
          expect(await consumeEmailToken(own, token, 'newsletter', NOW)).not.toBeNull()
          consumed[0]!()
          await bothConsumed
          return deletePendingLinks(own, 'newsletter', address)
        })
      expect(await Promise.all([confirm(a.token), confirm(b.token)])).toEqual([0, 0])
      expect(
        await count(sql`select count(*)::int as n from email_tokens where email = ${address}`),
      ).toBe(0)
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

    it('leave every change of the choice, and of the address while on, waiting for the sync (M2)', async () => {
      const member = await newMember()
      const waiting = async () =>
        (await pendingDigestMembers(store, { after: 0, limit: 1000 })).includes(member.id)
      expect(await waiting()).toBe(false)
      expect(await setDigest(store, member.id, { optIn: true, version: '2026-09-27' }, NOW)).toBe(
        true,
      )
      expect(await waiting()).toBe(true)
      // The sync holds the row: another transaction skips it rather than waiting.
      await db.transaction(async (tx) => {
        const locked = await lockPendingDigest(tx as unknown as MemberDb, member.id)
        expect(locked).toMatchObject({ id: member.id, digestOptIn: true, digestSyncedAt: null })
        const other = drizzle(scratchUrl)
        try {
          expect(await lockPendingDigest(other as unknown as MemberDb, member.id)).toBeNull()
        } finally {
          await other.$client.end()
        }
        await storeDigestSync(
          tx as unknown as MemberDb,
          member.id,
          { id: 7, uuid: '0b2c6f8e-3f0a-4c1e-9d55-000000000007' },
          at(1),
        )
      })
      expect(await waiting()).toBe(false)
      expect(await findMember(store, { id: member.id })).toMatchObject({
        digestSyncedAt: at(1),
        digestSubscriber: { id: 7, uuid: '0b2c6f8e-3f0a-4c1e-9d55-000000000007' },
      })
      expect(await lockPendingDigest(store, member.id)).toBeNull()
      // A new address waits (the choice and its time stay); the same address does not.
      const address = email()
      expect(
        await applyChanges(store, member.id, { email: address, emailVerifiedBy: 'link' }, at(2)),
      ).toBe(true)
      expect(await waiting()).toBe(true)
      expect(await findMember(store, { id: member.id })).toMatchObject({
        digestChangedAt: NOW,
        digestSyncedAt: null,
      })
      await storeDigestSync(
        store,
        member.id,
        { id: 7, uuid: '0b2c6f8e-3f0a-4c1e-9d55-000000000007' },
        at(3),
      )
      await applyChanges(store, member.id, { email: address, emailVerifiedBy: 'link' }, at(4))
      expect(await waiting()).toBe(false)
      // A change made while the sync held the row, with an earlier clock, still waits.
      expect(await setDigest(store, member.id, { optIn: false }, at(2))).toBe(true)
      expect(await waiting()).toBe(true)
      // Off, a new address does not wait.
      await storeDigestSync(store, member.id, null, at(5))
      await applyChanges(store, member.id, { email: email(), emailVerifiedBy: 'link' }, at(6))
      expect(await waiting()).toBe(false)
      // A version that is not one is refused before the database is asked.
      await expect(
        setDigest(store, member.id, { optIn: true, version: 'agreed on Monday' }, at(7)),
      ).rejects.toMatchObject({ code: 'invalid' })
    })

    it('follow a signup through the form and an unsubscribe of the address (M2)', async () => {
      const uuid = (n: number) => `0b2c6f8e-3f0a-4c1e-9d55-${String(n).padStart(12, '0')}`
      const member = await newMember()
      // A confirmed signup of the member's address: on, synced, with the form's version.
      expect(
        await joinDigestBySignup(
          store,
          member.email!,
          { id: 11, uuid: uuid(11) },
          '2026-09-27',
          at(1),
        ),
      ).toBe(1)
      expect(await findMember(store, { id: member.id })).toMatchObject({
        digestOptIn: true,
        digestChangedAt: at(1),
        digestSyncedAt: at(1),
        digestConsentVersion: '2026-09-27',
        digestSubscriber: { id: 11, uuid: uuid(11) },
      })
      // Unsubscribed: off, synced, without a subscriber.
      expect(
        await leaveDigestByUnsubscribe(store, member.email, { id: 11, uuid: uuid(11) }, at(2)),
      ).toBe(1)
      expect(await findMember(store, { id: member.id })).toMatchObject({
        digestOptIn: false,
        digestChangedAt: at(2),
        digestSyncedAt: at(2),
        digestSubscriber: null,
      })
      // A member already off without a subscriber is left as it was.
      expect(
        await leaveDigestByUnsubscribe(store, member.email, { id: 11, uuid: uuid(11) }, at(3)),
      ).toBe(0)

      // A member whose row still names another subscriber (an address change not synced yet)
      // keeps it, waiting for the sync, which deletes it.
      await storeDigestSync(store, member.id, { id: 12, uuid: uuid(12) }, at(4))
      expect(
        await joinDigestBySignup(
          store,
          member.email!,
          { id: 13, uuid: uuid(13) },
          '2026-09-27',
          at(5),
        ),
      ).toBe(1)
      expect(await findMember(store, { id: member.id })).toMatchObject({
        digestOptIn: true,
        digestSyncedAt: null,
        digestSubscriber: { id: 12, uuid: uuid(12) },
      })
      // Unsubscribing that other subscriber by its link reaches the member by the subscriber.
      const other = await newMember()
      await storeDigestSync(store, other.id, { id: 14, uuid: uuid(14) }, at(4))
      await setDigest(store, other.id, { optIn: true, version: '2026-09-27' }, at(3))
      await storeDigestSync(store, other.id, { id: 14, uuid: uuid(14) }, at(4))
      expect(
        await leaveDigestByUnsubscribe(
          store,
          'old-address@example.org',
          { id: 14, uuid: uuid(14) },
          at(6),
        ),
      ).toBe(1)
      expect(await findMember(store, { id: other.id })).toMatchObject({
        digestOptIn: false,
        digestSubscriber: null,
      })
    })

    it('mark a member whose subscriber is gone as waiting, only while the row names it (M2)', async () => {
      const uuid = '0b2c6f8e-3f0a-4c1e-9d55-000000000021'
      const member = await newMember()
      await setDigest(store, member.id, { optIn: true, version: '2026-09-27' }, NOW)
      await storeDigestSync(store, member.id, { id: 21, uuid }, at(1))
      const held = (await digestHolders(store, { after: 0, limit: 1000 })).find(
        (holder) => holder.memberId === member.id,
      )
      expect(held).toEqual({ memberId: member.id, subscriber: { id: 21, uuid } })
      expect(
        await markDigestPending(
          store,
          {
            memberId: member.id,
            subscriber: { id: 21, uuid: '0b2c6f8e-3f0a-4c1e-9d55-000000000022' },
          },
          at(2),
        ),
      ).toBe(false)
      expect(await markDigestPending(store, held!, at(2))).toBe(true)
      expect(await findMember(store, { id: member.id })).toMatchObject({ digestSyncedAt: null })
      // Waiting, it is no holder for the check.
      expect(
        (await digestHolders(store, { after: 0, limit: 1000 })).some(
          (holder) => holder.memberId === member.id,
        ),
      ).toBe(false)
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

    it('of Glia Notes can be undone and redone, the constraints first (M2)', async () => {
      const enumLabels = (type: string) =>
        rows<{ label: string }>(sql`
          select e.enumlabel as label from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = ${type} order by e.enumsortorder`).then((r) => r.map((x) => x.label))
      const consentTable = () =>
        count(sql`
          select count(*)::int as n from information_schema.tables
          where table_schema = 'public' and table_name = 'consent_log'`)
      const checks = () =>
        rows<{ conname: string }>(sql`
          select conname from pg_constraint
          where conname in ('consent_log_uuid_format_check', 'consent_log_version_check',
            'consent_log_version_format_check', 'consent_log_source_check',
            'consent_log_subscriber_id_check', 'consent_log_subscriber_check',
            'email_tokens_newsletter_check')
          order by conname`).then((r) => r.map((x) => x.conname))
      expect(await checks()).toHaveLength(7)
      expect(await consentTable()).toBe(1)

      // Rows of the new values, which the old types cannot hold, go with the down; others stay.
      const kept = email()
      await createEmailToken(store, { purpose: 'sign-in', email: kept, locale: 'en' }, NOW)
      await createEmailToken(
        store,
        {
          purpose: 'newsletter',
          email: email(),
          locale: 'en',
          requestData: {
            version: '2026-09-27',
            source: 'newsletter-form',
            requestedAt: NOW.toISOString(),
          },
        },
        NOW,
      )
      await db.execute(sql`
        insert into deletion_log (target_collection, target_id, action, at)
        values ('newsletter', 42, 'delete', now()), ('members', 43, 'delete', now())`)

      // The later migration of members' Glia Notes first: it extends the deletion log's types.
      await membersSyncConstraints.down({ db } as never)
      await membersSync.down({ db } as never)
      await newsletterConstraints.down({ db } as never)
      await newsletter.down({ db } as never)
      expect(await checks()).toEqual([])
      expect(await consentTable()).toBe(0)
      expect(await enumLabels('enum_email_tokens_purpose')).toEqual([
        'sign-in',
        'verify-email',
        'data-request',
      ])
      expect(await enumLabels('enum_deletion_log_target_collection')).toEqual([
        'members',
        'submissions',
        'reports',
      ])
      expect(
        await count(sql`select count(*)::int as n from email_tokens where email = ${kept}`),
      ).toBe(1)
      expect(
        await count(sql`select count(*)::int as n from deletion_log where target_id = 43`),
      ).toBe(1)

      await newsletter.up({ db } as never)
      await newsletterConstraints.up({ db } as never)
      await membersSync.up({ db } as never)
      await membersSyncConstraints.up({ db } as never)
      expect(await checks()).toHaveLength(7)
      expect(await enumLabels('enum_email_tokens_purpose')).toContain('newsletter')
      expect(await enumLabels('enum_deletion_log_target_collection')).toContain('newsletter')
    })

    it("of members' Glia Notes can be undone and redone, the constraints first (M2)", async () => {
      const columns = () =>
        count(sql`
          select count(*)::int as n from information_schema.columns
          where table_name = 'members' and column_name in ('digest_synced_at',
            'digest_subscriber_id', 'digest_subscriber_uuid')`)
      const enumLabels = (type: string) =>
        rows<{ label: string }>(sql`
          select e.enumlabel as label from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = ${type} order by e.enumsortorder`).then((r) => r.map((x) => x.label))
      expect(await columns()).toBe(3)
      // Rows of the new values, which the old types cannot hold, go with the down; others stay.
      await db.execute(sql`
        insert into deletion_log (target_collection, target_id, action, at)
        values ('consent-log', 51, 'unlink', now()), ('newsletter', 52, 'delete', now())`)
      await membersSyncConstraints.down({ db } as never)
      await membersSync.down({ db } as never)
      expect(await columns()).toBe(0)
      expect(await enumLabels('enum_deletion_log_target_collection')).not.toContain('consent-log')
      expect(await enumLabels('enum_deletion_log_action')).toEqual(['delete', 'clear-email'])
      expect(await enumLabels('enum_payload_jobs_task_slug')).not.toContain('syncGliaNotes')
      expect(
        await count(sql`select count(*)::int as n from deletion_log where target_id in (51, 52)`),
      ).toBe(1)
      await membersSync.up({ db } as never)
      await membersSyncConstraints.up({ db } as never)
      expect(await columns()).toBe(3)
      expect(await enumLabels('enum_deletion_log_action')).toContain('unlink')
      expect(await enumLabels('enum_payload_jobs_task_slug')).toEqual(
        expect.arrayContaining(['syncGliaNotes', 'checkGliaNotesMembers']),
      )
      expect(await newMember()).toMatchObject({ digestSubscriber: null, digestSyncedAt: null })
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
      // The later migration that adds members' columns first, and last on the way up (M2).
      await membersSyncConstraints.down({ db } as never)
      await membersSync.down({ db } as never)
      await constraints.down({ db } as never)
      await members.down({ db } as never)
      expect(await tables()).toEqual([])
      expect(await lockColumn()).toBe(0)
      await members.up({ db } as never)
      await constraints.up({ db } as never)
      await membersSync.up({ db } as never)
      await membersSyncConstraints.up({ db } as never)
      expect(await tables()).toHaveLength(7)
      expect(await lockColumn()).toBe(1)
      expect(await newMember()).toMatchObject({ id: expect.any(Number) })
    })
  })
})
