import { createHash } from 'node:crypto'

// The members the end-to-end tests sign in as (src/scripts/e2e-member.ts adds them; M4b, D49): one
// with an email address and one with only an ORCID iD, each with a session whose cookie the tests
// know. Addresses on the reserved example.org domain and an iD starting 9999 (outside the ranges
// ORCID issues), so never a real person. No imports of the app, so Playwright can load the file
// as it is.

export const E2E_MEMBER_EMAIL = 'e2e-member@example.org'
/** Valid by ORCID's check character (ISO 7064 MOD 11-2). */
export const E2E_MEMBER_ORCID = '9999-0000-0000-0027'

export type E2eMember = 'email' | 'orcid'

/**
 * The session cookie's value for a test member, made from E2E_MEMBER_TOKEN (any text, the same for
 * `pnpm e2e:member` and the tests): 32 bytes written base64url, the form of every session token.
 */
export function e2eMemberToken(secret: string, member: E2eMember): string {
  return createHash('sha256')
    .update(`gliagora e2e member\u0000${member}\u0000${secret}`)
    .digest('base64url')
}
