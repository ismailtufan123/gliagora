import config from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'

import { SESSION_COOKIE } from '@/lib/members/cookies'
import { MEMBER_PATHS } from '@/lib/members/paths'
import { seeOther } from '@/lib/members/responses'
import { handleSaveToggle } from '@/lib/members/saved'
import { saveStore } from '@/lib/members/saved-store'
import { findSession, memberDb, touchMember } from '@/lib/members/store'

// Every Save button posts here (M4b, D49; the M4b design §3): `item` (`job:k3f9a`), the state the
// member wants (`saved=1` or `0`) and the page to return to (`back`). The rules are in
// src/lib/members/saved.ts: only from the site's own pages, only for a member who is signed in (or
// the way to sign in that saves afterwards), a job saved only while public and at most 500, a
// 303 back to the row without JavaScript and `{ saved }` with it. Never stored by caches.
export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60_000

export async function POST(request: Request) {
  const now = new Date()
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const payload = await getPayload({ config })
  return handleSaveToggle(request, {
    ...saveStore(payload, now),
    member: async () => {
      if (!token) return null
      const db = memberDb(payload)
      const session = await findSession(db, token, now)
      if (!session) return null
      // Activity, as on every signed-in page (session.ts): at most once a day.
      if (now.getTime() - session.member.lastSeenAt.getTime() >= DAY_MS) {
        await touchMember(db, session.member.id, now)
      }
      return session.member.id
    },
  })
}

/** Saving changes something, so it is a POST: an address opened in the browser shows the list. */
export function GET() {
  return seeOther(MEMBER_PATHS.saved)
}
