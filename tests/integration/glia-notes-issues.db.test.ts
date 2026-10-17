import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FAKE_DATA } from '@/collections/Jobs'
import type { Campaign, CampaignInput, CampaignsClient } from '@/lib/newsletter/campaigns'
import { readSnapshot } from '@/lib/newsletter/issue/content'
import { pushIssue } from '@/lib/newsletter/issue/push'
import { syncIssueCampaigns } from '@/lib/newsletter/issue/sync'
import type { NewsletterIssue } from '@/payload-types'

import { institution, job, testPayload } from './helpers'

// The issues of Glia Notes on the app's side (M11, D53): the builder's proposal and content from
// published jobs, the push (switched off until GLIA_NOTES_PUSH is on, as a draft or scheduled,
// the snapshot kept, a scheduled campaign set back to a draft before its content changes) and the
// site's check of the campaigns. listmonk is a stand-in here (tests/integration/campaigns.db.test.ts
// runs the real one). Fake data only.

const ON = {
  GLIA_NOTES_PUSH: 'on',
  LISTMONK_URL: 'http://listmonk.invalid:9000',
  LISTMONK_CAMPAIGNS_TOKEN: 'c'.repeat(64),
  LISTMONK_API_TOKEN: 'a'.repeat(64),
  MAILBOX_LIMIT_HOUR: '500',
  SMTP_HOST: '127.0.0.1',
}
const ORIGIN = 'https://gliagora.com'

/** A listmonk that keeps campaigns in memory, and what was asked of it. */
function fakeListmonk() {
  const campaigns = new Map<number, Campaign & { input: CampaignInput }>()
  const calls: string[] = []
  let next = 1
  const client: CampaignsClient = {
    async get(id) {
      calls.push(`get ${id}`)
      return campaigns.get(id) ?? null
    },
    async create(input) {
      calls.push('create')
      const made = {
        id: next++,
        status: 'draft' as const,
        startedAt: null,
        sendAt: input.sendAt,
        input,
      }
      campaigns.set(made.id, made)
      return made
    },
    async update(id, input) {
      calls.push(`update ${id}`)
      const found = campaigns.get(id)!
      expect(['draft', 'scheduled', 'paused']).toContain(found.status)
      const updated = { ...found, input, sendAt: input.sendAt }
      campaigns.set(id, updated)
      return updated
    },
    async setStatus(id, status) {
      calls.push(`${status} ${id}`)
      const updated = { ...campaigns.get(id)!, status }
      campaigns.set(id, updated)
      return updated
    },
  }
  return { client, campaigns, calls }
}

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

afterAll(async () => {
  await payload?.destroy()
})

describe('Glia Notes issues (M11)', () => {
  let issue: NewsletterIssue
  const listmonk = fakeListmonk()
  const now = new Date()
  const read = async () =>
    payload.findByID({ collection: 'newsletter-issues', id: issue.id, depth: 0 })

  it('proposes open positions on a new issue, and builds its deadlines', async () => {
    const at = await institution(payload)
    const jobs = await Promise.all([job(payload, at.id), job(payload, at.id)])
    issue = await payload.create({
      collection: 'newsletter-issues',
      data: {
        sendAt: new Date(now.getTime() + 2 * 86_400_000).toISOString(),
        subject: 'Fake issue for the push',
        intro: 'An opening note.',
        status: 'draft',
      },
      depth: 0,
    })
    expect(issue.month).toBe(new Date(issue.sendAt).toISOString().slice(0, 7))
    expect(issue.selected).toEqual(expect.arrayContaining(jobs.map((j) => j.id)))
    expect(issue.status).toBe('draft')
  })

  it('pushes nothing while GLIA_NOTES_PUSH is off (D53)', async () => {
    const result = await pushIssue(payload, issue, 'draft', {
      origin: ORIGIN,
      now,
      env: { ...ON, GLIA_NOTES_PUSH: '' },
      campaigns: listmonk.client,
    })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('switched off until the launch')
    expect(listmonk.calls).toEqual([])
    // Nor without the mailbox's limit, nor scheduled without a mail server.
    expect(
      (
        await pushIssue(payload, issue, 'draft', {
          origin: ORIGIN,
          now,
          env: { ...ON, MAILBOX_LIMIT_HOUR: '' },
          campaigns: listmonk.client,
        })
      ).message,
    ).toContain("mailbox's sending limit")
    expect(
      (
        await pushIssue(payload, issue, 'schedule', {
          origin: ORIGIN,
          now,
          env: { ...ON, SMTP_HOST: '' },
          campaigns: listmonk.client,
        })
      ).ok,
    ).toBe(false)
    expect(listmonk.calls).toEqual([])
  })

  it('pushes it as a draft, keeping what it sent as the snapshot', async () => {
    const result = await pushIssue(payload, issue, 'draft', {
      origin: ORIGIN,
      now,
      env: ON,
      campaigns: listmonk.client,
    })
    expect(result).toMatchObject({ ok: true, status: 'pushed' })
    issue = await read()
    expect(issue.status).toBe('pushed')
    expect(issue.listmonkCampaignId).toBe(1)
    const snapshot = readSnapshot(issue.snapshot)
    expect(snapshot?.subject).toBe('Fake issue for the push')
    expect(snapshot?.selected.length).toBeGreaterThanOrEqual(2)
    // Both fake positions close in 30 days: within the 45 days of the issue.
    expect(snapshot?.deadlines.jobs.length).toBeGreaterThanOrEqual(2)
    const sent = listmonk.campaigns.get(1)!.input
    expect(sent.name).toBe(`Glia Notes ${issue.month}`)
    expect(sent.html).toContain('{{ .Subscriber.UUID }}')
    expect(sent.headers[0]!['List-Unsubscribe']).toContain('{{ .Subscriber.ID }}')
  })

  it('schedules it, and takes a scheduled campaign back to a draft before changing it', async () => {
    listmonk.calls.length = 0
    expect(
      await pushIssue(payload, issue, 'schedule', {
        origin: ORIGIN,
        now,
        env: ON,
        campaigns: listmonk.client,
      }),
    ).toMatchObject({ ok: true, status: 'scheduled' })
    issue = await read()
    expect(issue.status).toBe('scheduled')
    expect(listmonk.calls).toEqual(['get 1', 'update 1', 'scheduled 1'])
    listmonk.calls.length = 0
    expect(
      await pushIssue(payload, issue, 'draft', {
        origin: ORIGIN,
        now,
        env: ON,
        campaigns: listmonk.client,
      }),
    ).toMatchObject({ ok: true, status: 'pushed' })
    expect(listmonk.calls).toEqual(['get 1', 'draft 1', 'update 1'])
    issue = await read()
    expect(issue.status).toBe('pushed')
  })

  it('unschedules a scheduled issue also while pushing is switched off (an emergency stop)', async () => {
    await pushIssue(payload, issue, 'schedule', {
      origin: ORIGIN,
      now,
      env: ON,
      campaigns: listmonk.client,
    })
    issue = await read()
    expect(issue.status).toBe('scheduled')
    listmonk.calls.length = 0
    const off = { ...ON, GLIA_NOTES_PUSH: 'off' }
    // Scheduling again is refused, unscheduling is not.
    expect(
      (
        await pushIssue(payload, issue, 'schedule', {
          origin: ORIGIN,
          now,
          env: off,
          campaigns: listmonk.client,
        })
      ).ok,
    ).toBe(false)
    const stopped = await pushIssue(payload, issue, 'draft', {
      origin: ORIGIN,
      now,
      env: off,
      campaigns: listmonk.client,
    })
    expect(stopped).toMatchObject({ ok: true, status: 'pushed' })
    expect(listmonk.calls).toEqual(['get 1', 'draft 1'])
    expect(listmonk.campaigns.get(1)?.status).toBe('draft')
    issue = await read()
    expect(issue.status).toBe('pushed')
  })

  it('pushes one at a time: two pushes at once never make two campaigns', async () => {
    const other = await payload.create({
      collection: 'newsletter-issues',
      data: {
        sendAt: new Date(now.getTime() + 400 * 86_400_000).toISOString(),
        subject: 'Fake issue pushed twice at once',
        intro: 'An opening note.',
        status: 'draft',
      },
      depth: 0,
    })
    const before = listmonk.campaigns.size
    const both = await Promise.all([
      pushIssue(payload, other, 'draft', {
        origin: ORIGIN,
        now,
        env: ON,
        campaigns: listmonk.client,
      }),
      pushIssue(payload, other, 'draft', {
        origin: ORIGIN,
        now,
        env: ON,
        campaigns: listmonk.client,
      }),
    ])
    expect(listmonk.campaigns.size).toBe(before + 1)
    expect(both.filter((one) => one.ok)).toHaveLength(1)
    expect(both.find((one) => !one.ok)?.message).toContain('Another push is under way')
    // A campaign listmonk no longer shows the issues' user is refused with a clear message.
    const hidden: CampaignsClient = { ...listmonk.client, get: async () => 'hidden' }
    const refused = await pushIssue(
      payload,
      await payload.findByID({ collection: 'newsletter-issues', id: other.id, depth: 0 }),
      'draft',
      { origin: ORIGIN, now, env: ON, campaigns: hidden },
    )
    expect(refused.ok).toBe(false)
    expect(refused.message).toContain("listmonk does not show this issue's campaign")
  })

  it("takes listmonk's status in its check, and the time it started sending once sent", async () => {
    const started = new Date(now.getTime() - 60_000)
    listmonk.campaigns.set(1, { ...listmonk.campaigns.get(1)!, status: 'running' })
    expect(await syncIssueCampaigns(payload, listmonk.client, now)).toMatchObject({
      changed: 1,
      failed: 0,
    })
    expect((await read()).status).toBe('sending')
    listmonk.campaigns.set(1, {
      ...listmonk.campaigns.get(1)!,
      status: 'finished',
      startedAt: started,
    })
    await syncIssueCampaigns(payload, listmonk.client, now)
    issue = await read()
    expect(issue.status).toBe('sent')
    expect(issue.sentAt).toBe(started.toISOString())
    // A sent issue is no longer checked, nor ever pushed again.
    expect(await syncIssueCampaigns(payload, listmonk.client, now)).toMatchObject({ changed: 0 })
    expect(
      (
        await pushIssue(payload, issue, 'draft', {
          origin: ORIGIN,
          now,
          env: ON,
          campaigns: listmonk.client,
        })
      ).ok,
    ).toBe(false)
  })

  it('can still be saved by the site after a selected position closed', async () => {
    const [selected] = (issue.selected ?? []) as number[]
    await payload.update({
      collection: 'jobs',
      id: selected!,
      data: { status: 'withdrawn' } as never,
      depth: 0,
      context: { fakeData: FAKE_DATA },
    })
    const saved = await payload.update({
      collection: 'newsletter-issues',
      id: issue.id,
      data: { status: 'sent' },
      overrideAccess: true,
      depth: 0,
    })
    expect(saved.id).toBe(issue.id)
  })
})
