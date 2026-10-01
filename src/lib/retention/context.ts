import type { RequestContext } from 'payload'

/**
 * Lets the retention task (src/jobs/maintenance/purgeRetention.ts) delete a job that has been
 * offline for 12 months (D34), which the jobs collection otherwise refuses for every published
 * job. The value is a symbol, which no request can supply; the collection still checks that the
 * job is due and that its address is kept in `retired-listings`.
 *
 * It also marks the retention task's deletions of suggestions and reports, so the `logDeletions()`
 * hooks (src/collections/DeletionLog.ts) do not write them to the deletion log: they repeat
 * themselves after a restore.
 */
export const RETENTION = Symbol.for('gliagora.retention')

export const isRetention = (context: RequestContext | undefined) => context?.retention === RETENTION

/**
 * Marks the deletions of `applyDeletionLog` (src/jobs/maintenance/applyDeletionLog.ts), which
 * repeat a deletion already in the deletion log after a restore: the `logDeletions()` hooks do not
 * log them a second time.
 */
export const REAPPLY = Symbol.for('gliagora.reapply')

export const isReapply = (context: RequestContext | undefined) => context?.reapply === REAPPLY
