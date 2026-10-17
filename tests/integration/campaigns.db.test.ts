import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { emailCap } from '@/lib/forms/email-cap'
import { campaignsClient } from '@/lib/newsletter/campaigns'
import type { IssueContent, IssueJob } from '@/lib/newsletter/issue/content'
import { campaignBody } from '@/lib/newsletter/issue/render'
import { sendRate } from '@/lib/newsletter/issue/settings'
import { type Subscriber, listmonkClient } from '@/lib/newsletter/listmonk'
import { LISTMONK_API_USER } from '@/scripts/listmonk-settings'

import { type Listmonk, listmonkAvailable, startListmonk } from './listmonk'
import { type Mailpit, mailpitAvailable, startMailpit } from './mailpit'

// The issues of Glia Notes in a real listmonk (M11, D53): the server's settings
// (deploy/listmonk/settings.sql) give the issues' own API user only what the push needs; a
// campaign made from `campaignBody()` compiles in listmonk 6.2, and when it runs, every
// subscriber gets the issue with their own ID and UUID in the unsubscribe link and in the
// one-click headers (RFC 8058), and the site's text exactly as written: listmonk fills template
// values in a campaign's own headers, so they need no other way. Through a throwaway Mailpit.
// Fake addresses only. Skipped without Docker or the listmonk and Mailpit programs.

const canRun = (await listmonkAvailable()) && (await mailpitAvailable())

const ORIGIN = 'https://gliagora.com'

const job = (id: number, title: string): IssueJob => ({
  id,
  title,
  path: `/en/jobs/phd-k3f${id}a/`,
  originalUrl: `https://jobs.example.org/${id}?ref=list&b={{2}}`,
  institution: 'Example Institute <b>',
  place: 'Oslo, Norway',
  positionType: 'PhD',
  deadline: { kind: 'rolling' },
  summary: 'A summary with {{ .Subscriber.Email }} and <!-- a comment -->.',
})

const content: IssueContent = {
  version: 1,
  month: '2026-11',
  sendAt: '2026-11-03T13:00:00.000Z',
  subject: 'Glia Notes {{ .Subscriber.Name }} test https://a.org@TrackLink',
  preheader: 'A test <x of the campaign',
  intro: 'Hello {{x}} <3 & </p>.',
  deadlines: { from: '2026-11-03', to: '2026-12-18', jobs: [], more: 0 },
  selected: [job(1, 'Lab {{ template "x" }} <i> & a < b')],
}

describe.skipIf(!canRun)('Glia Notes campaigns in listmonk (M11)', () => {
  let mailpit: Mailpit
  let listmonk: Listmonk
  const subscribers: Subscriber[] = []

  beforeAll(async () => {
    mailpit = await startMailpit()
    listmonk = await startListmonk({
      smtp: { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(mailpit.smtpPort), SMTP_SECURE: 'false' },
    })
    const people = listmonkClient({
      url: listmonk.url,
      user: LISTMONK_API_USER,
      token: listmonk.token,
    })
    for (const address of ['campaign-one@example.org', 'campaign-two@example.org']) {
      subscribers.push(await people.subscribe(address))
    }
  }, 120_000)

  afterAll(async () => {
    await listmonk?.stop()
    await mailpit?.stop()
  })

  /** A campaign's status as the issues' user sees it. */
  const statusOf = async (id: number) => {
    const found = await campaigns().get(id)
    return found && found !== 'hidden' ? found.status : found
  }

  const campaigns = () =>
    campaignsClient({
      url: listmonk.url,
      user: 'gliagora-campaigns',
      token: listmonk.campaignsToken,
    })

  async function call(path: string, headers: Record<string, string>, init: RequestInit = {}) {
    const response = await fetch(`${listmonk.url}${path}`, {
      ...init,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
    await response.body?.cancel().catch(() => {})
    return response.status
  }

  it("gives the issues' user campaigns and templates, and nothing about subscribers or settings", async () => {
    const own = listmonk.campaignsHeaders
    expect(await call('/api/campaigns', own)).toBe(200)
    expect(await call('/api/templates', own)).toBe(200)
    expect(await call('/api/subscribers', own)).toBe(403)
    expect(await call(`/api/subscribers/${subscribers[0]!.id}`, own)).toBe(403)
    expect(await call('/api/subscribers?query=subscribers.id>0', own)).toBe(403)
    expect(await call('/api/settings', own)).toBe(403)
    expect(await call('/api/users', own)).toBe(403)
    expect(
      await call('/api/subscribers', own, {
        method: 'POST',
        body: JSON.stringify({ email: 'x@example.org', name: 'X', lists: [] }),
      }),
    ).toBe(403)
    // And the subscribers' user still cannot touch campaigns.
    expect(await call('/api/campaigns', listmonk.headers)).toBe(403)
  })

  it('makes, changes, schedules and unschedules a campaign of Glia Notes', async () => {
    const body = await campaignBody(content, ORIGIN)
    const input = {
      name: 'Glia Notes 2026-11 (schedule)',
      subject: body.subject,
      html: body.html,
      text: body.text,
      headers: body.headers,
      sendAt: new Date(Date.now() + 86_400_000),
    }
    const client = campaigns()
    const made = await client.create(input)
    expect(made.status).toBe('draft')
    expect(await statusOf(made.id)).toBe('draft')
    const changed = await client.update(made.id, { ...input, subject: 'Another subject' })
    expect(changed.id).toBe(made.id)
    expect((await client.setStatus(made.id, 'scheduled')).status).toBe('scheduled')
    expect((await client.setStatus(made.id, 'draft')).status).toBe('draft')
    // A campaign that does not exist is refused to this user like one it may not see (403).
    expect(await client.get(999_999)).toBe('hidden')
  })

  it("sends every subscriber their own unsubscribe links and headers, and the site's text as written", async () => {
    const body = await campaignBody(content, ORIGIN)
    const client = campaigns()
    const made = await client.create({
      name: 'Glia Notes 2026-11 (run)',
      subject: body.subject,
      html: body.html,
      text: body.text,
      headers: body.headers,
      sendAt: null,
    })
    // Start it now (the push schedules it instead; listmonk then starts it at its date).
    expect(
      await call(`/api/campaigns/${made.id}/status`, listmonk.campaignsHeaders, {
        method: 'PUT',
        body: JSON.stringify({ status: 'running' }),
      }),
    ).toBe(200)
    await expect
      .poll(async () => (await mailpit.messages()).length, { timeout: 60_000, interval: 1_000 })
      .toBeGreaterThanOrEqual(2)

    for (const subscriber of subscribers) {
      const [message] = await mailpit.to(subscriber.email)
      expect(message, subscriber.email).toBeDefined()
      const query = `?id=${subscriber.id}&s=${subscriber.uuid}`
      const headers = await mailpit.headers(message!.ID)
      expect(headers['List-Unsubscribe']).toEqual([
        `<${ORIGIN}/en/newsletter/unsubscribe/use/${query}>`,
      ])
      expect(headers['List-Unsubscribe-Post']).toEqual(['List-Unsubscribe=One-Click'])
      expect(message!.HTML).toContain(
        `href="${ORIGIN}/en/newsletter/unsubscribe/${query.replace('&', '&amp;')}"`,
      )
      expect(message!.Text).toContain(`${ORIGIN}/en/newsletter/unsubscribe/${query}`)
      // The site's text, exactly: nothing read as a template, no address, no tracking.
      expect(message!.Subject).toBe(
        'Glia Notes {{ .Subscriber.Name }} test https://a.org@​TrackLink',
      )
      expect(message!.Text).toContain('Lab {{ template "x" }} <i> & a < b')
      expect(message!.Text).toContain('Hello {{x}} <3 & </p>.')
      expect(message!.Text).toContain(
        'A summary with {{ .Subscriber.Email }} and <!-- a comment -->.',
      )
      expect(message!.HTML).toContain('Lab {{ template &quot;x&quot; }} &lt;i&gt; &amp; a &lt; b')
      expect(`${message!.HTML}${message!.Text}`).not.toContain(subscriber.email)
      expect(message!.HTML).not.toMatch(/<img|\/campaign\/.*\/px\.png|\/link\//)
      // listmonk's own template adds nothing: no footer, no unsubscribe link of its own.
      expect(message!.HTML).not.toContain('/subscription/')
    }
    await expect.poll(async () => statusOf(made.id), { timeout: 30_000 }).toBe('finished')
    const finished = await client.get(made.id)
    expect(finished !== 'hidden' && finished?.startedAt).toBeInstanceOf(Date)
  }, 120_000)

  it('sets the sending rate from the mailbox limits, as the app computes it', async () => {
    const cases = [
      { MAILBOX_LIMIT_HOUR: '500', MAILBOX_LIMIT_DAY: '', EMAIL_CAP_HOUR: '', EMAIL_CAP_DAY: '' },
      {
        MAILBOX_LIMIT_HOUR: '',
        MAILBOX_LIMIT_DAY: '2000',
        EMAIL_CAP_HOUR: '40',
        EMAIL_CAP_DAY: '150',
      },
      {
        MAILBOX_LIMIT_HOUR: '600',
        MAILBOX_LIMIT_DAY: '1500',
        EMAIL_CAP_HOUR: '',
        EMAIL_CAP_DAY: '',
      },
      {
        MAILBOX_LIMIT_HOUR: '300',
        MAILBOX_LIMIT_DAY: '5000',
        EMAIL_CAP_HOUR: '20',
        EMAIL_CAP_DAY: '',
      },
      // Leading zeros, as the app reads them: 50 and 300.
      {
        MAILBOX_LIMIT_HOUR: '500',
        MAILBOX_LIMIT_DAY: '',
        EMAIL_CAP_HOUR: '050',
        EMAIL_CAP_DAY: '0300',
      },
    ]
    for (const env of cases) {
      await listmonk.applySettings({
        mailbox_limit_hour: env.MAILBOX_LIMIT_HOUR,
        mailbox_limit_day: env.MAILBOX_LIMIT_DAY,
        email_cap_hour: env.EMAIL_CAP_HOUR,
        email_cap_day: env.EMAIL_CAP_DAY,
      })
      // The cap exactly as the app reads it.
      const cap = emailCap(env)
      expect(cap.problems, JSON.stringify(env)).toEqual([])
      const [capHour, capDay] = [cap.hour, cap.day]
      const expected = sendRate({
        mailboxHour: env.MAILBOX_LIMIT_HOUR ? Number(env.MAILBOX_LIMIT_HOUR) : null,
        mailboxDay: env.MAILBOX_LIMIT_DAY ? Number(env.MAILBOX_LIMIT_DAY) : null,
        capHour,
        capDay,
      })
      expect(expected, JSON.stringify(env)).toMatchObject({ rate: expect.any(Number) })
      const settings = await listmonk.settings([
        'app.message_sliding_window',
        'app.message_sliding_window_rate',
        'app.message_sliding_window_duration',
      ])
      expect(settings, JSON.stringify(env)).toEqual({
        'app.message_sliding_window': true,
        'app.message_sliding_window_rate': (expected as { rate: number }).rate,
        'app.message_sliding_window_duration': `${(expected as { windowHours: number }).windowHours}h`,
      })
    }
    // Without LISTMONK_CAMPAIGNS_TOKEN, the issues' user is disabled: its token works no more.
    expect(await listmonk.applySettings({ campaigns_token_sha256: '' })).toContain(
      'API user gliagora-campaigns: disabled',
    )
    // (listmonk reads its API users when it starts: prepare.sh restarts it after a change.)
    // A cap the app would only correct (0, a word, too large) is refused here, and the app's
    // push refuses it too (pushSettings).
    for (const wrong of ['0', 'x', '200000']) {
      await expect(listmonk.applySettings({ email_cap_hour: wrong })).rejects.toThrow(/email_cap/)
      expect(emailCap({ EMAIL_CAP_HOUR: wrong }).problems.length, wrong).toBeGreaterThan(0)
    }
    // A limit that leaves no share is refused, and changes nothing.
    await expect(
      listmonk.applySettings({ mailbox_limit_hour: '100', email_cap_hour: '50' }),
    ).rejects.toThrow(/no room for Glia Notes/)
    await listmonk.applySettings()
  }, 60_000)
})
