// Adds the members the end-to-end tests sign in as, for local development and CI only (M4b):
//   E2E_MEMBER_TOKEN=… pnpm e2e:member
// One member with an email address and one with only an ORCID iD (src/scripts/e2e-member-account.ts),
// each with one session whose token is made from E2E_MEMBER_TOKEN, which `pnpm test:e2e` must get
// too. Running it again gives both new sessions (30 days) and ends their others, so it can run at
// any time. It also empties the form limits (hashed addresses, used spam-check answers), so the
// sign-in tests of a run within the hour of the last one start afresh.
import config from '@payload-config'
import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import { LIMIT_TABLE } from '@/lib/forms/rate-limit'
import { createMember, findMember, memberDb } from '@/lib/members/store'
import { hashToken } from '@/lib/members/tokens'
import { SESSION_DAYS } from '@/lib/retention/rules'

import { E2E_MEMBER_EMAIL, E2E_MEMBER_ORCID, e2eMemberToken } from './e2e-member-account'

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

try {
  const members = [
    {
      kind: 'email' as const,
      member:
        (await findMember(db, { email: E2E_MEMBER_EMAIL })) ??
        (await createMember(db, { email: E2E_MEMBER_EMAIL, emailVerifiedBy: 'link' }, now)),
    },
    {
      kind: 'orcid' as const,
      member:
        (await findMember(db, { orcidId: E2E_MEMBER_ORCID })) ??
        (await createMember(db, { orcidId: E2E_MEMBER_ORCID }, now)),
    },
  ]
  for (const { kind, member } of members) {
    // The one session the tests use, with a token they can make themselves.
    await db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM member_sessions WHERE member_id = ${member.id}`)
      await tx.execute(sql`
        INSERT INTO member_sessions (member_id, token_hash, expires_at, created_at, updated_at)
        VALUES (${member.id}, ${hashToken(e2eMemberToken(secret, kind))}, ${expiresAt.toISOString()},
          ${now.toISOString()}, ${now.toISOString()})`)
    })
  }
  await db.execute(sql`DELETE FROM ${sql.identifier(LIMIT_TABLE)}`)
  payload.logger.info(
    `Added the test members ${E2E_MEMBER_EMAIL} and ${E2E_MEMBER_ORCID}, each with a new session`,
  )
  process.exit(0)
} catch (error) {
  payload.logger.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error))
  process.exit(1)
}
