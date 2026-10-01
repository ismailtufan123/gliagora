import config from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'

import { errorSummary } from '@/lib/errors'
import { newReference } from '@/lib/forms/public-form'
import { SESSION_COOKIE, SIGN_IN_COOKIE, clearedCookie } from '@/lib/members/cookies'
import { sameOrigin } from '@/lib/members/origin'
import { outcomePath } from '@/lib/members/outcome'
import { MEMBER_PATHS } from '@/lib/members/paths'
import { formValue, forbidden, readForm, seeOther } from '@/lib/members/responses'
import { endAllSessions, endSession, findSession, memberDb } from '@/lib/members/store'

// Signs out (M4b, D49; the M4b design §5): `scope=this` ends this browser's session,
// `scope=everywhere` every session of the account, this one too. Only from the site's own pages
// (`sameOrigin`), so another site cannot sign a member out. The cookies go in any case, also when
// the session had already ended; then a 303 to "You are signed out". A failure keeps the cookie
// (the session may still be there) and leads to the account page with a reference.
export const dynamic = 'force-dynamic'

const CLEARED = [clearedCookie(SESSION_COOKIE), clearedCookie(SIGN_IN_COOKIE)]

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return forbidden()
  const everywhere = formValue(await readForm(request), 'scope') === 'everywhere'
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (token) {
    try {
      const db = memberDb(await getPayload({ config }))
      if (everywhere) {
        const session = await findSession(db, token, new Date())
        if (session) await endAllSessions(db, session.member.id)
      }
      await endSession(db, token)
    } catch (error) {
      const reference = newReference()
      console.error(`Sign-out failed (reference ${reference}): ${errorSummary(error)}`)
      return seeOther(outcomePath(MEMBER_PATHS.account, { error: 'failed', reference }))
    }
  }
  return seeOther(MEMBER_PATHS.signedOut, CLEARED)
}

/** Signing out changes something, so it is a POST: an address opened in the browser shows the account. */
export function GET() {
  return seeOther(MEMBER_PATHS.account)
}
