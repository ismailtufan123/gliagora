import { resolve } from './identity'
import { identityOf } from './provider-sign-in'
import {
  type MemberDb,
  MemberStoreError,
  applyChanges,
  consumeEmailToken,
  findMember,
  isUniqueViolation,
} from './store'

// Using an emailed link that adds an address to an account, or changes it (M4b, D49; the M4b
// design §7.3, §7.4): the POST behind "Add this address" on the page the link opens. The link is
// consumed in one statement that also checks its purpose and that the signed-in member is the one
// who asked for it, so a link opened by anyone else changes nothing and stays usable. The address
// is then the member's, unless another account has it: two accounts are never merged, and the
// person who opened the link controls the address, so saying that it is taken reveals nothing to a
// stranger. `resolve()` decides (identity.ts); a unique index repeats the decisive check.

export type AddressLink =
  /** `changed`: the account's address is now the link's (false: it already was). */
  { kind: 'verified'; changed: boolean } | { kind: 'refused'; reason: 'email-taken' }

/**
 * Uses a link to add an address for the signed-in member `memberId`: what happened, or null when
 * the link is unknown, used, expired, made for something else or asked for by another member.
 */
export async function redeemVerifyLink(
  db: MemberDb,
  token: string | null | undefined,
  memberId: number,
  now: Date,
): Promise<AddressLink | null> {
  const link = await consumeEmailToken(db, token, 'verify-email', now, { memberId })
  if (!link || link.memberId !== memberId) return null
  // Decided again once if another request took the address in between (a unique index refuses).
  for (let attempt = 0; attempt < 2; attempt++) {
    const member = identityOf(await findMember(db, { id: memberId }))
    if (!member) throw new MemberStoreError('gone', 'members')
    const holder = identityOf(await findMember(db, { email: link.email }))
    const decision = resolve(
      { kind: 'verify-email', member, tokenMemberId: link.memberId, email: link.email },
      { byEmail: holder },
    )
    if (decision.action === 'refuse') {
      if (decision.reason !== 'email-taken') throw new MemberStoreError('invalid', 'resolution')
      return { kind: 'refused', reason: 'email-taken' }
    }
    if (decision.action !== 'update') throw new MemberStoreError('invalid', 'resolution')
    if (!decision.changes) return { kind: 'verified', changed: false }
    try {
      if (await applyChanges(db, memberId, decision.changes, now)) {
        return { kind: 'verified', changed: true }
      }
      throw new MemberStoreError('gone', 'members')
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
    }
  }
  throw new MemberStoreError('conflict', 'members')
}
