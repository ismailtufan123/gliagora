import { AcknowledgeReportsTask } from './acknowledgeReports'
import { ExpireListingsTask } from './expireListings'
import { NotifySubmittersTask } from './notifySubmitters'
import { PurgeFormLimitsTask } from './purgeFormLimits'
import { PurgeRetentionTask } from './purgeRetention'
import { SyncJobPlacesTask } from './syncJobPlaces'

export { MAINTENANCE_QUEUE, MANUAL_QUEUE } from './task'

/**
 * The scheduled maintenance tasks (M4.7), in the order `pnpm jobs:run` runs them. Their times are
 * in UTC; they run only where PAYLOAD_JOBS_AUTORUN is "true" (payload.config.ts).
 */
export const MAINTENANCE_TASKS = [
  ExpireListingsTask, // hourly at :05
  PurgeFormLimitsTask, // hourly at :05
  SyncJobPlacesTask, // 04:45
  PurgeRetentionTask, // 04:15
  NotifySubmittersTask, // every 15 minutes
  AcknowledgeReportsTask, // every 5 minutes
]
