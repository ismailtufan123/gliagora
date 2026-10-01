import config from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'

import { SESSION_COOKIE } from '@/lib/members/cookies'
import { handleExport, readExport } from '@/lib/members/export'
import { routeMember } from '@/lib/members/session'
import { memberDb } from '@/lib/members/store'

// "Download my data" (M4b, D49; the M4b design §7.5): the signed-in member's data as a JSON file
// (src/lib/members/export.ts). A GET that only reads (activity is recorded as on every signed-in
// request); signed out, it leads to the privacy page. Never stored by caches.
export const dynamic = 'force-dynamic'

export async function GET() {
  const now = new Date()
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const db = memberDb(await getPayload({ config }))
  return handleExport({
    now,
    member: () => routeMember(db, token, now),
    read: (member) => readExport(db, member, now),
  })
}
