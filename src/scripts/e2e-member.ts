// Adds the members the end-to-end tests sign in as, for local development and CI only (M4b):
//   E2E_MEMBER_TOKEN=… pnpm e2e:member
// One member with an email address, one with only an ORCID iD and one whose saved positions a test
// removes (src/scripts/e2e-member-account.ts), each with one session whose token is made from
// E2E_MEMBER_TOKEN, which `pnpm test:e2e` must get too. The two with an email address have saved
// three of the fixed fake jobs: one open, one closed recently and one withdrawn, so run it after
// `pnpm fake:jobs` (which replaces those jobs, and their saved items go with them). Running it
// again gives every member a new session (30 days), ends their others and saves the three jobs
// afresh, so it can run at any time. It also empties the form limits (hashed addresses, used
// spam-check answers), so the sign-in tests of a run within the hour of the last one start afresh.
// The member with an email address has two preferred subfields (D35), the others none.
import config from '@payload-config'
import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import { LIMIT_TABLE } from '@/lib/forms/rate-limit'
import { createMember, findMember, memberDb, setPreferredSubfields } from '@/lib/members/store'
import { hashToken } from '@/lib/members/tokens'
import { SESSION_DAYS } from '@/lib/retention/rules'

import {
  E2E_MEMBER_EMAIL,
  E2E_MEMBER_ORCID,
  E2E_MEMBER_SUBFIELDS,
  E2E_SAVER_EMAIL,
  type E2eMember,
  e2eMemberToken,
} from './e2e-member-account'
import { FIXED_JOBS } from './fake-jobs-fixed'

/** The saved positions of the members with an email address, the last saved last. */
const SAVED_JOBS = [FIXED_JOBS.withdrawn, FIXED_JOBS.expiredRecently, FIXED_JOBS.open]

// PAYLOAD_JOBS_AUTORUN is "true" only on the production server (deploy/compose.prod.yml).
if (process.env.PAYLOAD_JOBS_AUTORUN === 'true') {
  console.error(
    'pnpm e2e:member adds test members for local development and CI only. It does not run where PAYLOAD_JOBS_AUTORUN is "true", which marks the production server.',
  )
  process.exit(1)
}

const secret = process.env.E2E_MEMBER_TOKEN
if (!secret) {
  console.error('Set E2E_MEMBER_TOKEN to the value the end-to-end tests will get too.')
  process.exit(1)
}

const payload = await getPayload({ config })
const db = memberDb(payload)
const now = new Date()
const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60_000)

const byEmail = async (email: string) =>
  (await findMember(db, { email })) ??
  (await createMember(db, { email, emailVerifiedBy: 'link' }, now))

try {
  const members: { kind: E2eMember; saves: boolean; id: number }[] = [
    { kind: 'email', saves: true, id: (await byEmail(E2E_MEMBER_EMAIL)).id },
    {
      kind: 'orcid',
      saves: false,
      id: (
        (await findMember(db, { orcidId: E2E_MEMBER_ORCID })) ??
        (await createMember(db, { orcidId: E2E_MEMBER_ORCID }, now))
      ).id,
    },
    { kind: 'saver', saves: true, id: (await byEmail(E2E_SAVER_EMAIL)).id },
  ]
  for (const { kind, saves, id } of members) {
    const subfields = kind === 'email' ? E2E_MEMBER_SUBFIELDS : []
    if ((await setPreferredSubfields(db, id, [...subfields], now)) !== subfields.length) {
      throw new Error(`The subfields ${subfields.join(', ')} are missing. Run pnpm migrate first.`)
    }
    await db.transaction(async (tx) => {
      // The one session the tests use, with a token they can make themselves.
      await tx.execute(sql`DELETE FROM member_sessions WHERE member_id = ${id}`)
      await tx.execute(sql`
        INSERT INTO member_sessions (member_id, token_hash, expires_at, created_at, updated_at)
        VALUES (${id}, ${hashToken(e2eMemberToken(secret, kind))}, ${expiresAt.toISOString()},
          ${now.toISOString()}, ${now.toISOString()})`)
      await tx.execute(sql`DELETE FROM saved_items WHERE member_id = ${id}`)
      if (!saves) return
      for (const [index, job] of SAVED_JOBS.entries()) {
        // A second apart, so the saved page's order (the last saved first) is fixed.
        const at = new Date(now.getTime() - (SAVED_JOBS.length - index) * 1000).toISOString()
        const { rows } = await tx.execute<{ id: number }>(sql`
          INSERT INTO saved_items (member_id, item_type, job_id, created_at, updated_at)
          SELECT ${id}, 'job', jobs.id, ${at}, ${at} FROM jobs WHERE jobs.short_id = ${job.shortId}
          RETURNING id`)
        if (rows.length !== 1) {
          throw new Error(
            `The fixed fake job ${job.shortId} is missing. Load the fake jobs first: pnpm fake:jobs`,
          )
        }
      }
    })
  }
  await db.execute(sql`DELETE FROM ${sql.identifier(LIMIT_TABLE)}`)
  payload.logger.info(
    `Added the test members ${E2E_MEMBER_EMAIL}, ${E2E_MEMBER_ORCID} and ${E2E_SAVER_EMAIL}, each with a new session; the two with an address have saved ${SAVED_JOBS.length} positions, and ${E2E_MEMBER_EMAIL} prefers the subfields ${E2E_MEMBER_SUBFIELDS.join(' and ')}`,
  )
  process.exit(0)
} catch (error) {
  payload.logger.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error))
  process.exit(1)
}
