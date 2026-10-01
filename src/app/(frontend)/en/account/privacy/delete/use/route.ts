import config from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'

import { deleteOwnAccount, handleAccountDeletion } from '@/lib/members/account-deletion'
import { SESSION_COOKIE } from '@/lib/members/cookies'
import { MEMBER_PATHS } from '@/lib/members/paths'
import { seeOther } from '@/lib/members/responses'
import { findSession, memberDb } from '@/lib/members/store'

// "Delete my account" (M4b, D49; the M4b design §7.6): the confirmation page's button posts here.
// The rules are in src/lib/members/account-deletion.ts; this gives them the database.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const now = new Date()
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const payload = await getPayload({ config })
  return handleAccountDeletion(request, {
    now,
    member: async () => {
      if (!token) return null
      return (await findSession(memberDb(payload), token, now))?.member ?? null
    },
    deleteAccount: (member) => deleteOwnAccount(payload, member, now),
  })
}

/** Deleting changes something, so it is a POST: an address opened in the browser shows the page. */
export function GET() {
  return seeOther(MEMBER_PATHS.privacyDelete)
}
