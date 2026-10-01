import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
import type { SQL } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { z } from 'zod'

import { errorCode } from '@/lib/errors'
import {
  DATA_REQUEST_LINK_HOURS,
  INACTIVITY_GRACE_DAYS,
  INACTIVITY_MONTHS,
  MAX_SAVED_ITEMS,
  MAX_SESSIONS,
  SESSION_DAYS,
  SIGN_IN_LINK_MINUTES,
  VERIFY_LINK_HOURS,
  addMonthsUtc,
} from '@/lib/retention/rules'

import { normaliseEmail } from './email-address'
import { type Changes, type NewAccount, isGoogleSubject } from './identity'
import { isOrcidId } from './orcid-id'
import { parseSave } from './return-path'
import { TOKEN_HASH_PATTERN, hashToken, isToken, newToken } from './tokens'

// Member rows in PostgreSQL (M4b, D49; the M4b design §6, §8): sessions, email links, accounts,
// saved items and account deletion. The hot paths of sign-in run here in SQL rather than through
// Payload's local API: every value is a parameter of Drizzle's `sql` tag, never part of the text,
// and each change that touches several tables runs in one transaction (a savepoint when the caller
// already holds one). Payload's hooks and field checks do not run for these statements, so the
// limits are checked here (zod) and the rules that matter are database constraints (the raw-SQL
// migration `…_member_constraints`): a member always keeps a way in, addresses are lowercased,
// tokens are stored as SHA-256 only.
//
// Errors never carry values: PostgreSQL's messages quote them (`Key (email)=(…) already exists`),
// so every function rethrows a MemberStoreError with the error's code and, for a constraint, its
// name, which callers may log.

/** A connection or transaction that runs SQL and can open a (nested) transaction. */
export type MemberDb = Pick<PostgresAdapter['drizzle'], 'execute' | 'transaction'>

/** Payload's own connection pool. */
export const memberDb = (payload: Payload): MemberDb =>
  (payload.db as unknown as PostgresAdapter).drizzle

/** A failure without the values involved: the PostgreSQL code (or `invalid`) and a name. */
export class MemberStoreError extends Error {
  override name = 'MemberStoreError'
  readonly code: string
  /** The constraint that refused a row, or the input field that was refused. */
  readonly target?: string

  constructor(code: string, target?: string) {
    super(`Member data not stored (${[code, target].filter(Boolean).join(' ')})`)
    this.code = code
    this.target = target
  }
}

/** Whether `error` is a refusal by a unique index (a concurrent create, a taken identifier). */
export const isUniqueViolation = (error: unknown) =>
  error instanceof MemberStoreError && error.code === '23505'

/** The constraint named by a database error (Drizzle wraps the driver's error as its cause). */
function constraintOf(error: unknown): string | undefined {
  let current = error
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
    const constraint = (current as { constraint?: unknown }).constraint
    if (typeof constraint === 'string') return constraint
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}

/** Runs `work`, turning any error into a MemberStoreError without values. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof MemberStoreError) throw error
    throw new MemberStoreError(errorCode(error) ?? 'unknown', constraintOf(error))
  }
}

/** Checks `value` against `schema`; a refusal names the input, never its value. */
function checked<T>(schema: z.ZodType<T>, value: unknown, name: string): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new MemberStoreError('invalid', name)
  return result.data
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const id = z.number().int().positive()
/** An address in its stored form only (normaliseEmail): callers normalise first. */
const storedEmail = z
  .string()
  .max(254)
  .refine((value) => normaliseEmail(value) === value)
const googleId = z.string().refine(isGoogleSubject)
const orcidId = z.string().refine(isOrcidId)
const displayName = z
  .string()
  .max(80)
  .refine((value) => !/[\u0000-\u001F\u007F]/.test(value))

const iso = (date: Date) => date.toISOString()

/** A timestamp as node-postgres or Drizzle return it (a Date, or PostgreSQL's text). */
function toDate(value: unknown): Date | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

/** One row of `rows`, or null. */
const first = <T>(rows: readonly T[]): T | null => rows[0] ?? null

// ---------------------------------------------------------------------------------------------
// Members

export type MemberRecord = {
  id: number
  email: string | null
  emailVerifiedAt: Date | null
  emailVerifiedBy: 'link' | 'google' | null
  googleId: string | null
  orcidId: string | null
  displayName: string | null
  lastSeenAt: Date
  deletionWarnedAt: Date | null
  warningRefusedAt: Date | null
  createdAt: Date
}

type MemberRow = {
  id: number
  email: string | null
  email_verified_at: unknown
  email_verified_by: 'link' | 'google' | null
  google_id: string | null
  orcid_id: string | null
  display_name: string | null
  last_seen_at: unknown
  deletion_warned_at: unknown
  warning_refused_at: unknown
  created_at: unknown
}

const MEMBER_COLUMNS = sql.raw(
  'm.id, m.email, m.email_verified_at, m.email_verified_by, m.google_id, m.orcid_id, m.display_name, m.last_seen_at, m.deletion_warned_at, m.warning_refused_at, m.created_at',
)

const toMember = (row: MemberRow): MemberRecord => ({
  id: Number(row.id),
  email: row.email,
  emailVerifiedAt: toDate(row.email_verified_at),
  emailVerifiedBy: row.email_verified_by,
  googleId: row.google_id,
  orcidId: row.orcid_id,
  displayName: row.display_name,
  lastSeenAt: toDate(row.last_seen_at) as Date,
  deletionWarnedAt: toDate(row.deletion_warned_at),
  warningRefusedAt: toDate(row.warning_refused_at),
  createdAt: toDate(row.created_at) as Date,
})

export type MemberLookup =
  { id: number } | { email: string } | { googleId: string } | { orcidId: string }

/** The member with this ID, stored address, Google account or ORCID iD, or null. */
export function findMember(db: MemberDb, by: MemberLookup): Promise<MemberRecord | null> {
  return guarded(async () => {
    let where: SQL
    if ('id' in by) where = sql`m.id = ${checked(id, by.id, 'id')}`
    else if ('email' in by) where = sql`m.email = ${checked(storedEmail, by.email, 'email')}`
    else if ('googleId' in by)
      where = sql`m.google_id = ${checked(googleId, by.googleId, 'googleId')}`
    else where = sql`m.orcid_id = ${checked(orcidId, by.orcidId, 'orcidId')}`
    const { rows } = await db.execute<MemberRow>(
      sql`SELECT ${MEMBER_COLUMNS} FROM members m WHERE ${where}`,
    )
    const row = first(rows)
    return row ? toMember(row) : null
  })
}

/**
 * Creates a member after "Create account" (or an email link to a new address). A concurrent
 * create with the same address or identity is refused by a unique index (`isUniqueViolation`):
 * the caller then signs in to the member that won.
 */
export function createMember(
  db: MemberDb,
  account: NewAccount & { displayName?: string | null },
  now: Date,
): Promise<MemberRecord> {
  return guarded(async () => {
    const email = account.email === undefined ? null : checked(storedEmail, account.email, 'email')
    const google =
      account.googleId === undefined ? null : checked(googleId, account.googleId, 'googleId')
    const orcid =
      account.orcidId === undefined ? null : checked(orcidId, account.orcidId, 'orcidId')
    const name = account.displayName
      ? checked(displayName, account.displayName, 'displayName')
      : null
    if (!email && !google && !orcid) throw new MemberStoreError('invalid', 'identity')
    const verifiedBy = email ? (account.emailVerifiedBy ?? null) : null
    if (email && !verifiedBy) throw new MemberStoreError('invalid', 'emailVerifiedBy')
    const at = iso(now)
    const { rows } = await db.execute<MemberRow>(sql`
      INSERT INTO members AS m (email, email_verified_at, email_verified_by, google_id, orcid_id,
        display_name, digest_opt_in, last_seen_at, created_at, updated_at)
      VALUES (${email}, ${email ? at : null}, ${verifiedBy}, ${google}, ${orcid}, ${name}, false,
        ${at}, ${at}, ${at})
      RETURNING ${MEMBER_COLUMNS}`)
    return toMember(rows[0]!)
  })
}

/**
 * Applies a change of sign-in methods that `resolve()` decided (identity.ts), guarded in SQL so a
 * concurrent change cannot slip past the decision: a provider is set only where the column is
 * empty or already holds it, a Google address only where the member has none, and a method is
 * removed only while another way in remains (the database's own check repeats that). Returns
 * whether the row changed; a provider or address taken meanwhile by another member is refused by
 * its unique index (`isUniqueViolation`).
 */
export function applyChanges(
  db: MemberDb,
  memberId: number,
  changes: Changes,
  now: Date,
): Promise<boolean> {
  return guarded(async () => {
    const member = checked(id, memberId, 'id')
    const sets: SQL[] = []
    const guards: SQL[] = [sql`id = ${member}`]
    if (changes.googleId !== undefined) {
      const value = checked(googleId, changes.googleId, 'googleId')
      sets.push(sql`google_id = ${value}`)
      guards.push(sql`(google_id IS NULL OR google_id = ${value})`)
    }
    if (changes.orcidId !== undefined) {
      const value = checked(orcidId, changes.orcidId, 'orcidId')
      sets.push(sql`orcid_id = ${value}`)
      guards.push(sql`(orcid_id IS NULL OR orcid_id = ${value})`)
    }
    if (changes.email !== undefined) {
      const value = checked(storedEmail, changes.email, 'email')
      const by = checked(z.enum(['link', 'google']), changes.emailVerifiedBy, 'emailVerifiedBy')
      sets.push(sql`email = ${value}, email_verified_at = ${iso(now)}, email_verified_by = ${by}`)
      // A link proves the address and replaces an earlier one; Google's only fills a gap.
      if (by === 'google') guards.push(sql`(email IS NULL OR email = ${value})`)
    }
    if (changes.clear === 'googleId') {
      sets.push(sql`google_id = NULL`)
      guards.push(sql`(email IS NOT NULL OR orcid_id IS NOT NULL)`)
    } else if (changes.clear === 'orcidId') {
      sets.push(sql`orcid_id = NULL`)
      guards.push(sql`(email IS NOT NULL OR google_id IS NOT NULL)`)
    }
    if (sets.length === 0) return false
    sets.push(sql`updated_at = ${iso(now)}`)
    const { rows } = await db.execute<{ id: number }>(sql`
      UPDATE members SET ${sql.join(sets, sql`, `)}
      WHERE ${sql.join(guards, sql` AND `)}
      RETURNING id`)
    return rows.length === 1
  })
}

/** After an email link: records when the address was proved, if it never was. */
export function markEmailVerified(db: MemberDb, memberId: number, now: Date): Promise<void> {
  return guarded(async () => {
    await db.execute(sql`
      UPDATE members SET email_verified_at = ${iso(now)}, email_verified_by = 'link',
        updated_at = ${iso(now)}
      WHERE id = ${checked(id, memberId, 'id')} AND email IS NOT NULL
        AND email_verified_at IS NULL`)
  })
}

/**
 * Records activity (any signed-in request, at most once a day): sets `last_seen_at` and cancels a
 * pending inactivity warning (PLAN §18.1). Returns whether the row changed.
 */
export function touchMember(db: MemberDb, memberId: number, now: Date): Promise<boolean> {
  return guarded(async () => {
    const { rows } = await db.execute<{ id: number }>(sql`
      UPDATE members
      SET last_seen_at = ${iso(now)}, deletion_warned_at = NULL, warning_refused_at = NULL,
        updated_at = ${iso(now)}
      WHERE id = ${checked(id, memberId, 'id')}
        AND last_seen_at < ${iso(new Date(now.getTime() - DAY_MS))}
      RETURNING id`)
    return rows.length === 1
  })
}

// ---------------------------------------------------------------------------------------------
// Sessions

export type NewSession = { token: string; expiresAt: Date }

/**
 * A new session for `memberId`, at every sign-in and account creation: a new random token, 30
 * days from now, never extended. The session the request carried (`replaces`, the old cookie's
 * token) is deleted whoever's it was, so a sign-in never reuses a session someone else may know.
 * Beyond MAX_SESSIONS per member, the oldest go.
 */
export function createSession(
  db: MemberDb,
  memberId: number,
  now: Date,
  { replaces }: { replaces?: string | null } = {},
): Promise<NewSession> {
  return guarded(() =>
    db.transaction(async (tx) => {
      const member = checked(id, memberId, 'id')
      const token = newToken()
      const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY_MS)
      await tx.execute(sql`
        INSERT INTO member_sessions (member_id, token_hash, expires_at, created_at, updated_at)
        VALUES (${member}, ${hashToken(token)}, ${iso(expiresAt)}, ${iso(now)}, ${iso(now)})`)
      if (isToken(replaces)) {
        await tx.execute(sql`DELETE FROM member_sessions WHERE token_hash = ${hashToken(replaces)}`)
      }
      await tx.execute(sql`
        DELETE FROM member_sessions WHERE id IN (
          SELECT id FROM member_sessions WHERE member_id = ${member}
          ORDER BY created_at DESC, id DESC OFFSET ${MAX_SESSIONS})`)
      return { token, expiresAt }
    }),
  )
}

export type SessionRecord = { sessionId: number; expiresAt: Date; member: MemberRecord }

/** The unexpired session of a cookie's token, with its member, or null. */
export function findSession(
  db: MemberDb,
  token: string | null | undefined,
  now: Date,
): Promise<SessionRecord | null> {
  return guarded(async () => {
    if (!isToken(token)) return null
    const { rows } = await db.execute<MemberRow & { session_id: number; expires_at: unknown }>(sql`
      SELECT s.id AS session_id, s.expires_at, ${MEMBER_COLUMNS}
      FROM member_sessions s JOIN members m ON m.id = s.member_id
      WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > ${iso(now)}`)
    const row = first(rows)
    if (!row) return null
    return {
      sessionId: Number(row.session_id),
      expiresAt: toDate(row.expires_at) as Date,
      member: toMember(row),
    }
  })
}

/** Signs one browser out: deletes the session of its token. */
export function endSession(db: MemberDb, token: string | null | undefined): Promise<void> {
  return guarded(async () => {
    if (!isToken(token)) return
    await db.execute(sql`DELETE FROM member_sessions WHERE token_hash = ${hashToken(token)}`)
  })
}

/**
 * Ends every session of the member except the one with `keepToken`: after every change of sign-in
 * methods (the M4b design §7.3), so a session planted by someone else, or made through an identity
 * just removed, does not survive it. Returns how many ended.
 */
export function endOtherSessions(
  db: MemberDb,
  memberId: number,
  keepToken: string,
): Promise<number> {
  return guarded(async () => {
    if (!isToken(keepToken)) throw new MemberStoreError('invalid', 'keepToken')
    const { rows } = await db.execute<{ id: number }>(sql`
      DELETE FROM member_sessions
      WHERE member_id = ${checked(id, memberId, 'id')} AND token_hash <> ${hashToken(keepToken)}
      RETURNING id`)
    return rows.length
  })
}

/** "Sign out everywhere": ends every session of the member. Returns how many ended. */
export function endAllSessions(db: MemberDb, memberId: number): Promise<number> {
  return guarded(async () => {
    const { rows } = await db.execute<{ id: number }>(sql`
      DELETE FROM member_sessions WHERE member_id = ${checked(id, memberId, 'id')} RETURNING id`)
    return rows.length
  })
}

// ---------------------------------------------------------------------------------------------
// Email links

export type EmailTokenPurpose = 'sign-in' | 'verify-email' | 'data-request'

/** How long each kind of link works. */
export const TOKEN_LIFETIME_MS: Record<EmailTokenPurpose, number> = {
  'sign-in': SIGN_IN_LINK_MINUTES * MINUTE_MS,
  'verify-email': VERIFY_LINK_HOURS * HOUR_MS,
  'data-request': DATA_REQUEST_LINK_HOURS * HOUR_MS,
}

export type NewEmailToken = {
  purpose: EmailTokenPurpose
  /** Where the email goes, in its stored form (normaliseEmail). */
  email: string
  /** `verify-email`: the member who asked. */
  memberId?: number
  /** `sign-in`: SHA-256 of the binding in the requesting browser's sign-in cookie. */
  browserHash?: string
  /** `data-request`: the request's minimal record. */
  requestId?: number
  next?: string | null
  save?: string | null
  locale: 'en' | 'tr'
  /** `data-request`: what the form said, kept until the person confirms it. */
  requestData?: Record<string, unknown> | null
}

export type EmailTokenRecord = {
  purpose: EmailTokenPurpose
  email: string
  memberId: number | null
  browserHash: string | null
  requestId: number | null
  next: string | null
  save: string | null
  locale: 'en' | 'tr'
  requestData: Record<string, unknown> | null
  expiresAt: Date
}

type TokenRow = {
  purpose: EmailTokenPurpose
  email: string
  member_id: number | null
  browser_hash: string | null
  request_id: number | null
  next: string | null
  save: string | null
  locale: 'en' | 'tr'
  request_data: unknown
  expires_at: unknown
}

const TOKEN_COLUMNS = sql.raw(
  'purpose, email, member_id, browser_hash, request_id, next, save, locale, request_data, expires_at',
)

const toTokenRecord = (row: TokenRow): EmailTokenRecord => ({
  purpose: row.purpose,
  email: row.email,
  memberId: row.member_id == null ? null : Number(row.member_id),
  browserHash: row.browser_hash,
  requestId: row.request_id == null ? null : Number(row.request_id),
  next: row.next,
  save: row.save,
  locale: row.locale,
  requestData:
    row.request_data && typeof row.request_data === 'object'
      ? (row.request_data as Record<string, unknown>)
      : null,
  expiresAt: toDate(row.expires_at) as Date,
})

const newTokenInput = z
  .object({
    purpose: z.enum(['sign-in', 'verify-email', 'data-request']),
    email: storedEmail,
    memberId: id.optional(),
    browserHash: z.string().regex(TOKEN_HASH_PATTERN).optional(),
    requestId: id.optional(),
    next: z.string().max(1000).nullish(),
    save: z
      .string()
      .max(20)
      .refine((value) => parseSave(value) !== null)
      .nullish(),
    locale: z.enum(['en', 'tr']),
    requestData: z
      .record(z.string(), z.unknown())
      .refine((value) => JSON.stringify(value).length <= 4000)
      .nullish(),
  })
  // A link to add an address is bound to the member who asked; a sign-in link may carry the
  // requesting browser's binding; nothing else carries either.
  .refine((value) => (value.purpose === 'verify-email') === (value.memberId !== undefined))
  .refine((value) => value.browserHash === undefined || value.purpose === 'sign-in')

/** Stores a new email link and returns its token, for the email only. */
export function createEmailToken(
  db: MemberDb,
  input: NewEmailToken,
  now: Date,
): Promise<{ token: string; expiresAt: Date }> {
  return guarded(async () => {
    const value = checked(newTokenInput, input, 'token')
    const token = newToken()
    const expiresAt = new Date(now.getTime() + TOKEN_LIFETIME_MS[value.purpose])
    await db.execute(sql`
      INSERT INTO email_tokens (token_hash, purpose, email, member_id, browser_hash, request_id,
        next, save, locale, request_data, expires_at, created_at, updated_at)
      VALUES (${hashToken(token)}, ${value.purpose}, ${value.email}, ${value.memberId ?? null},
        ${value.browserHash ?? null}, ${value.requestId ?? null}, ${value.next ?? null},
        ${value.save ?? null}, ${value.locale},
        ${value.requestData ? JSON.stringify(value.requestData) : null}::jsonb,
        ${iso(expiresAt)}, ${iso(now)}, ${iso(now)})`)
    return { token, expiresAt }
  })
}

/**
 * Looks an unexpired link up without using it (the landing pages): opening a link, as mail
 * scanners do, never consumes or deletes anything.
 */
export function findEmailToken(
  db: MemberDb,
  token: string | null | undefined,
  now: Date,
): Promise<EmailTokenRecord | null> {
  return guarded(async () => {
    if (!isToken(token)) return null
    const { rows } = await db.execute<TokenRow>(sql`
      SELECT ${TOKEN_COLUMNS} FROM email_tokens
      WHERE token_hash = ${hashToken(token)} AND expires_at > ${iso(now)}`)
    const row = first(rows)
    return row ? toTokenRecord(row) : null
  })
}

/**
 * Uses a link: deletes it in one statement that also checks its purpose and expiry, and for
 * `verify-email` that the signed-in member is the one who asked, so of two requests at the same
 * moment exactly one gets it, and a link never works for another purpose. Returns what it held, or
 * null (unknown, expired, used, another purpose, another member).
 */
export function consumeEmailToken(
  db: MemberDb,
  token: string | null | undefined,
  purpose: EmailTokenPurpose,
  now: Date,
  { memberId }: { memberId?: number } = {},
): Promise<EmailTokenRecord | null> {
  return guarded(async () => {
    if (!isToken(token)) return null
    const forMember =
      purpose === 'verify-email'
        ? sql` AND member_id = ${checked(id, memberId, 'memberId')}`
        : sql``
    const { rows } = await db.execute<TokenRow>(sql`
      DELETE FROM email_tokens
      WHERE token_hash = ${hashToken(token)} AND purpose = ${purpose}
        AND expires_at > ${iso(now)}${forMember}
      RETURNING ${TOKEN_COLUMNS}`)
    const row = first(rows)
    return row ? toTokenRecord(row) : null
  })
}

/** Deletes a link whose email could not be sent. */
export function deleteEmailToken(db: MemberDb, token: string): Promise<void> {
  return guarded(async () => {
    if (!isToken(token)) return
    await db.execute(sql`DELETE FROM email_tokens WHERE token_hash = ${hashToken(token)}`)
  })
}

/** After a sign-in by link: the address's other pending sign-in links stop working. */
export function deleteSignInTokens(db: MemberDb, email: string): Promise<number> {
  return guarded(async () => {
    const { rows } = await db.execute<{ id: number }>(sql`
      DELETE FROM email_tokens
      WHERE purpose = 'sign-in' AND email = ${checked(storedEmail, email, 'email')}
      RETURNING id`)
    return rows.length
  })
}

// ---------------------------------------------------------------------------------------------
// Saved items

export type SaveOutcome = 'saved' | 'already' | 'full'

/**
 * Saves a job for a member, at most MAX_SAVED_ITEMS each. The member's row is locked first, so two
 * saves at the same moment cannot both pass the count. Whether the job may be saved (public, open
 * or closed less than 30 days ago) is the caller's check.
 */
export function saveJob(
  db: MemberDb,
  memberId: number,
  jobId: number,
  now: Date,
): Promise<SaveOutcome> {
  return guarded(() =>
    db.transaction(async (tx) => {
      const member = checked(id, memberId, 'id')
      const job = checked(id, jobId, 'jobId')
      await tx.execute(sql`SELECT id FROM members WHERE id = ${member} FOR UPDATE`)
      const { rows } = await tx.execute<{ total: number; here: number }>(sql`
        SELECT count(*)::int AS total, count(*) FILTER (WHERE job_id = ${job})::int AS here
        FROM saved_items WHERE member_id = ${member}`)
      if (Number(rows[0]?.here ?? 0) > 0) return 'already'
      if (Number(rows[0]?.total ?? 0) >= MAX_SAVED_ITEMS) return 'full'
      const inserted = await tx.execute<{ id: number }>(sql`
        INSERT INTO saved_items (member_id, item_type, job_id, created_at, updated_at)
        VALUES (${member}, 'job', ${job}, ${iso(now)}, ${iso(now)})
        ON CONFLICT DO NOTHING
        RETURNING id`)
      return inserted.rows.length === 1 ? 'saved' : 'already'
    }),
  )
}

/** Removes a saved job, whatever the job's state. Returns whether it was saved. */
export function unsaveJob(db: MemberDb, memberId: number, jobId: number): Promise<boolean> {
  return guarded(async () => {
    const { rows } = await db.execute<{ id: number }>(sql`
      DELETE FROM saved_items
      WHERE member_id = ${checked(id, memberId, 'id')} AND job_id = ${checked(id, jobId, 'jobId')}
      RETURNING id`)
    return rows.length > 0
  })
}

/** How many items the member has saved. */
export function countSavedItems(db: MemberDb, memberId: number): Promise<number> {
  return guarded(async () => {
    const { rows } = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM saved_items WHERE member_id = ${checked(id, memberId, 'id')}`)
    return Number(rows[0]?.n ?? 0)
  })
}

// ---------------------------------------------------------------------------------------------
// Deleting an account

export type MemberDeletion =
  /** The member deleted the account, or a confirmed data request named its address. */
  | { reason: 'request' }
  /**
   * The inactivity rule (PLAN §18.1), re-checked in SQL under the row's lock, so a member who
   * signed in between selection and deletion is kept: `warned`, 30 days after a warning with no
   * activity since; `without-email`, 24 months and 30 days after the last activity.
   */
  | { reason: 'inactivity'; condition: 'warned' | 'without-email' }
  /**
   * Repeating a logged deletion after a restore, at `loggedAt` (the log row's `at`): not logged a
   * second time. A restore also sets the ID sequences back, so a member who joined after it can
   * have a logged ID; only a member created no later than the logged deletion is deleted.
   */
  | { reason: 'reapply'; loggedAt: Date }

/**
 * Deletes a member and everything that is theirs, in one transaction: saved items, sessions, the
 * sign-in and address links by member and by address (a pending data-request link stays: a copy of
 * one's data asked for minutes earlier survives the account), the member (whose preferred subfields
 * go with it, `members_rels`), and a row in the deletion log, so the deletion is repeated if a
 * backup is ever restored. Returns false, changing nothing, when there is no such member, the
 * inactivity condition no longer holds, or (repeating a logged deletion) the member is newer than
 * the deletion. A database test checks that every table referring to members is covered here.
 */
export function deleteMember(
  db: MemberDb,
  memberId: number,
  deletion: MemberDeletion,
  now: Date,
): Promise<boolean> {
  return guarded(() =>
    db.transaction(async (tx) => {
      const member = checked(id, memberId, 'id')
      let condition = sql``
      if (deletion.reason === 'inactivity') {
        condition =
          deletion.condition === 'warned'
            ? sql` AND deletion_warned_at <= ${iso(new Date(now.getTime() - INACTIVITY_GRACE_DAYS * DAY_MS))}
                AND last_seen_at < deletion_warned_at`
            : sql` AND email IS NULL AND last_seen_at <= ${iso(
                new Date(
                  addMonthsUtc(now, -INACTIVITY_MONTHS).getTime() - INACTIVITY_GRACE_DAYS * DAY_MS,
                ),
              )}`
      } else if (deletion.reason === 'reapply') {
        const loggedAt = checked(z.date(), deletion.loggedAt, 'loggedAt')
        condition = sql` AND created_at <= ${iso(loggedAt)}`
      }
      const { rows } = await tx.execute<{ id: number; email: string | null }>(sql`
        SELECT id, email FROM members WHERE id = ${member}${condition} FOR UPDATE`)
      const row = first(rows)
      if (!row) return false
      await tx.execute(sql`DELETE FROM saved_items WHERE member_id = ${member}`)
      await tx.execute(sql`DELETE FROM member_sessions WHERE member_id = ${member}`)
      await tx.execute(sql`
        DELETE FROM email_tokens
        WHERE purpose IN ('sign-in', 'verify-email')
          AND (member_id = ${member} OR email = ${row.email})`)
      if (deletion.reason !== 'reapply') {
        await tx.execute(sql`
          INSERT INTO deletion_log (target_collection, target_id, action, at)
          VALUES ('members', ${member}, 'delete', ${iso(now)})`)
      }
      await tx.execute(sql`DELETE FROM members WHERE id = ${member}`)
      return true
    }),
  )
}
