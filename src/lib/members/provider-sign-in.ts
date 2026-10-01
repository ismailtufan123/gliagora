import { type MemberCookie, sessionCookie } from './cookies'
import {
  type Holders,
  type MemberIdentity,
  type ProviderIncoming,
  type Refusal,
  resolve,
} from './identity'
import {
  type MemberDb,
  type MemberRecord,
  MemberStoreError,
  applyChanges,
  createMember,
  createSession,
  endOtherSessions,
  findMember,
  isUniqueViolation,
} from './store'

// What signing in with Google or ORCID, linking them and removing them do to the accounts (M4b,
// D49; the M4b design §7.2, §7.3). `resolve()` (identity.ts) decides from the members who hold the
// incoming identifiers; this applies the decision in SQL (store.ts), where unique indexes and
// guarded updates repeat the decisive checks. When another request changed those members in
// between (a unique index refuses, or a guard finds the row changed), the decision is made once
// more from what is there now; a second conflict is a failure the caller reports with a reference.
// Two existing accounts are never merged.

const ATTEMPTS = 2

const identityOf = (member: MemberRecord | null): MemberIdentity | null =>
  member && {
    id: member.id,
    email: member.email,
    googleId: member.googleId,
    orcidId: member.orcidId,
  }

/** The members who hold what the provider proved. */
async function holdersOf(db: MemberDb, incoming: ProviderIncoming): Promise<Holders> {
  if (incoming.method === 'google') {
    return {
      byGoogleId: identityOf(await findMember(db, { googleId: incoming.sub })),
      byEmail: incoming.email ? identityOf(await findMember(db, { email: incoming.email })) : null,
    }
  }
  return { byOrcidId: identityOf(await findMember(db, { orcidId: incoming.sub })) }
}

/** A conflict that remained after deciding again: nothing changed. */
const conflict = () => new MemberStoreError('conflict', 'members')

/** The refusals Google and ORCID can meet (the others are about email links, from PR 5 on). */
export type ProviderRefusal = Exclude<Refusal, 'email-taken' | 'not-token-member'>

function providerRefusal(reason: Refusal): ProviderRefusal {
  if (reason === 'email-taken' || reason === 'not-token-member') {
    throw new MemberStoreError('invalid', 'resolution')
  }
  return reason
}

export type ProviderSignIn =
  /** Signed in to an existing member; `changed` when the sign-in also linked the method. */
  | { kind: 'signed-in'; memberId: number; changed: boolean }
  /** No account yet: the person confirms "Create account" first. */
  | { kind: 'confirm' }
  /** The account was made ("Create account" pressed). */
  | { kind: 'created'; memberId: number }
  | { kind: 'refused'; reason: ProviderRefusal }

/**
 * Signs in with what Google or ORCID proved: to the member who has it, or to the member with the
 * Google account's authoritative address (linking Google to it), or nowhere yet (`confirm`). With
 * `create`, after "Create account": a new member instead of `confirm`, with the display name the
 * member chose (ORCID); if the identity found an account meanwhile (pressed twice, or another
 * browser was quicker), that account is signed in to.
 */
export async function signInWithProvider(
  db: MemberDb,
  incoming: ProviderIncoming,
  now: Date,
  create?: { displayName: string | null },
): Promise<ProviderSignIn> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const decision = resolve({ kind: 'sign-in', incoming }, await holdersOf(db, incoming))
    switch (decision.action) {
      case 'refuse':
        return { kind: 'refused', reason: providerRefusal(decision.reason) }
      case 'create': {
        if (!create) return { kind: 'confirm' }
        try {
          const member = await createMember(
            db,
            { ...decision.account, displayName: create.displayName },
            now,
          )
          return { kind: 'created', memberId: member.id }
        } catch (error) {
          if (isUniqueViolation(error)) continue
          throw error
        }
      }
      case 'sign-in': {
        if (!decision.changes) {
          return { kind: 'signed-in', memberId: decision.memberId, changed: false }
        }
        try {
          if (await applyChanges(db, decision.memberId, decision.changes, now)) {
            return { kind: 'signed-in', memberId: decision.memberId, changed: true }
          }
        } catch (error) {
          if (!isUniqueViolation(error)) throw error
        }
        continue
      }
      case 'update':
        // A sign-in never changes a signed-in member's own account (identity.ts).
        throw new MemberStoreError('invalid', 'resolution')
    }
  }
  throw conflict()
}

export type ProviderChange =
  /** `changed` is false when there was nothing to do (already linked, or already removed). */
  { kind: 'done'; changed: boolean } | { kind: 'refused'; reason: ProviderRefusal }

/**
 * Links Google or ORCID to the signed-in member's account (from its settings). Google's
 * authoritative address comes along when the account has none and no other account has it.
 */
export async function linkProvider(
  db: MemberDb,
  memberId: number,
  incoming: ProviderIncoming,
  now: Date,
): Promise<ProviderChange> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const member = identityOf(await findMember(db, { id: memberId }))
    if (!member) throw new MemberStoreError('gone', 'members')
    const decision = resolve({ kind: 'link', member, incoming }, await holdersOf(db, incoming))
    if (decision.action === 'refuse')
      return { kind: 'refused', reason: providerRefusal(decision.reason) }
    if (decision.action !== 'update') throw new MemberStoreError('invalid', 'resolution')
    if (!decision.changes) return { kind: 'done', changed: false }
    try {
      if (await applyChanges(db, memberId, decision.changes, now)) {
        return { kind: 'done', changed: true }
      }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
    }
  }
  throw conflict()
}

/** Removes Google or ORCID from the signed-in member's account, unless it is the last way in. */
export async function unlinkProvider(
  db: MemberDb,
  memberId: number,
  method: 'google' | 'orcid',
  now: Date,
): Promise<ProviderChange> {
  const member = identityOf(await findMember(db, { id: memberId }))
  if (!member) throw new MemberStoreError('gone', 'members')
  const decision = resolve({ kind: 'unlink', member, method })
  if (decision.action === 'refuse')
    return { kind: 'refused', reason: providerRefusal(decision.reason) }
  if (decision.action !== 'update') throw new MemberStoreError('invalid', 'resolution')
  if (!decision.changes) return { kind: 'done', changed: false }
  // The guard in SQL keeps the last way in even against a removal at the same moment.
  return (await applyChanges(db, memberId, decision.changes, now))
    ? { kind: 'done', changed: true }
    : { kind: 'refused', reason: 'last-method' }
}

/**
 * A new session for this browser (the one it carried, `replaces`, ends), after a sign-in or a
 * change of sign-in methods; with `endOthers`, also ends every other session of the member (the
 * M4b design §7.3), so a session planted by someone else, or made through a method just removed,
 * does not survive. Returns the cookie and how many other sessions ended.
 */
export async function rotateSession(
  db: MemberDb,
  memberId: number,
  now: Date,
  { replaces, endOthers }: { replaces: string | null | undefined; endOthers: boolean },
): Promise<{ cookie: MemberCookie; othersEnded: number }> {
  const session = await createSession(db, memberId, now, { replaces })
  const othersEnded = endOthers ? await endOtherSessions(db, memberId, session.token) : 0
  return { cookie: sessionCookie(session.token, session.expiresAt, now), othersEnded }
}
