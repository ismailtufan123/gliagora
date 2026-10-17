import { AcknowledgeReportsTask } from './acknowledgeReports'
import { ApplyDeletionLogTask } from './applyDeletionLog'
import { CheckLinksTask } from './checkLinks'
import { CleanInactiveMembersTask } from './cleanInactiveMembers'
import { DraftWithClaudeTask } from './draftWithClaude'
import { ExpireListingsTask } from './expireListings'
import { MonitorSourcesTask } from './monitorSources'
import { NotifySubmittersTask } from './notifySubmitters'
import { PurgeFormLimitsTask } from './purgeFormLimits'
import { PurgeMemberAuthTask } from './purgeMemberAuth'
import { PurgeRetentionTask } from './purgeRetention'
import { SendRequestEmailsTask } from './sendRequestEmails'
import { CheckGliaNotesMembersTask, SyncGliaNotesTask } from './syncGliaNotes'
import { SyncGliaNotesIssuesTask } from './syncGliaNotesIssues'
import { SyncJobPlacesTask } from './syncJobPlaces'

export { MAINTENANCE_QUEUE, MANUAL_QUEUE, MONITOR_QUEUE } from './task'

/**
 * The scheduled maintenance tasks (M4.7; the member tasks M4b; members' Glia Notes M2; the
 * issues' campaigns M11), in the
 * order `pnpm jobs:run` runs them. Their times are in UTC; they run only where
 * PAYLOAD_JOBS_AUTORUN is "true" (payload.config.ts).
 */
export const MAINTENANCE_TASKS = [
  ExpireListingsTask, // hourly at :05
  PurgeFormLimitsTask, // hourly at :05
  SyncJobPlacesTask, // 04:45
  PurgeRetentionTask, // 04:15
  NotifySubmittersTask, // every 15 minutes
  AcknowledgeReportsTask, // every 5 minutes
  ApplyDeletionLogTask, // every 10 minutes
  PurgeMemberAuthTask, // hourly at :10
  CleanInactiveMembersTask, // 05:30
  SendRequestEmailsTask, // every 5 minutes
  SyncGliaNotesTask, // every 5 minutes, at :02, :07, …
  CheckGliaNotesMembersTask, // 06:00
  SyncGliaNotesIssuesTask, // every 10 minutes, at :04, :14, … (M11)
]

/**
 * The tasks that read other sites (M7, D52), in the monitors' queue of their own. `pnpm jobs:run`
 * runs them only when named, so a run of every task on a developer's computer reads no site.
 */
export const MONITOR_TASKS = [
  MonitorSourcesTask, // 04:40
  CheckLinksTask, // Sundays 05:30
  DraftWithClaudeTask, // 07:30, only with ANTHROPIC_API_KEY and AI_MONTHLY_CAP_USD
]
