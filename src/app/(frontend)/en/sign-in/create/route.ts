import config from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'

import { errorSummary } from '@/lib/errors'
import { clientIp, hashClientIp } from '@/lib/forms/client-ip'
import { newReference } from '@/lib/forms/public-form'
import { CREATE_ACCOUNT_LIMIT, admit, ipLimit, postgresLimitStore } from '@/lib/forms/rate-limit'
import { memberAuthConfig } from '@/lib/members/config'
import { SESSION_COOKIE, SIGN_IN_COOKIE, clearedCookie } from '@/lib/members/cookies'
import type { ProviderIncoming } from '@/lib/members/identity'
import { sameOrigin } from '@/lib/members/origin'
import { outcomePath } from '@/lib/members/outcome'
import { MEMBER_PATHS } from '@/lib/members/paths'
import { rotateSession, signInWithProvider } from '@/lib/members/provider-sign-in'
import { formValue, forbidden, readForm, seeOther } from '@/lib/members/responses'
import { DEFAULT_NEXT } from '@/lib/members/return-path'
import { openSignIn } from '@/lib/members/seal'
import { memberDb } from '@/lib/members/store'

// "Create account" after signing in with Google or ORCID for the first time (M4b, D49; the M4b
// design §5, §7.2 step 5): the button on /en/sign-in/confirm/ posts here. Only from the site's own
// pages (`sameOrigin`), at most 10 an hour from one connection (its hashed IP address, as the
// forms count). The identity comes from the sealed sign-in cookie the callback left (15 minutes),
// never from the form, which only says whether to keep the ORCID record's name. It is checked
// again: if an account has it by now, that account is signed in to. Then a new session, the
// sign-in cookie goes, and a 303 to where the person was going. A failure keeps the cookie, so
// Back and the button again can still work.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return forbidden()
  const jar = await cookies()
  const now = new Date()
  const secret = process.env.PAYLOAD_SECRET ?? ''
  const cleared = clearedCookie(SIGN_IN_COOKIE)
  const pending = openSignIn(jar.get(SIGN_IN_COOKIE)?.value, secret, now, 'confirm')
  if (!pending) {
    return seeOther(outcomePath(MEMBER_PATHS.signIn, { error: 'expired' }), [cleared])
  }
  if (!memberAuthConfig()[pending.p].on) return seeOther(MEMBER_PATHS.signIn, [cleared])
  const keep = { next: pending.next === DEFAULT_NEXT ? null : pending.next }
  const form = await readForm(request)
  const displayName =
    pending.p === 'orcid' && pending.name && formValue(form, 'use-name') === 'yes'
      ? pending.name
      : null
  const incoming: ProviderIncoming =
    pending.p === 'google'
      ? { method: 'google', sub: pending.sub, email: pending.email ?? null }
      : { method: 'orcid', sub: pending.sub }

  try {
    const payload = await getPayload({ config })
    const admission = await admit(postgresLimitStore(payload), {
      keys: [ipLimit(CREATE_ACCOUNT_LIMIT, hashClientIp(clientIp(request.headers), secret))],
      now,
    })
    if (admission !== 'accepted') {
      return seeOther(outcomePath(MEMBER_PATHS.signIn, { error: 'create-limited' }, keep))
    }
    const db = memberDb(payload)
    const done = await signInWithProvider(db, incoming, now, { displayName })
    if (done.kind === 'refused') {
      return seeOther(outcomePath(MEMBER_PATHS.signIn, { error: done.reason }, keep), [cleared])
    }
    if (done.kind === 'confirm') throw new Error('Create account did not create')
    const changed = done.kind === 'signed-in' && done.changed
    const { cookie, othersEnded } = await rotateSession(db, done.memberId, now, {
      replaces: jar.get(SESSION_COOKIE)?.value,
      endOthers: changed,
    })
    const target =
      pending.next === DEFAULT_NEXT
        ? outcomePath(MEMBER_PATHS.account, {
            done: done.kind === 'created' ? 'created' : 'signed-in',
            othersEnded: othersEnded > 0,
          })
        : pending.next
    return seeOther(target, [cookie, cleared])
  } catch (error) {
    const reference = newReference()
    console.error(
      `Sign-in failed (reference ${reference}, ${pending.p} create): ${errorSummary(error)}`,
    )
    return seeOther(outcomePath(MEMBER_PATHS.signIn, { error: 'failed', reference }, keep))
  }
}

/** A plain visit, or a form sent again by Back: the sign-in page. */
export function GET() {
  return seeOther(MEMBER_PATHS.signIn)
}
