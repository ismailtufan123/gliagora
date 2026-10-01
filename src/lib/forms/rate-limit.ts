import { sql } from '@payloadcms/db-postgres'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { keyedHash } from '@/lib/keys'
import { limitAddress } from '@/lib/members/email-address'

// Limits on the public forms (PLAN §3.2, D34, D49), kept in the form-limits table
// (src/collections/FormLimits.ts): one row for each form accepted under each of its keys (a hashed
// IP address in the form's own bucket, from M4b also a hashed email address and the site-wide
// count of emails), and one for each spam-check answer used, so that an answer sends only one
// form. Rows are deleted within 24 hours: here, whenever a form reaches the limit (whatever the
// decision), and by the hourly task (src/jobs/maintenance/purgeFormLimits.ts). They never go into
// backups (deploy/backup/backup.sh).

const HOUR_MS = 60 * 60_000

/** A form's own limit: at most `perWindow` sends per hashed IP address within LIMIT_WINDOW_MS. */
export type LimitBucket = { name: string; perWindow: number }

/** "Suggest a listing": 5 suggestions an hour per address (PLAN §3.2). */
export const SUGGEST_LIMIT: LimitBucket = { name: 'suggest', perWindow: 5 }

/**
 * "Report a problem" (M4.6): 5 reports an hour per address, counted apart from suggestions, so
 * someone who suggested listings can still report a problem.
 */
export const REPORT_LIMIT: LimitBucket = { name: 'report', perWindow: 5 }

/**
 * Asking for a sign-in link (M4b, D49): 10 an hour per address, besides the budget of the email
 * address the link goes to and the site-wide cap (`emailLimits`).
 */
export const SIGN_IN_LIMIT: LimitBucket = { name: 'signin', perWindow: 10 }

/**
 * "Create account" after signing in with Google or ORCID (M4b, D49): 10 accounts an hour per
 * address. No spam check there (the provider's sign-in is the proof), so this limit alone keeps a
 * script with many provider accounts from filling the members table.
 */
export const CREATE_ACCOUNT_LIMIT: LimitBucket = { name: 'create', perWindow: 10 }

/**
 * Adding or changing the address of an account (M4b, D49): 10 an hour per IP address, besides 3 an
 * hour per member (`memberVerifyLimit`), the budget of the address the link goes to and the
 * site-wide cap (`emailLimits`).
 */
export const VERIFY_EMAIL_LIMIT: LimitBucket = { name: 'verify', perWindow: 10 }

/** Links to add an address that one member may ask for in an hour. */
export const MEMBER_VERIFY_PER_HOUR = 3

/**
 * The member's own limit on links to add an address: the member's ID (no personal data in itself),
 * kept for 24 hours like every other limit.
 */
export const memberVerifyLimit = (memberId: number): Limit => ({
  key: `member:verify:${memberId}`,
  perWindow: MEMBER_VERIFY_PER_HOUR,
  windowMs: HOUR_MS,
})

export const SUGGESTIONS_PER_WINDOW = SUGGEST_LIMIT.perWindow
export const LIMIT_WINDOW_MS = HOUR_MS

/**
 * D34: hashed IP addresses (and used answers) are deleted after 24 hours. Longer than a spam-check
 * challenge is valid (ALTCHA_TTL_MS), so a used answer is remembered as long as it could be sent.
 */
export const LIMIT_RETENTION_MS = 24 * HOUR_MS

/**
 * The longest window a limit can count: a day. The hourly task deletes rows once they are 23
 * hours old (FORM_LIMIT_MAX_AGE_HOURS), so a day's limit counts at least the last 23 hours.
 */
export const DAY_WINDOW_MS = LIMIT_RETENTION_MS

/** The table of the form-limits collection. */
export const LIMIT_TABLE = 'form_limits'

/**
 * What a form shows when a limit is reached: "too many attempts" by default; "temporarily
 * unavailable" for the site-wide cap on emails, which is not the person's doing.
 */
export type LimitProblem = 'rateLimited' | 'unavailable'

/** One limit: at most `perWindow` rows of `key` within the last `windowMs`. */
export type Limit = { key: string; perWindow: number; windowMs: number; problem?: LimitProblem }

export type Admission = 'accepted' | 'replayed' | LimitProblem

/** What `admit` needs from storage, within one transaction. */
export type LimitTransaction = {
  /** How many rows `key` has since `since`. */
  count(key: string, since: Date): Promise<number>
  /** Adds one row for each key. */
  add(keys: string[], at: Date): Promise<void>
}

export type LimitStore = {
  /**
   * Runs `work` in one transaction that holds a lock on each key, so that two requests with the
   * same address or the same answer are decided one after the other.
   */
  transaction<T>(keys: string[], work: (tx: LimitTransaction) => Promise<T>): Promise<T>
  /** Deletes the rows older than `before`. */
  purge(before: Date): Promise<void>
}

/** The key of an address in a form's bucket ("ip:suggest:…", "ip:report:…"). */
export const ipLimitKey = (bucket: LimitBucket, ipHash: string) => `ip:${bucket.name}:${ipHash}`
/** Used answers share one namespace: an answer sends one form, whichever form it is. */
export const answerLimitKey = (replayKey: string) => `altcha:${replayKey}`

/** A form's limit per hashed IP address: `bucket.perWindow` an hour. */
export const ipLimit = (bucket: LimitBucket, ipHash: string): Limit => ({
  key: ipLimitKey(bucket, ipHash),
  perWindow: bucket.perWindow,
  windowMs: LIMIT_WINDOW_MS,
})

/**
 * The stored form of an email address in the limits: HMAC-SHA256 (hex) of its canonical form
 * (`limitAddress`: lowercased, without a `+tag`, Gmail without dots), so the variants of one
 * mailbox share one budget. The key is derived from PAYLOAD_SECRET under its own label.
 */
export function hashLimitAddress(email: string, secret: string): string {
  return keyedHash(secret, 'gliagora/forms/address-hash/v1', limitAddress(email))
}

/** Emails to one address, from every form that sends one (sign-in, add an address, data request). */
export const EMAILS_PER_ADDRESS = { hour: 3, day: 5 }
/**
 * Emails the forms send in all, a cap that protects the mailbox's reputation and its sending limit;
 * to revisit at M2, when that limit is known (D49).
 */
export const EMAILS_SITE_WIDE = { hour: 50, day: 200 }

/**
 * The limits every form that sends an email shares, besides its own per-IP limit (D49, the M4b
 * design §8): one budget per address, so nobody can fill someone's inbox through several forms or
 * from many IP addresses, and the site-wide cap, which shows "temporarily unavailable".
 */
export function emailLimits(addressHash: string): Limit[] {
  const address = `mail:addr:${addressHash}`
  return [
    { key: address, perWindow: EMAILS_PER_ADDRESS.hour, windowMs: HOUR_MS },
    { key: address, perWindow: EMAILS_PER_ADDRESS.day, windowMs: DAY_WINDOW_MS },
    {
      key: 'mail:all',
      perWindow: EMAILS_SITE_WIDE.hour,
      windowMs: HOUR_MS,
      problem: 'unavailable',
    },
    {
      key: 'mail:all',
      perWindow: EMAILS_SITE_WIDE.day,
      windowMs: DAY_WINDOW_MS,
      problem: 'unavailable',
    },
  ]
}

/**
 * Decides whether a form with a verified spam-check answer is taken: refused if the answer was
 * used before, or if any of its limits is reached (sliding windows, checked in the given order;
 * the first one reached decides what the form shows). Otherwise one row is recorded for each key
 * and for the answer. Only forms that passed every other check are counted, so mistakes in the
 * form or failed spam checks do not use up anyone's limit. A form without a spam check (the
 * "Create account" step) passes no `replayKey`.
 */
export async function admit(
  store: LimitStore,
  { keys, replayKey, now }: { keys: readonly Limit[]; replayKey?: string; now: Date },
): Promise<Admission> {
  for (const limit of keys) {
    // A longer window would count rows that the clean-up may already have deleted.
    if (!(limit.windowMs > 0 && limit.windowMs <= DAY_WINDOW_MS && limit.perWindow >= 1)) {
      throw new Error(`Unusable form limit (${limit.key.split(':')[0]})`)
    }
  }
  const answer = replayKey === undefined ? null : answerLimitKey(replayKey)
  const keyNames = [...new Set(keys.map((limit) => limit.key))]
  const at = now.getTime()
  const decision = await store.transaction(
    answer ? [...keyNames, answer] : keyNames,
    async (tx): Promise<Admission> => {
      if (answer && (await tx.count(answer, new Date(at - LIMIT_RETENTION_MS))) > 0) {
        return 'replayed'
      }
      for (const limit of keys) {
        if ((await tx.count(limit.key, new Date(at - limit.windowMs))) >= limit.perWindow) {
          return limit.problem ?? 'rateLimited'
        }
      }
      await tx.add(answer ? [...keyNames, answer] : keyNames, now)
      return 'accepted'
    },
  )
  // After every decision, not only accepted ones, so rows do not outlive 24 hours while only
  // refused requests arrive. Outside the transaction: a failed clean-up must not refuse anything.
  await store.purge(new Date(at - LIMIT_RETENTION_MS)).catch((error: unknown) => {
    console.error('Clean-up of form limits failed:', error instanceof Error ? error.name : error)
  })
  return decision
}

/**
 * The store in PostgreSQL. Each key is locked with a transaction-level advisory lock (released at
 * commit), taken in sorted order so that two requests never wait for each other in a circle.
 */
export function postgresLimitStore(payload: Payload): LimitStore {
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const table = sql.identifier(LIMIT_TABLE)
  return {
    transaction: (keys, work) =>
      db.transaction(async (tx) => {
        for (const key of [...new Set(keys)].sort()) {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
        }
        return work({
          async count(key, since) {
            const { rows } = await tx.execute<{ n: number }>(
              sql`SELECT count(*)::int AS n FROM ${table} WHERE key = ${key} AND created_at > ${since.toISOString()}`,
            )
            return Number(rows[0]?.n ?? 0)
          },
          async add(keys, at) {
            const time = at.toISOString()
            await tx.execute(
              sql`INSERT INTO ${table} (key, created_at, updated_at) VALUES ${sql.join(
                keys.map((key) => sql`(${key}, ${time}, ${time})`),
                sql`, `,
              )}`,
            )
          },
        })
      }),
    async purge(before) {
      await db.execute(sql`DELETE FROM ${table} WHERE created_at < ${before.toISOString()}`)
    },
  }
}
