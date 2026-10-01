import config from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'
import { z } from 'zod'

import { errorSummary } from '@/lib/errors'
import { newReference } from '@/lib/forms/public-form'
import { SESSION_COOKIE } from '@/lib/members/cookies'
import { sameOrigin } from '@/lib/members/origin'
import { outcomePath } from '@/lib/members/outcome'
import { MEMBER_PATHS } from '@/lib/members/paths'
import { rotateSession, unlinkProvider } from '@/lib/members/provider-sign-in'
import { formValue, forbidden, readForm, seeOther } from '@/lib/members/responses'
import { findSession, memberDb } from '@/lib/members/store'

// The account's settings (M4b, D49; the M4b design §5, §7.3): the forms on /en/account/ post here
// with an `intent`. For now the sign-in methods: `unlink-google` and `unlink-orcid` remove Google
// or ORCID, unless it is the last way into the account (checked again in SQL). A removal gives
// this browser a new session and ends every other session of the member: a session made through
// the method just removed does not survive it. Only from the site's own pages (`sameOrigin`), and
// only while signed in (signed out, the account page shows the sign-in panel). Answers are 303s to
// the account page with what happened.
export const dynamic = 'force-dynamic'

const INTENTS = z.enum(['unlink-google', 'unlink-orcid'])

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return forbidden()
  const intent = INTENTS.safeParse(formValue(await readForm(request), 'intent'))
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return seeOther(MEMBER_PATHS.account)
  const now = new Date()
  try {
    const db = memberDb(await getPayload({ config }))
    const session = await findSession(db, token, now)
    if (!session) return seeOther(MEMBER_PATHS.account)
    if (!intent.success) {
      return seeOther(outcomePath(MEMBER_PATHS.account, { error: 'failed' }))
    }
    const method = intent.data === 'unlink-google' ? 'google' : 'orcid'
    const done = method === 'google' ? 'unlinked-google' : 'unlinked-orcid'
    const result = await unlinkProvider(db, session.member.id, method, now)
    if (result.kind === 'refused') {
      return seeOther(outcomePath(MEMBER_PATHS.account, { error: result.reason }))
    }
    if (!result.changed) return seeOther(outcomePath(MEMBER_PATHS.account, { done }))
    const { cookie, othersEnded } = await rotateSession(db, session.member.id, now, {
      replaces: token,
      endOthers: true,
    })
    return seeOther(outcomePath(MEMBER_PATHS.account, { done, othersEnded: othersEnded > 0 }), [
      cookie,
    ])
  } catch (error) {
    const reference = newReference()
    console.error(`Account settings failed (reference ${reference}): ${errorSummary(error)}`)
    return seeOther(outcomePath(MEMBER_PATHS.account, { error: 'failed', reference }))
  }
}

/** Settings change something, so they are POSTs: an address opened in the browser shows the account. */
export function GET() {
  return seeOther(MEMBER_PATHS.account)
}
