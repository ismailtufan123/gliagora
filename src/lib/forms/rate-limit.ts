import { sql } from '@payloadcms/db-postgres'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

// Limits on the "Suggest a listing" form (PLAN §3.2, D34), kept in the form-limits table
// (src/collections/FormLimits.ts): one row for each suggestion accepted from a hashed IP address,
// and one for each spam-check answer used, so that an answer sends only one suggestion. Rows are
// deleted within 24 hours: here, whenever a suggestion reaches the limit (whatever the decision),
// and by the hourly task (M4.7). They never go into backups (deploy/backup/backup.sh).

/** At most this many suggestions per hashed IP address within LIMIT_WINDOW_MS (PLAN §3.2). */
export const SUGGESTIONS_PER_WINDOW = 5
export const LIMIT_WINDOW_MS = 60 * 60_000

/**
 * D34: hashed IP addresses (and used answers) are deleted after 24 hours. Longer than a spam-check
 * challenge is valid (ALTCHA_TTL_MS), so a used answer is remembered as long as it could be sent.
 */
export const LIMIT_RETENTION_MS = 24 * 60 * 60_000

/** The table of the form-limits collection. */
export const LIMIT_TABLE = 'form_limits'

export type Admission = 'accepted' | 'rate-limited' | 'replayed'

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

export const ipLimitKey = (ipHash: string) => `ip:${ipHash}`
export const answerLimitKey = (replayKey: string) => `altcha:${replayKey}`

/**
 * Decides whether a suggestion with a verified spam-check answer is taken: refused if the answer
 * was used before, or if its address has sent SUGGESTIONS_PER_WINDOW suggestions in the last hour
 * (a sliding window). Otherwise both are recorded. Only suggestions that passed every other check
 * are counted, so mistakes in the form or failed spam checks do not use up anyone's limit.
 */
export async function admit(
  store: LimitStore,
  { ipHash, replayKey, now }: { ipHash: string; replayKey: string; now: Date },
): Promise<Admission> {
  const ip = ipLimitKey(ipHash)
  const answer = answerLimitKey(replayKey)
  const at = now.getTime()
  const decision = await store.transaction([ip, answer], async (tx) => {
    if ((await tx.count(answer, new Date(at - LIMIT_RETENTION_MS))) > 0) return 'replayed'
    if ((await tx.count(ip, new Date(at - LIMIT_WINDOW_MS))) >= SUGGESTIONS_PER_WINDOW) {
      return 'rate-limited'
    }
    await tx.add([ip, answer], now)
    return 'accepted'
  })
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
