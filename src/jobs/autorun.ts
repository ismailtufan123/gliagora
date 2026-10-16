import type { JobsConfig } from 'payload'

import { MAINTENANCE_QUEUE, MONITOR_QUEUE } from './maintenance/task'

type AutorunCron = Exclude<
  NonNullable<JobsConfig['autoRun']>,
  (...args: never[]) => unknown
>[number]

/**
 * The scheduler's ticks (payload.config.ts `jobs.autoRun`). Each tick queues the tasks of its queue
 * that are due and runs them: the nightly ROR import in its own queue, and every minute the
 * maintenance tasks (src/jobs/maintenance/: the hourly expiry, the retention purges and the
 * automatic emails), which log their own counts. Scheduled jobs run only where
 * PAYLOAD_JOBS_AUTORUN is "true": on the production server (deploy/compose.prod.yml), never in CI
 * or local development (there: `pnpm jobs:run`).
 *
 * The ROR tick runs at second 30, the maintenance tick at second 0 and the monitors' tick (M7: the
 * daily monitors and the weekly link check, which read other sites for up to two hours) at second
 * 15 (croner reads a sixth, leading field as the second). Each tick writes the whole `payload-jobs-stats` global from what it read
 * at its start, so two ticks at the same moment would undo each other's record of the last
 * scheduled run, and a lost record makes Payload queue the task again at once.
 */
export function autoRunCrons(env: Record<string, string | undefined> = process.env): AutorunCron[] {
  if (env.PAYLOAD_JOBS_AUTORUN !== 'true') return []
  return [
    { cron: '30 */10 * * * *', queue: 'ror' },
    { cron: '* * * * *', queue: MAINTENANCE_QUEUE, silent: { info: true } },
    { cron: '15 * * * * *', queue: MONITOR_QUEUE, limit: 1, silent: { info: true } },
  ]
}
