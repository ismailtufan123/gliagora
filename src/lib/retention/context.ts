import type { RequestContext } from 'payload'

/**
 * Lets the retention task (src/jobs/maintenance/purgeRetention.ts) delete a job that has been
 * offline for 12 months (D34), which the jobs collection otherwise refuses for every published
 * job. The value is a symbol, which no request can supply; the collection still checks that the
 * job is due and that its address is kept in `retired-listings`.
 */
export const RETENTION = Symbol.for('gliagora.retention')

export const isRetention = (context: RequestContext | undefined) => context?.retention === RETENTION
