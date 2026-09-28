import type { LimitStore } from './rate-limit'

// For tests only: the rate-limit table (src/lib/forms/rate-limit.ts) in memory.

/**
 * The rate-limit table in memory. Transactions run one after the other, as the advisory locks
 * make them do in PostgreSQL for the same keys.
 */
export function memoryLimitStore() {
  const rows: { key: string; at: number }[] = []
  let queue: Promise<unknown> = Promise.resolve()
  const store: LimitStore & { rows: typeof rows } = {
    rows,
    transaction(_keys, work) {
      const run = queue.then(() =>
        work({
          count: async (key, since) =>
            rows.filter((row) => row.key === key && row.at > since.getTime()).length,
          add: async (keys, at) => {
            for (const key of keys) rows.push({ key, at: at.getTime() })
          },
        }),
      )
      queue = run.catch(() => undefined)
      return run
    },
    async purge(before) {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i]!.at < before.getTime()) rows.splice(i, 1)
      }
    },
  }
  return store
}
