import config from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'

import { SESSION_COOKIE } from '@/lib/members/cookies'
import { MEMBER_PATHS } from '@/lib/members/paths'
import { rotateSession, unlinkProvider } from '@/lib/members/provider-sign-in'
import { seeOther } from '@/lib/members/responses'
import { handleSettings } from '@/lib/members/settings'
import { GLIA_NOTES_CONSENT_VERSION } from '@/lib/newsletter/consent'
import { syncSoon } from '@/lib/newsletter/sync-soon'
import {
  findSession,
  memberDb,
  setDigest,
  setDisplayName,
  setPreferredSubfields,
} from '@/lib/members/store'

// The account's settings (M4b, D49; the M4b design §5, §7.3, §7.4): the forms on /en/account/ post
// here with an `intent`: Glia Notes on or off, the preferred subfields, the display name, removing
// Google or ORCID. The rules are in src/lib/members/settings.ts; this gives them the database. A
// stored Glia Notes choice is carried to listmonk with its consent records (M2, D50; PLAN §13):
// tried once after the answer is sent (`after`), and by the task `syncGliaNotes` within 5 minutes
// if that fails or listmonk is off.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const now = new Date()
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const payload = await getPayload({ config })
  const db = memberDb(payload)
  return handleSettings(request, {
    now,
    consentVersion: GLIA_NOTES_CONSENT_VERSION,
    session: async () => {
      if (!token) return null
      const session = await findSession(db, token, now)
      return session && { member: session.member, token }
    },
    setDigest: (memberId, choice) => setDigest(db, memberId, choice, now),
    syncDigest: (memberId) => syncSoon(db, memberId, 'the settings'),
    setSubfields: (memberId, slugs) => setPreferredSubfields(db, memberId, slugs, now),
    setName: (memberId, name) => setDisplayName(db, memberId, name, now),
    unlink: (memberId, method) => unlinkProvider(db, memberId, method, now),
    rotate: (memberId, replaces) => rotateSession(db, memberId, now, { replaces, endOthers: true }),
  })
}

/** Settings change something, so they are POSTs: an address opened in the browser shows the account. */
export function GET() {
  return seeOther(MEMBER_PATHS.account)
}
