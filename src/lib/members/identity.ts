import { normaliseEmail } from './email-address'
import { isOrcidId } from './orcid-id'

// Who a sign-in, a link or an address change belongs to (M4b, D49; the M4b design §7.3), decided
// in one pure function so the whole rule set is a table its tests can walk through. The callers
// look up the members who already hold the incoming identifiers and apply the result in SQL
// (store.ts), where unique indexes and guarded updates repeat the decisive checks.
//
// Two existing accounts are never merged: a merge would let whoever controls one account absorb
// another through a link the other person opened, and someone with two accounts can delete one.
// So every result names at most one existing member, and an identifier that belongs to another
// account is refused rather than moved. A Google address counts only where Google is
// authoritative for it (Gmail, or a Workspace account with `hd`): for other addresses Google says
// only that the address was verified when the Google account was made, and a recycled university
// address may belong to someone else now.

/** A member as the decision needs it. */
export type MemberIdentity = {
  id: number
  email: string | null
  googleId: string | null
  orcidId: string | null
}

/** What a provider or an email link proved. */
export type Incoming =
  /** `email` only where Google is authoritative for it (`googleEmail`), else null. */
  | { method: 'google'; sub: string; email: string | null }
  | { method: 'orcid'; sub: string }
  /** An address proved by a sign-in link sent to it. */
  | { method: 'email'; email: string }

export type ProviderIncoming = Extract<Incoming, { method: 'google' | 'orcid' }>

export type IdentityEvent =
  /** Signed out, or signed in and using another way in (which switches accounts). */
  | { kind: 'sign-in'; incoming: Incoming }
  /** Signed in as `member`, linking Google or ORCID from the account page. */
  | { kind: 'link'; member: MemberIdentity; incoming: ProviderIncoming }
  /** Signed in as `member`, opening a link that adds `email` for `tokenMemberId`. */
  | { kind: 'verify-email'; member: MemberIdentity; tokenMemberId: number; email: string }
  /** Signed in as `member`, removing Google or ORCID. */
  | { kind: 'unlink'; member: MemberIdentity; method: 'google' | 'orcid' }

/** The members who hold the incoming identifiers (looked up by the caller; null if nobody). */
export type Holders = {
  byGoogleId?: MemberIdentity | null
  byOrcidId?: MemberIdentity | null
  byEmail?: MemberIdentity | null
}

/** What changes on one member's row. */
export type Changes = {
  googleId?: string
  orcidId?: string
  email?: string
  emailVerifiedBy?: 'google' | 'link'
  /** The sign-in method removed. */
  clear?: 'googleId' | 'orcidId'
}

/** The new account a "Create account" step makes. */
export type NewAccount = {
  email?: string
  emailVerifiedBy?: 'google' | 'link'
  googleId?: string
  orcidId?: string
}

export type Refusal =
  /** A Google address belongs to an account linked to another Google account. */
  | 'email-has-other-google'
  /** The Google account or ORCID iD is used by another Gliagora account. */
  | 'google-elsewhere'
  | 'orcid-elsewhere'
  /** The account already has another Google account or iD: unlink it first. */
  | 'google-already-linked'
  | 'orcid-already-linked'
  /** The address belongs to another account. */
  | 'email-taken'
  /** An address link opened by a member other than the one who asked for it (it stays usable). */
  | 'not-token-member'
  /** The last way into the account cannot be removed. */
  | 'last-method'

export type Resolution =
  /**
   * Sign in to an existing member, with `changes` when the sign-in also links a method (a Google
   * account to the member who has its authoritative address).
   */
  | { action: 'sign-in'; memberId: number; changes: Changes | null; endsOtherSessions: boolean }
  /** No account yet: the person confirms "Create account" first. */
  | { action: 'create'; account: NewAccount }
  /** A change to the signed-in member's own account; null when there is nothing to change. */
  | { action: 'update'; memberId: number; changes: Changes | null; endsOtherSessions: boolean }
  | { action: 'refuse'; reason: Refusal }

const refuse = (reason: Refusal): Resolution => ({ action: 'refuse', reason })

const signIn = (member: MemberIdentity, changes: Changes | null = null): Resolution => ({
  action: 'sign-in',
  memberId: member.id,
  changes,
  // Every change of sign-in methods ends the member's other sessions (§7.3).
  endsOtherSessions: changes !== null,
})

const update = (member: MemberIdentity, changes: Changes | null): Resolution => ({
  action: 'update',
  memberId: member.id,
  changes,
  endsOtherSessions: changes !== null,
})

const other = (holder: MemberIdentity | null | undefined, member: MemberIdentity) =>
  holder != null && holder.id !== member.id

function resolveSignIn(incoming: Incoming, holders: Holders): Resolution {
  switch (incoming.method) {
    case 'google': {
      // The Google account is known: sign in, whatever its address says now.
      if (holders.byGoogleId) return signIn(holders.byGoogleId)
      const owner = incoming.email ? holders.byEmail : null
      if (owner && incoming.email) {
        // "Same verified address, one account" (PLAN §3.2): only an authoritative address.
        if (owner.googleId) return refuse('email-has-other-google')
        return signIn(owner, { googleId: incoming.sub })
      }
      return {
        action: 'create',
        account: incoming.email
          ? { email: incoming.email, emailVerifiedBy: 'google', googleId: incoming.sub }
          : { googleId: incoming.sub },
      }
    }
    case 'orcid':
      if (holders.byOrcidId) return signIn(holders.byOrcidId)
      return { action: 'create', account: { orcidId: incoming.sub } }
    case 'email':
      if (holders.byEmail) return signIn(holders.byEmail)
      return { action: 'create', account: { email: incoming.email, emailVerifiedBy: 'link' } }
  }
}

function resolveLink(
  member: MemberIdentity,
  incoming: ProviderIncoming,
  holders: Holders,
): Resolution {
  if (incoming.method === 'orcid') {
    if (member.orcidId === incoming.sub) return update(member, null)
    if (member.orcidId) return refuse('orcid-already-linked')
    if (other(holders.byOrcidId, member)) return refuse('orcid-elsewhere')
    return update(member, { orcidId: incoming.sub })
  }
  if (member.googleId === incoming.sub) return update(member, null)
  if (member.googleId) return refuse('google-already-linked')
  if (other(holders.byGoogleId, member)) return refuse('google-elsewhere')
  const changes: Changes = { googleId: incoming.sub }
  // An account without an address takes Google's authoritative one, if no other account has it;
  // otherwise Google is linked without it.
  if (!member.email && incoming.email && !other(holders.byEmail, member)) {
    changes.email = incoming.email
    changes.emailVerifiedBy = 'google'
  }
  return update(member, changes)
}

/** Decides a sign-in, a link, an address change or an unlink (the M4b design §7.3). */
export function resolve(event: IdentityEvent, holders: Holders = {}): Resolution {
  switch (event.kind) {
    case 'sign-in':
      return resolveSignIn(event.incoming, holders)
    case 'link':
      return resolveLink(event.member, event.incoming, holders)
    case 'verify-email': {
      const { member, email } = event
      if (member.id !== event.tokenMemberId) return refuse('not-token-member')
      if (member.email === email) return update(member, null)
      if (other(holders.byEmail, member)) return refuse('email-taken')
      return update(member, { email, emailVerifiedBy: 'link' })
    }
    case 'unlink': {
      const { member } = event
      const column = event.method === 'google' ? 'googleId' : 'orcidId'
      if (!member[column]) return update(member, null)
      const remaining = [member.email, column === 'googleId' ? member.orcidId : member.googleId]
      if (!remaining.some(Boolean)) return refuse('last-method')
      return update(member, { clear: column })
    }
  }
}

/** Google's `sub`: at most 255 printable ASCII characters (Google's are 21 digits). */
export function isGoogleSubject(value: unknown): value is string {
  return typeof value === 'string' && /^[\x21-\x7E]{1,255}$/.test(value)
}

/** ORCID's `sub` is the member's iD, with a valid check character. */
export function isOrcidSubject(value: unknown): value is string {
  return typeof value === 'string' && isOrcidId(value)
}

/** The Google domains whose addresses Google itself issues. */
const GOOGLE_MAIL_DOMAINS = ['@gmail.com', '@googlemail.com']

/**
 * The address from a Google ID token that may be stored and matched, or null: verified
 * (`email_verified` is exactly true) and one Google is authoritative for, a Gmail address or the
 * address of a Workspace account (`hd`, read only for this rule and never stored). Any other
 * address is treated as if Google had sent none.
 */
export function googleEmail(claims: { email?: unknown; email_verified?: unknown; hd?: unknown }) {
  if (claims.email_verified !== true || typeof claims.email !== 'string') return null
  const email = normaliseEmail(claims.email)
  if (!email) return null
  const workspace = typeof claims.hd === 'string' && claims.hd.trim() !== ''
  return workspace || GOOGLE_MAIL_DOMAINS.some((domain) => email.endsWith(domain)) ? email : null
}
