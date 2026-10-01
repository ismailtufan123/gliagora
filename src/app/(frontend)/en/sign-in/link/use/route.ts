import config from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'

import { errorSummary } from '@/lib/errors'
import { newReference } from '@/lib/forms/public-form'
import { SESSION_COOKIE, SIGN_IN_COOKIE, clearedCookie, sessionCookie } from '@/lib/members/cookies'
import { appOrigin, sameOrigin } from '@/lib/members/origin'
import { outcomePath } from '@/lib/members/outcome'
import { MEMBER_PATHS } from '@/lib/members/paths'
import { formValue, forbidden, readForm, seeOther } from '@/lib/members/responses'
import { DEFAULT_NEXT, safeNext } from '@/lib/members/return-path'
import { redeemSignInLink } from '@/lib/members/sign-in-link'
import { createSession, memberDb } from '@/lib/members/store'

// Uses an emailed sign-in link (M4b, D49; the M4b design §7.1 step 5): the button on the page the
// link opens posts here. Only from the site's own pages (`sameOrigin`). The link is consumed for
// its purpose in one statement; the address then signs in to its member or makes the account,
// the address's other pending links stop working, and the browser gets a new session (the one it
// carried, if any, is ended) and loses its sign-in cookie. Then a 303 to where the person was
// going, or to the account with what happened. An unknown, used or expired link leads back to the
// sign-in page with "This link has expired"; any other failure with a reference, which the log
// line repeats with the error's class and code only.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return forbidden()
  const origin = appOrigin(request.headers)!
  const form = await readForm(request)
  const jar = await cookies()
  const now = new Date()
  try {
    const db = memberDb(await getPayload({ config }))
    const used = await redeemSignInLink(db, formValue(form, 'token'), now)
    // The sign-in cookie stays: it may bind a newer link this browser asked for.
    if (!used) return seeOther(outcomePath(MEMBER_PATHS.signIn, { error: 'link-expired' }))
    const session = await createSession(db, used.memberId, now, {
      replaces: jar.get(SESSION_COOKIE)?.value,
    })
    const next = used.next ? safeNext(used.next, origin) : DEFAULT_NEXT
    // Back on the account page itself, say what happened; elsewhere the page speaks for itself.
    const target =
      next === DEFAULT_NEXT
        ? outcomePath(MEMBER_PATHS.account, { done: used.created ? 'created' : 'signed-in' })
        : next
    return seeOther(target, [
      sessionCookie(session.token, session.expiresAt, now),
      clearedCookie(SIGN_IN_COOKIE),
    ])
  } catch (error) {
    const reference = newReference()
    console.error(`Sign-in failed (reference ${reference}, email): ${errorSummary(error)}`)
    return seeOther(outcomePath(MEMBER_PATHS.signIn, { error: 'failed', reference }))
  }
}

/** A link opened as an address, or a form sent again by Back: the sign-in page. */
export function GET() {
  return seeOther(MEMBER_PATHS.signIn)
}
