import { type APIRequestContext, expect, test } from '@playwright/test'

import { PREVIEW_UUID } from '../../src/lib/newsletter/consent'
import { E2E_EDITOR_EMAIL } from '../../src/scripts/e2e-editor-account'
import { E2E_ISSUE_SUBJECT } from '../../src/scripts/fake-issue'

import { editorHeaders, editorPassword } from './editor'
import { emailHeaders, mailpitUrl } from './mailpit'

// The newsletter builder (M11, D53; PLAN §3.2, §13): an issue created in the admin's API gets its
// selected positions proposed, its preview renders as HTML and as plain text, its test email
// reaches the editor through the app's mail server (Mailpit here) with RFC 8058's headers naming
// listmonk's preview UUID, which unsubscribes nobody, and pushing it makes a campaign in listmonk,
// as a draft or scheduled. Signed out, the routes give nothing.
//
// As the test editor (tests/e2e/editor.ts); the test email also needs Mailpit (MAILPIT_URL), and
// the push an app with GLIA_NOTES_PUSH=on and the issues' listmonk user, whose token the test
// reads too (LISTMONK_URL, LISTMONK_CAMPAIGNS_TOKEN), all of which CI has. The issue is dated in a
// far month of its own (an issue pushed to listmonk can no longer be deleted; `pnpm fake:jobs`
// removes those of earlier runs).

const YEAR = 2040 + Math.floor(Math.random() * 50)
const MONTH = `${YEAR}-03`
const SEND_AT = `${YEAR}-03-06T13:00:00.000Z`
const listmonkUrl = process.env.LISTMONK_URL?.replace(/\/+$/, '')
const campaignsToken = process.env.LISTMONK_CAMPAIGNS_TOKEN

test.describe('Glia Notes issues', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(({ isMobile }) => isMobile, 'the API does not depend on the device')
  test.skip(
    !editorPassword && !process.env.CI,
    'needs the test editor: E2E_EDITOR_PASSWORD=… pnpm e2e:editor',
  )

  let id: number | undefined

  test.beforeAll(async ({ request }) => {
    const headers = editorHeaders()
    // A leftover of an earlier run.
    const found = await request.get(
      `/api/newsletter-issues/?where[month][equals]=${MONTH}&depth=0`,
      {
        headers,
      },
    )
    for (const doc of ((await found.json()) as { docs: { id: number }[] }).docs) {
      await request.delete(`/api/newsletter-issues/${doc.id}/`, { headers })
    }
  })

  test.afterAll(async ({ request }) => {
    if (id !== undefined) {
      await request.delete(`/api/newsletter-issues/${id}/`, { headers: editorHeaders() })
    }
  })

  test('a new issue gets its month from its date and proposed positions', async ({ request }) => {
    const response = await request.post('/api/newsletter-issues/', {
      headers: editorHeaders(),
      data: {
        sendAt: SEND_AT,
        subject: E2E_ISSUE_SUBJECT,
        preheader: 'A test of the newsletter builder.',
        intro: 'This is the opening note of a test issue.\n\nIt has two paragraphs.',
      },
    })
    expect(response.status()).toBe(201)
    const { doc } = (await response.json()) as {
      doc: { id: number; month: string; status: string; selected: number[] }
    }
    id = doc.id
    expect(doc.month).toBe(MONTH)
    expect(doc.status).toBe('draft')
    // The fake data has open rolling and until-filled positions, still open in 2030.
    expect(doc.selected.length).toBeGreaterThan(0)
    expect(doc.selected.length).toBeLessThanOrEqual(15)
  })

  test('its preview renders as an email and as plain text', async ({ request }) => {
    const html = await request.get(`/api/newsletter-issues/${id}/preview/`, {
      headers: editorHeaders(),
    })
    expect(html.status()).toBe(200)
    expect(html.headers()['content-type']).toContain('text/html')
    expect(html.headers()['cache-control']).toContain('no-store')
    const body = await html.text()
    expect(body).toContain(`<title>${E2E_ISSUE_SUBJECT}</title>`)
    expect(body).toContain(`Glia Notes, March ${YEAR}`)
    expect(body).toContain('Selected positions')
    expect(body).toContain(`/en/newsletter/unsubscribe/?id=0&amp;s=${PREVIEW_UUID}`)

    const text = await request.get(`/api/newsletter-issues/${id}/preview/?format=text`, {
      headers: editorHeaders(),
    })
    expect(text.headers()['content-type']).toContain('text/plain')
    const plain = await text.text()
    expect(plain).toContain('SELECTED POSITIONS')
    expect(plain).toContain('It has two paragraphs.')
  })

  test('a test email reaches the editor with the one-click headers', async ({
    request,
    baseURL,
  }) => {
    test.skip(!mailpitUrl, 'needs Mailpit (MAILPIT_URL) and an app that sends to it')
    const since = Date.now()
    const response = await request.post(`/api/newsletter-issues/${id}/test/`, {
      headers: { ...editorHeaders(), Origin: baseURL! },
      data: {},
    })
    expect(response.status()).toBe(200)
    expect(((await response.json()) as { ok: boolean }).ok).toBe(true)

    type Message = { ID: string; Subject: string; Created: string; To: { Address: string }[] }
    let message: Message | undefined
    await expect
      .poll(
        async () => {
          const query = encodeURIComponent(
            `to:"${E2E_EDITOR_EMAIL}" subject:"[Test] ${E2E_ISSUE_SUBJECT}"`,
          )
          const found = await fetch(`${mailpitUrl}/api/v1/search?query=${query}&limit=5`)
          const { messages } = (await found.json()) as { messages: Message[] }
          message = messages.find((m) => new Date(m.Created).getTime() >= since - 5_000)
          return Boolean(message)
        },
        { timeout: 20_000, message: 'the test email' },
      )
      .toBe(true)
    const full = (await (await fetch(`${mailpitUrl}/api/v1/message/${message!.ID}`)).json()) as {
      HTML: string
      Text: string
    }
    expect(full.HTML).toContain('This is a test of an issue that has not been sent.')
    expect(full.Text).toContain('SELECTED POSITIONS')
    const headers = await emailHeaders(message!.ID)
    expect(headers['List-Unsubscribe']?.[0]).toMatch(
      new RegExp(`/en/newsletter/unsubscribe/use/\\?id=0&s=${PREVIEW_UUID}>$`),
    )
    expect(headers['List-Unsubscribe-Post']).toEqual(['List-Unsubscribe=One-Click'])
  })

  test('its page in the admin shows the actions and the positions', async ({ page }) => {
    await page.context().setExtraHTTPHeaders(editorHeaders())
    await page.goto(`/admin/collections/newsletter-issues/${id}/`)
    const actions = page.locator('.issue-actions')
    await expect(actions.getByRole('heading', { name: 'Preview and send' })).toBeVisible()
    await expect(actions.getByRole('link', { name: 'Preview the email' })).toHaveAttribute(
      'href',
      `/api/newsletter-issues/${id}/preview/`,
    )
    await expect(actions.getByRole('button', { name: 'Send a test email' })).toBeEnabled()
    await expect(page.locator('#field-selected .rs__multi-value').first()).toBeVisible()
  })

  /** The campaign in listmonk, as the issues' API user reads it. */
  async function campaign(campaignId: number) {
    const response = await fetch(`${listmonkUrl}/api/campaigns/${campaignId}`, {
      headers: { Authorization: `token gliagora-campaigns:${campaignsToken}` },
    })
    expect(response.status).toBe(200)
    return ((await response.json()) as { data: Record<string, unknown> }).data
  }

  async function issue(request: APIRequestContext) {
    const response = await request.get(`/api/newsletter-issues/${id}/?depth=0`, {
      headers: editorHeaders(),
    })
    return (await response.json()) as {
      status: string
      subject: string
      listmonkCampaignId: number | null
      snapshot: { subject: string } | null
    }
  }

  const push = (request: APIRequestContext, baseURL: string, mode: 'draft' | 'schedule') =>
    request.post(`/api/newsletter-issues/${id}/push/`, {
      headers: { ...editorHeaders(), Origin: baseURL },
      data: { mode },
    })

  test.describe('in listmonk', () => {
    test.skip(
      !(listmonkUrl && campaignsToken) && !process.env.CI,
      "needs listmonk with the issues' user: LISTMONK_URL, LISTMONK_CAMPAIGNS_TOKEN",
    )

    test('pushed as a draft, it becomes a campaign of Glia Notes that sends nothing', async ({
      request,
      baseURL,
    }) => {
      const response = await push(request, baseURL!, 'draft')
      const answer = (await response.json()) as { ok: boolean; message: string }
      expect(answer.message).toContain('Pushed to listmonk as a draft')
      expect(response.status()).toBe(200)
      const saved = await issue(request)
      expect(saved.status).toBe('pushed')
      expect(saved.snapshot?.subject).toBe(E2E_ISSUE_SUBJECT)
      const there = await campaign(saved.listmonkCampaignId!)
      expect(there.status).toBe('draft')
      expect(there.name).toBe(`Glia Notes ${MONTH}`)
      expect(there.content_type).toBe('html')
      expect(String(there.body)).toContain('?id={{ .Subscriber.ID }}&amp;s={{ .Subscriber.UUID }}')
      expect(there.headers).toEqual([
        {
          'List-Unsubscribe': expect.stringMatching(
            /\/en\/newsletter\/unsubscribe\/use\/\?id=\{\{ \.Subscriber\.ID \}\}&s=\{\{ \.Subscriber\.UUID \}\}>$/,
          ),
        },
        { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      ])
      // Once in listmonk, the issue is part of the record: it cannot be deleted.
      const deleted = await request.delete(`/api/newsletter-issues/${id}/`, {
        headers: editorHeaders(),
      })
      expect(deleted.ok()).toBe(false)
      expect((await issue(request)).status).toBe('pushed')
    })

    test('scheduled, it is locked; pushed as a draft again, listmonk unschedules it', async ({
      request,
      baseURL,
    }) => {
      const scheduled = await push(request, baseURL!, 'schedule')
      expect(((await scheduled.json()) as { message: string }).message).toContain(
        'Scheduled in listmonk',
      )
      const saved = await issue(request)
      expect(saved.status).toBe('scheduled')
      expect((await campaign(saved.listmonkCampaignId!)).status).toBe('scheduled')
      // The editor's fields are locked while listmonk has it scheduled.
      await request.patch(`/api/newsletter-issues/${id}/`, {
        headers: editorHeaders(),
        data: { subject: 'Changed while scheduled' },
      })
      expect((await issue(request)).subject).toBe(E2E_ISSUE_SUBJECT)
      const back = await push(request, baseURL!, 'draft')
      expect(back.status()).toBe(200)
      expect((await issue(request)).status).toBe('pushed')
      expect((await campaign(saved.listmonkCampaignId!)).status).toBe('draft')
    })
  })

  test('signed out, its routes give nothing', async ({ playwright, baseURL }) => {
    const context = await playwright.request.newContext({ baseURL })
    try {
      expect((await context.get(`/api/newsletter-issues/${id}/preview/`)).status()).toBe(404)
      const sent = await context.post(`/api/newsletter-issues/${id}/test/`, {
        headers: { Origin: baseURL! },
        data: {},
      })
      expect(sent.status()).toBe(404)
      const pushed = await context.post(`/api/newsletter-issues/${id}/push/`, {
        headers: { Origin: baseURL! },
        data: { mode: 'schedule' },
      })
      expect(pushed.status()).toBe(404)
      expect((await context.get(`/api/newsletter-issues/${id}/`)).status()).toBe(403)
    } finally {
      await context.dispose()
    }
  })
})
