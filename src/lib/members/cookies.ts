import { SESSION_DAYS, SIGN_IN_COOKIE_MINUTES } from '@/lib/retention/rules'

// The two cookies of member sign-in (M4b, D49; the M4b design §8, and the cookies page). Both are
// `__Host-` cookies: Secure, Path=/ and no Domain, so no subdomain (a future `lists.` or `stats.`)
// can set one for the site. Browsers keep Secure cookies from http://localhost and
// http://127.0.0.1 too, so local runs and CI behave as production. HttpOnly: no script reads them.
// SameSite=Lax, not Strict: the provider's redirect back to the callback must carry the sign-in
// cookie, and a member who follows a link from Glia Notes or a search result should arrive signed
// in; every POST is also checked for its origin (origin.ts). Nothing else is ever set: no hint
// cookie for scripts, and no Clear-Site-Data (it would sign editors out too).

/** The session: a random token (tokens.ts), 30 days from sign-in, never extended. */
export const SESSION_COOKIE = '__Host-gliagora-session'

/**
 * While signing in (15 minutes): the sealed state of an OAuth flow or of the "Create account"
 * step, or an email link's binding to this browser (seal.ts).
 */
export const SIGN_IN_COOKIE = '__Host-gliagora-signin'

export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60
export const SIGN_IN_MAX_AGE_SECONDS = SIGN_IN_COOKIE_MINUTES * 60

/** A cookie to set, in the shape Next.js's `cookies().set()` takes. */
export type MemberCookie = {
  name: typeof SESSION_COOKIE | typeof SIGN_IN_COOKIE
  value: string
  path: '/'
  httpOnly: true
  secure: true
  sameSite: 'lax'
  maxAge: number
}

const cookie = (name: MemberCookie['name'], value: string, maxAge: number): MemberCookie => ({
  name,
  value,
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge,
})

/** The session cookie, ending exactly when the session row does (`expiresAt`). */
export function sessionCookie(token: string, expiresAt: Date, now: Date): MemberCookie {
  const seconds = Math.floor((expiresAt.getTime() - now.getTime()) / 1000)
  return cookie(SESSION_COOKIE, token, Math.max(0, Math.min(seconds, SESSION_MAX_AGE_SECONDS)))
}

/** The sign-in cookie with a sealed value (seal.ts). */
export function signInCookie(sealed: string): MemberCookie {
  return cookie(SIGN_IN_COOKIE, sealed, SIGN_IN_MAX_AGE_SECONDS)
}

/** Deletes a cookie: an empty value that expires at once, with the same attributes. */
export function clearedCookie(name: MemberCookie['name']): MemberCookie {
  return cookie(name, '', 0)
}

/** The Set-Cookie header for a cookie, for route handlers that build their own response. */
export function setCookieHeader(value: MemberCookie): string {
  // The values are base64url, hex or the sealed `v1.` form: nothing to encode.
  return `${value.name}=${value.value}; Path=/; Max-Age=${value.maxAge}; HttpOnly; Secure; SameSite=Lax`
}
