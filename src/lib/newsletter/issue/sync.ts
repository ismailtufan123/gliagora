import type { Payload } from 'payload'

import { errorSummary } from '@/lib/errors'

import type { CampaignsClient } from '../campaigns'
import { ListmonkError } from '../listmonk'
import { type IssueStatus, statusFromListmonk } from './status'

// The site's check of the issues' campaigns in listmonk (M11, D53), every 10 minutes
// (`syncGliaNotesIssues`): each issue whose campaign is in listmonk and not yet sent or cancelled
// takes listmonk's status, and its `sentAt` once listmonk has sent it, as listmonk reports it (when
// it started sending). A campaign listmonk does not show (deleted in its admin, which nobody
// should do) is left as it is and counted as failed: listmonk answers the issues' user the same
// for a campaign that is gone and for one it may not see. The run stops when listmonk cannot be
// reached. Logs counts, issue IDs and error classes only.

/** The issues whose campaigns may still change. */
const OPEN: IssueStatus[] = ['pushed', 'scheduled', 'sending', 'paused']

export async function syncIssueCampaigns(
  payload: Payload,
  campaigns: CampaignsClient,
  now: Date,
): Promise<{ checked: number; changed: number; failed: number }> {
  const counts = { checked: 0, changed: 0, failed: 0 }
  const { docs } = await payload.find({
    collection: 'newsletter-issues',
    where: { and: [{ status: { in: OPEN } }, { listmonkCampaignId: { exists: true } }] },
    select: { status: true, listmonkCampaignId: true, sentAt: true },
    sort: 'sendAt',
    limit: 50,
    depth: 0,
    pagination: false,
  })
  for (const issue of docs) {
    counts.checked++
    try {
      const campaign = await campaigns.get(Number(issue.listmonkCampaignId))
      const status = campaign && campaign !== 'hidden' ? statusFromListmonk(campaign.status) : null
      if (!campaign || campaign === 'hidden' || !status) {
        counts.failed++
        payload.logger.warn(
          `syncGliaNotesIssues: issue ${issue.id}: listmonk shows no campaign for it`,
        )
        continue
      }
      const sentAt =
        status === 'sent' && !issue.sentAt ? (campaign.startedAt ?? now).toISOString() : undefined
      if (status === issue.status && !sentAt) continue
      await payload.update({
        collection: 'newsletter-issues',
        id: issue.id,
        data: { status, ...(sentAt ? { sentAt } : {}) },
        overrideAccess: true,
        depth: 0,
      })
      counts.changed++
    } catch (error) {
      counts.failed++
      if (
        error instanceof ListmonkError &&
        (error.kind === 'unreachable' || error.kind === 'timeout')
      ) {
        payload.logger.warn(`syncGliaNotesIssues: listmonk could not be reached (${error.code})`)
        break
      }
      payload.logger.warn(`syncGliaNotesIssues: issue ${issue.id} (${errorSummary(error)})`)
    }
  }
  return counts
}
