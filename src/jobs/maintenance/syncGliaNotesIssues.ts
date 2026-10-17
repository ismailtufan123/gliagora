import type { Payload } from 'payload'

import { campaignsFromEnv } from '@/lib/newsletter/campaigns'
import { syncIssueCampaigns } from '@/lib/newsletter/issue/sync'

import { logCounts, maintenanceTask } from './task'

// The issues of Glia Notes in listmonk (M11, D53; src/lib/newsletter/issue/sync.ts): every 10
// minutes (at :04, :14, …), each issue whose campaign listmonk has not yet sent takes listmonk's
// status, and `sentAt` once it has sent it. Only while the issues' listmonk user is set up
// (LISTMONK_URL and LISTMONK_CAMPAIGNS_TOKEN); without it, nothing.

export async function syncGliaNotesIssues(payload: Payload, now: Date) {
  const campaigns = campaignsFromEnv()
  const counts = campaigns
    ? await syncIssueCampaigns(payload, campaigns, now)
    : { checked: 0, changed: 0, failed: 0 }
  logCounts(payload, 'syncGliaNotesIssues', counts)
  return counts
}

export const SyncGliaNotesIssuesTask = maintenanceTask({
  slug: 'syncGliaNotesIssues',
  label: 'Read the Glia Notes issues’ campaigns in listmonk',
  cron: '4-54/10 * * * *',
  counts: ['checked', 'changed', 'failed'],
  run: syncGliaNotesIssues,
})
