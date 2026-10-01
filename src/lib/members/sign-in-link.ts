import { resolve } from './identity'
import {
  type MemberDb,
  MemberStoreError,
  consumeEmailToken,
  createMember,
  deleteSignInTokens,
  findMember,
  isUniqueViolation,
  markEmailVerified,
} from './store'

// Using an emailed sign-in link (M4b, D49; the M4b design §7.1 step 5): the POST behind "Sign in"
// or "Create account" on the page the link opens. The link is consumed for its own purpose in one
// statement, so of two requests at the same moment exactly one gets it; the address it proves
// then signs in to its member, or makes the account (`resolve()` decides, identity.ts). A link
// proves the address, so it never changes another member's account.

export type LinkSignIn = {
  memberId: number
  /** Whether this made the account (the page says "Your account has been created"). */
  created: boolean
  /** Where the person asked to go afterwards, as the link stored it (safeNext checks it again). */
  next: string | null
}

/**
 * Uses a sign-in link: the member it signs in to, or null when the link is unknown, used, expired
 * or made for something else. Also ends every other pending sign-in link of that address.
 */
export async function redeemSignInLink(
  db: MemberDb,
  token: string | null | undefined,
  now: Date,
): Promise<LinkSignIn | null> {
  const link = await consumeEmailToken(db, token, 'sign-in', now)
  if (!link) return null
  const holder = await findMember(db, { email: link.email })
  const decision = resolve(
    { kind: 'sign-in', incoming: { method: 'email', email: link.email } },
    { byEmail: holder },
  )
  let memberId: number
  let created = false
  if (decision.action === 'sign-in') {
    memberId = decision.memberId
    await markEmailVerified(db, memberId, now)
  } else if (decision.action === 'create') {
    try {
      memberId = (await createMember(db, decision.account, now)).id
      created = true
    } catch (error) {
      // Two links to one new address used at the same moment: the other made the account.
      if (!isUniqueViolation(error)) throw error
      const winner = await findMember(db, { email: link.email })
      if (!winner) throw error
      memberId = winner.id
    }
  } else {
    // A sign-in by email link is always a sign-in or a new account (identity.ts).
    throw new MemberStoreError('invalid', 'resolution')
  }
  await deleteSignInTokens(db, link.email)
  return { memberId, created, next: link.next }
}
