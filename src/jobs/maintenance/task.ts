import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Field, Payload, PayloadRequest, RequestContext, TaskConfig, Where } from 'payload'
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload'

import { errorFrames, errorSummary } from '@/lib/errors'

// The frame shared by the scheduled maintenance tasks (M4.7): the listing expiry, the retention
// purges and the automatic emails. Each task is idempotent and works in bounded batches, so a run
// that stops half-way is simply continued by the next one; one run of a task at a time (a lock in
// PostgreSQL, also against `pnpm jobs:run` on another machine); logs and stored job errors hold
// counts, IDs and error classes, never personal data.

/** The queue the maintenance tasks are scheduled in (payload.config.ts runs it every minute). */
export const MAINTENANCE_QUEUE = 'maintenance'

/**
 * The queue `pnpm jobs:run` uses: the app's scheduler never runs it, so a manual run and a
 * scheduled one never pick up each other's jobs (the task lock keeps them apart anyway).
 */
export const MANUAL_QUEUE = 'manual'

/** A task's result: counts of what it did, stored in the job log. */
export type TaskCounts = Record<string, number>

/** What a maintenance task stores as its output: its counts, and whether it was skipped. */
export type TaskOutput = Record<string, number | boolean>

/** The result when another run of the same task holds the lock. */
export const SKIPPED = Symbol('skipped')

/**
 * Runs `work` only if no other run of the task `name` is under way, anywhere: a session-level
 * advisory lock in PostgreSQL, held on a connection of its own until `work` ends (and released by
 * PostgreSQL if that connection is lost).
 */
export async function withTaskLock<T>(
  payload: Payload,
  name: string,
  work: () => Promise<T>,
): Promise<T | typeof SKIPPED> {
  const client = await (payload.db as unknown as PostgresAdapter).pool.connect()
  const key = `gliagora:task:${name}`
  // A connection that failed, or whose unlock failed, is closed rather than reused; PostgreSQL has
  // then already freed the lock. While checked out, the client has no listener of the pool, so an
  // 'error' event on it (a server restart, a terminated session) would otherwise end the process.
  let broken = false
  const onError = () => {
    broken = true
    payload.logger.warn(`${name}: the connection holding the task lock was lost`)
  }
  client.on('error', onError)
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
      [key],
    )
    if (!rows[0]?.locked) return SKIPPED
    try {
      return await work()
    } finally {
      await client
        .query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key])
        .catch(() => (broken = true))
    }
  } finally {
    client.off('error', onError)
    client.release(broken)
  }
}

/** Runs raw SQL in the transaction of a request. */
export type SqlRunner = Pick<PostgresAdapter['drizzle'], 'execute'>

/**
 * Raw SQL in the transaction of a request, which can also open a nested transaction (a savepoint):
 * what the member store's functions take (src/lib/members/store.ts, `MemberDb`).
 */
export type TransactionDb = Pick<PostgresAdapter['drizzle'], 'execute' | 'transaction'>

/**
 * Runs `work` in one database transaction, shared by the local API (through `req`) and raw SQL
 * (through `db`, Drizzle's transaction object): committed if `work` returns, rolled back if it
 * throws.
 */
export async function inTransaction<T>(
  payload: Payload,
  work: (req: PayloadRequest, db: TransactionDb) => Promise<T>,
  context: RequestContext = {},
): Promise<T> {
  const req = await createLocalReq({ context }, payload)
  await initTransaction(req)
  const adapter = payload.db as unknown as PostgresAdapter
  const id = await req.transactionID
  const db = (id !== undefined && adapter.sessions[String(id)]?.db) || adapter.drizzle
  try {
    const result = await work(req, db as TransactionDb)
    await commitTransaction(req)
    return result
  } catch (error) {
    await killTransaction(req)
    throw error
  }
}

/**
 * Payload keeps a job marked as processing if its last update fails, for example when PostgreSQL
 * restarts while the app keeps running; every later tick would then skip the task (only a restart
 * of the app released it, src/jobs/release.ts). Called at each maintenance tick before the task is
 * scheduled: the previous tick has finished (Payload's scheduler does not start a tick while the
 * last one runs), only this app runs the maintenance queue, and a run holds the task's lock, so a
 * job still marked as processing while the lock is free was cut off. It is removed; the next run
 * does the work again.
 */
export async function releaseCutOffJobs(payload: Payload, slug: string): Promise<number> {
  const where: Where = {
    and: [
      { queue: { equals: MAINTENANCE_QUEUE } },
      { taskSlug: { equals: slug } },
      { processing: { equals: true } },
    ],
  }
  const { totalDocs } = await payload.count({ collection: 'payload-jobs', where })
  if (totalDocs === 0) return 0
  const released = await withTaskLock(payload, slug, async () => {
    const { docs } = await payload.delete({ collection: 'payload-jobs', where, depth: 0 })
    return docs.length
  })
  if (released === SKIPPED || released === 0) return 0
  payload.logger.warn(
    `${slug}: released ${released} job${released === 1 ? '' : 's'} that a database interruption cut off`,
  )
  return released
}

/** Numbers stored as a task's output, and whether the run was skipped. */
const countFields = (names: readonly string[]): Field[] => [
  ...names.map((name): Field => ({ name, type: 'number' })),
  { name: 'skipped', type: 'checkbox' },
]

/**
 * A scheduled maintenance task. `run` gets "now" once, so every rule in one run uses the same
 * moment, and returns its counts. A failure is logged and stored with the error's class and code
 * only; the next scheduled run tries again.
 */
export function maintenanceTask<Name extends string>({
  slug,
  label,
  cron,
  counts,
  run,
}: {
  slug: string
  label: string
  /** When it runs, in UTC (croner syntax; minute hour day month weekday). */
  cron: string
  /** The names of the counts `run` returns. */
  counts: readonly Name[]
  run: (payload: Payload, now: Date) => Promise<Record<Name, number>>
}): TaskConfig<{ input: object; output: TaskOutput }> {
  return {
    slug,
    label,
    schedule: [
      {
        cron,
        queue: MAINTENANCE_QUEUE,
        hooks: {
          beforeSchedule: async (args) => {
            await releaseCutOffJobs(args.req.payload, slug)
            return args.defaultBeforeSchedule(args)
          },
        },
      },
    ],
    // The next scheduled run is the retry.
    retries: 0,
    outputSchema: countFields(counts),
    handler: async ({ req }) => {
      const { payload } = req
      let result: Record<Name, number> | typeof SKIPPED
      try {
        result = await withTaskLock(payload, slug, () => run(payload, new Date()))
      } catch (error) {
        payload.logger.error(`${slug} failed: ${errorSummary(error)}\n${errorFrames(error)}`)
        throw new Error(`${slug} failed: ${errorSummary(error)}`)
      }
      if (result === SKIPPED) {
        payload.logger.info(`${slug}: skipped, another run is under way`)
        return { output: { skipped: true } }
      }
      return { output: { ...result, skipped: false } }
    },
  }
}

/** One log line with the counts, only when the run did something. */
export function logCounts(payload: Payload, slug: string, counts: TaskCounts): void {
  const done = Object.entries(counts).filter(([, n]) => n > 0)
  if (done.length === 0) return
  payload.logger.info(`${slug}: ${done.map(([name, n]) => `${n} ${name}`).join(', ')}`)
}
