import type { Payload } from 'payload'

import { SKIPPED, withTaskLock } from '@/jobs/maintenance/task'
import { errorSummary } from '@/lib/errors'
import type { NewsletterIssue } from '@/payload-types'

import { type Campaign, type CampaignsClient, campaignsClient } from '../campaigns'
import { campaignsSettings } from '../config'
import { ListmonkError } from '../listmonk'
import { buildIssueContent } from './build'
import type { IssueContent } from './content'
import { IssueTooLargeError, campaignBody, fitWithinCap } from './render'
import { pushSettings, rateText } from './settings'
import { type IssueStatus, statusFromListmonk } from './status'

// Pushing an issue of Glia Notes to listmonk as a campaign of the list Glia Notes (M11, D53; PLAN
// §3.2, §13), on an editor's action only: as a draft (nothing is sent; pushed again, it replaces
// the draft's content, and it takes a scheduled campaign back to a draft), or scheduled for the
// issue's date. Off until GLIA_NOTES_PUSH is on (D53, at the launch), with the issues' own
// listmonk user and the mailbox's limits set; taking a scheduled issue back to a draft works
// whenever the issues' user is set up, also while pushing is off (an emergency stop). The content
// is built from the published jobs at the moment of the push, fitted under 100 KB, and kept as the
// issue's snapshot: what listmonk sends and the archive shows. A campaign that listmonk is
// sending, has paused or has sent is never changed. One push at a time (a PostgreSQL lock), with
// the issue read again under it, so two editors (or two tabs) never make two campaigns. Answers
// are messages for the editor, without addresses; failures are logged with their class only.

export type PushMode = 'draft' | 'schedule'

export type PushResult = { ok: boolean; message: string; status?: IssueStatus }

/** An issue must be scheduled at least this far ahead (listmonk refuses a date in the past). */
const SCHEDULE_AHEAD_MS = 5 * 60_000

const utc = (date: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date) + ' UTC'

const SENT = 'listmonk is sending this issue or has sent it: it cannot change.'
const HIDDEN =
  "listmonk does not show this issue's campaign (deleted in listmonk's admin?). Nothing was changed; the technical administrator can check it (deploy/README.md, section 18)."

type Env = Record<string, string | undefined>

type Options = {
  origin: string
  now: Date
  env?: Env
  /** The campaigns client to use (tests pass their own). */
  campaigns?: CampaignsClient
}

/** Records the campaign, its status and, when given, the content pushed. */
async function record(
  payload: Payload,
  issueId: number,
  campaignId: number,
  status: IssueStatus,
  extra: { pushedAt?: string; snapshot?: IssueContent } = {},
) {
  await payload.update({
    collection: 'newsletter-issues',
    id: issueId,
    data: { listmonkCampaignId: campaignId, status, ...extra },
    overrideAccess: true,
    depth: 0,
  })
}

export async function pushIssue(
  payload: Payload,
  issue: NewsletterIssue,
  mode: PushMode,
  options: Options,
): Promise<PushResult> {
  const result = await withTaskLock(payload, 'glia-notes-push', async () => {
    // Read again under the lock: another push may have made the campaign meanwhile.
    const current = await payload.findByID({
      collection: 'newsletter-issues',
      id: issue.id,
      depth: 0,
      disableErrors: true,
    })
    if (!current) return { ok: false, message: 'No such issue.' }
    return pushLocked(payload, current, mode, options)
  })
  return result === SKIPPED
    ? { ok: false, message: 'Another push is under way. Try again in a moment.' }
    : result
}

async function pushLocked(
  payload: Payload,
  issue: NewsletterIssue,
  mode: PushMode,
  { origin, now, env = process.env, campaigns }: Options,
): Promise<PushResult> {
  const settings = pushSettings(env)
  if (!settings.on) {
    // Taking a scheduled issue back to a draft stops it; that works while pushing is off.
    const listmonk = campaignsSettings(env)
    if (mode === 'draft' && issue.status === 'scheduled' && issue.listmonkCampaignId && listmonk) {
      return unschedule(payload, issue, campaigns ?? campaignsClient(listmonk))
    }
    return { ok: false, message: settings.reason }
  }
  if (mode === 'schedule' && !settings.canSchedule) {
    return {
      ok: false,
      message: 'No mail server is set up yet (SMTP_HOST), so the issue cannot be scheduled.',
    }
  }
  if (issue.status === 'sending' || issue.status === 'paused' || issue.status === 'sent') {
    return { ok: false, message: SENT }
  }
  const sendAt = new Date(issue.sendAt)
  if (mode === 'schedule' && sendAt.getTime() < now.getTime() + SCHEDULE_AHEAD_MS) {
    return {
      ok: false,
      message: "Set the issue's date at least 5 minutes ahead, save, then schedule it.",
    }
  }
  const client = campaigns ?? campaignsClient(settings.listmonk)
  let campaignId: number | null = null
  try {
    const built = await buildIssueContent(payload, issue, now)
    const { content, trimmed } = await fitWithinCap(built.content, origin)
    const body = await campaignBody(content, origin)
    const input = {
      name: `Glia Notes ${content.month}`,
      subject: body.subject,
      html: body.html,
      text: body.text,
      headers: body.headers,
      // listmonk refuses a date in the past even on a draft.
      sendAt: sendAt.getTime() > now.getTime() + 60_000 ? sendAt : null,
    }

    let campaign: Campaign | null = null
    if (issue.listmonkCampaignId) {
      const found = await client.get(issue.listmonkCampaignId)
      if (found === 'hidden' || !found) return { ok: false, message: HIDDEN }
      campaign = found
    }
    if (campaign && ['running', 'paused', 'finished'].includes(campaign.status)) {
      await record(payload, issue.id, campaign.id, statusFromListmonk(campaign.status)!)
      return { ok: false, message: SENT }
    }
    // A cancelled campaign stays as it is; the issue gets a new one.
    if (campaign?.status === 'cancelled') campaign = null
    if (campaign) campaignId = campaign.id
    // A scheduled campaign goes back to a draft first: if anything below fails, nothing is due.
    if (campaign?.status === 'scheduled') {
      campaign = await client.setStatus(campaign.id, 'draft')
      await record(payload, issue.id, campaign.id, 'pushed')
    }
    campaign = campaign ? await client.update(campaign.id, input) : await client.create(input)
    campaignId = campaign.id

    // Recorded at once, so a failure below never loses the campaign.
    const pushed = { pushedAt: now.toISOString(), snapshot: content }
    await record(payload, issue.id, campaign.id, 'pushed', pushed)
    let status: IssueStatus = 'pushed'
    if (mode === 'schedule') {
      campaign = await client.setStatus(campaign.id, 'scheduled')
      status = statusFromListmonk(campaign.status) ?? 'scheduled'
      await record(payload, issue.id, campaign.id, status)
    }

    const notes = [
      built.leftOut > 0
        ? `${built.leftOut} selected position${built.leftOut === 1 ? ' was' : 's were'} no longer open on the issue's date and left out.`
        : null,
      trimmed > 0
        ? `${trimmed} deadline${trimmed === 1 ? '' : 's'} moved into the link to the jobs list, to stay under 100 KB.`
        : null,
    ].filter(Boolean)
    const message =
      mode === 'schedule'
        ? `Scheduled in listmonk for ${utc(sendAt)} (campaign ${campaign.id}): it goes to every subscriber of Glia Notes then, at most ${rateText(settings.rate)}.`
        : `Pushed to listmonk as a draft (campaign ${campaign.id}). Nothing is sent until you schedule it.`
    return { ok: true, message: [message, ...notes].join(' '), status }
  } catch (error) {
    if (error instanceof IssueTooLargeError) {
      return {
        ok: false,
        message:
          'This issue is larger than 100 KB even without its deadlines: shorten the summaries of its selected positions, or remove some.',
      }
    }
    payload.logger.error(`Glia Notes push failed (${errorSummary(error)})`)
    return { ok: false, message: await afterFailure(payload, issue.id, client, campaignId, error) }
  }
}

/** Takes a scheduled issue's campaign back to a draft, changing nothing else. */
async function unschedule(
  payload: Payload,
  issue: NewsletterIssue,
  client: CampaignsClient,
): Promise<PushResult> {
  const id = Number(issue.listmonkCampaignId)
  try {
    const found = await client.get(id)
    if (found === 'hidden' || !found) return { ok: false, message: HIDDEN }
    if (found.status !== 'scheduled') {
      const status = statusFromListmonk(found.status)
      if (status) await record(payload, issue.id, id, status)
      return {
        ok: found.status === 'draft',
        message: `listmonk has this campaign as ${found.status}.`,
      }
    }
    await client.setStatus(id, 'draft')
    await record(payload, issue.id, id, 'pushed')
    return {
      ok: true,
      message:
        'Unscheduled: the issue is a draft in listmonk again and nothing is sent. (Pushing is switched off, so its content was not changed.)',
      status: 'pushed',
    }
  } catch (error) {
    payload.logger.error(`Glia Notes unschedule failed (${errorSummary(error)})`)
    return { ok: false, message: await afterFailure(payload, issue.id, client, id, error) }
  }
}

/**
 * After a failed call: listmonk's own state of the campaign, recorded on the issue, and a message
 * that says it (a call can fail after listmonk acted on it: a timeout, for one).
 */
async function afterFailure(
  payload: Payload,
  issueId: number,
  client: CampaignsClient,
  campaignId: number | null,
  error: unknown,
): Promise<string> {
  const reach =
    error instanceof ListmonkError && (error.kind === 'unreachable' || error.kind === 'timeout')
  const cause = reach ? 'listmonk could not be reached.' : 'listmonk refused the push.'
  if (campaignId === null) return `${cause} Nothing was made or scheduled; try again in a moment.`
  try {
    const found = await client.get(campaignId)
    const status = found && found !== 'hidden' ? statusFromListmonk(found.status) : null
    if (!status) return `${cause} Its state in listmonk is unknown: check it before trying again.`
    await record(payload, issueId, campaignId, status)
    return status === 'scheduled'
      ? `${cause} The issue is still scheduled in listmonk.`
      : `${cause} The issue is not scheduled in listmonk (${status}).`
  } catch {
    return `${cause} Its state in listmonk is unknown: check it before trying again.`
  }
}
