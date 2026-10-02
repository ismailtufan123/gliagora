import config from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'

import { errorSummary } from '@/lib/errors'
import { newReference } from '@/lib/forms/public-form'
import { SESSION_COOKIE, SIGN_IN_COOKIE, clearedCookie, sessionCookie } from '@/lib/members/cookies'
import { appOrigin, sameOrigin } from '@/lib/members/origin'
import { outcomePath } from '@/lib/members/outcome'
import { MEMBER_PATHS } from '@/lib/members/paths'
import { rotateSession } from '@/lib/members/provider-sign-in'
import { formValue, forbidden, readForm, seeOther } from '@/lib/members/responses'
import { DEFAULT_NEXT, safeNext } from '@/lib/members/return-path'
import { saveAfterSignIn } from '@/lib/members/saved'
import { saveStore } from '@/lib/members/saved-store'
import { redeemSignInLink } from '@/lib/members/sign-in-link'
import { syncSoon } from '@/lib/newsletter/sync-soon'
import {
  type MemberDb,
  createSession,
  findEmailToken,
  findSession,
  memberDb,
} from '@/lib/members/store'
import { isToken } from '@/lib/members/tokens'
import { redeemVerifyLink } from '@/lib/members/verify-email'

// Uses an emailed link (M4b, D49; the M4b design §7.1 step 5, §7.4): the button on the page the
// link opens posts here. Only from the site's own pages (`sameOrigin`). Each link is consumed for
// its own purpose in one statement.
//
// A sign-in link: the address then signs in to its member or makes the account, the address's
// other pending links stop working, and the browser gets a new session (the one it carried, if
// any, is ended) and loses its sign-in cookie. A position the person pressed Save on before asking
// for the link is saved now, if it is still public (src/lib/members/saved.ts). Then a 303 to where
// the person was going (at that position's Save control), or to the account with what happened.
// An unknown, used or expired link leads back to the sign-in page with "This link has expired".
//
// A link to add an address to an account: only for the member who asked for it, signed in in this
// browser (src/lib/members/verify-email.ts); anyone else is sent back to the link's page, which
// says what to do, and the link stays usable. The address becomes the account's unless another
// account has it (`?error=email-taken`); a change of address gives this browser a new session and
// ends every other session of the member, as every change of the ways to sign in does.
//
// A new account and a new address are carried to Glia Notes right after the answer (`syncSoon`,
// M2, D50): the member's subscription moves to the new address, and an address that already has
// Glia Notes through the newsletter page is looked for (src/lib/newsletter/members.ts).
//
// Any other failure leads back with a reference, which the log line repeats with the error's
// class and code only.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return forbidden()
  const origin = appOrigin(request.headers)!
  const form = await readForm(request)
  const jar = await cookies()
  const now = new Date()
  const token = formValue(form, 'token')
  let addingAddress = false
  try {
    const payload = await getPayload({ config })
    const db = memberDb(payload)
    // A link to add an address has its own rules; the purpose never changes, so looking it up first
    // decides nothing the consuming statement does not check again.
    if ((await findEmailToken(db, token, now))?.purpose === 'verify-email') {
      addingAddress = true
      return await addAddressByLink(db, token!, jar.get(SESSION_COOKIE)?.value, now)
    }
    const used = await redeemSignInLink(db, token, now)
    // The sign-in cookie stays: it may bind a newer link this browser asked for.
    if (!used) return seeOther(outcomePath(MEMBER_PATHS.signIn, { error: 'link-expired' }))
    if (used.created) syncSoon(db, used.memberId, 'a new account')
    const session = await createSession(db, used.memberId, now, {
      replaces: jar.get(SESSION_COOKIE)?.value,
    })
    const next = used.next ? safeNext(used.next, origin) : DEFAULT_NEXT
    const saved = await saveAfterSignIn(saveStore(payload, now), used.memberId, used.save, next)
    // Back on the account page itself, say what happened; elsewhere the page speaks for itself.
    const target =
      saved ??
      (next === DEFAULT_NEXT
        ? outcomePath(MEMBER_PATHS.account, { done: used.created ? 'created' : 'signed-in' })
        : next)
    return seeOther(target, [
      sessionCookie(session.token, session.expiresAt, now),
      clearedCookie(SIGN_IN_COOKIE),
    ])
  } catch (error) {
    const reference = newReference()
    const what = addingAddress ? 'Adding an address' : 'Sign-in'
    console.error(`${what} failed (reference ${reference}, email): ${errorSummary(error)}`)
    return seeOther(
      outcomePath(addingAddress ? MEMBER_PATHS.account : MEMBER_PATHS.signIn, {
        error: 'failed',
        reference,
      }),
    )
  }
}

/** "Add this address": the signed-in member who asked for the link gets the address. */
async function addAddressByLink(
  db: MemberDb,
  token: string,
  sessionToken: string | undefined,
  now: Date,
): Promise<Response> {
  const session = await findSession(db, sessionToken, now)
  // Signed out (or the session ended): the link's page says to sign in first; the link stays.
  if (!session || !isToken(token)) {
    return seeOther(`${MEMBER_PATHS.signInLink}?token=${encodeURIComponent(token)}`)
  }
  const result = await redeemVerifyLink(db, token, session.member.id, now)
  // Another member's link (its page refused it already), or used or expired meanwhile.
  if (!result) return seeOther(outcomePath(MEMBER_PATHS.account, { error: 'verify-expired' }))
  if (result.kind === 'refused') {
    return seeOther(outcomePath(MEMBER_PATHS.account, { error: result.reason }))
  }
  if (!result.changed)
    return seeOther(outcomePath(MEMBER_PATHS.account, { done: 'email-verified' }))
  syncSoon(db, session.member.id, 'an address change')
  const { cookie, othersEnded } = await rotateSession(db, session.member.id, now, {
    replaces: sessionToken,
    endOthers: true,
  })
  return seeOther(
    outcomePath(MEMBER_PATHS.account, { done: 'email-verified', othersEnded: othersEnded > 0 }),
    [cookie],
  )
}

/** A link opened as an address, or a form sent again by Back: the sign-in page. */
export function GET() {
  return seeOther(MEMBER_PATHS.signIn)
}
