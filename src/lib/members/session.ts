import config from '@payload-config'
import { cookies, headers } from 'next/headers'
import { getPayload } from 'payload'
import { cache } from 'react'

import { requestTime } from '@/lib/records'

import { memberAuthConfig } from './config'
import { SESSION_COOKIE } from './cookies'
import { appOrigin } from './origin'
import { type MemberRecord, findSession, memberDb, touchMember } from './store'

// Who is signed in, for the pages that show it (M4b, D49; the M4b design §8): the sign-in and
// account pages. Only dynamic pages call this: the header is the same for everyone (a static
// "Account" link), so static pages stay static and need no database. Read once per request (React
// `cache`), and only when the request carries a session cookie, so visitors who never signed in
// cost no query.

const DAY_MS = 24 * 60 * 60_000

export type CurrentMember = {
  member: MemberRecord
  /** The session cookie's token, to replace or end this session. */
  token: string
  expiresAt: Date
}

/**
 * The signed-in member, or null. Records activity at most once a day (it cancels a pending
 * inactivity warning, PLAN §18.1). Throws a MemberStoreError when the database cannot be read.
 */
export const currentMember = cache(async (): Promise<CurrentMember | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const db = memberDb(await getPayload({ config }))
  const now = requestTime()
  const session = await findSession(db, token, now)
  if (!session) return null
  if (now.getTime() - session.member.lastSeenAt.getTime() >= DAY_MS) {
    await touchMember(db, session.member.id, now)
  }
  return { member: session.member, token, expiresAt: session.expiresAt }
})

/** Which ways of signing in a page offers. */
export type SignInMethods = { email: boolean; google: boolean; orcid: boolean }

const NONE: SignInMethods = { email: false, google: false, orcid: false }

/** Whether a page offers any way of signing in (otherwise: "Signing in is not available yet"). */
export const anyMethod = (methods: SignInMethods) =>
  methods.email || methods.google || methods.orcid

/**
 * What the member pages need about this request: the site's origin (null where it cannot be known
 * safely, which switches sign-in off) and the ways of signing in that are on. Read at request
 * time: the image is built without the server's settings.
 */
export const memberRequest = cache(
  async (): Promise<{ origin: string | null; methods: SignInMethods }> => {
    const origin = appOrigin(await headers())
    const auth = memberAuthConfig()
    // Google and ORCID are offered once their sign-in routes exist; until then only the email link.
    const methods = origin ? { email: auth.email.on, google: false, orcid: false } : NONE
    return { origin, methods }
  },
)
