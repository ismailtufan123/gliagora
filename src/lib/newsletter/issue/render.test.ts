import { describe, expect, it } from 'vitest'

import { PREVIEW_UUID } from '../consent'
import { DEADLINES_MAX, type IssueContent, type IssueJob, SELECTED_MAX } from './content'
import {
  HTML_MAX_BYTES,
  SUBSCRIBER_ID,
  SUBSCRIBER_UUID,
  byteSize,
  campaignBody,
  fitWithinCap,
  literalForListmonk,
  renderIssue,
} from './render'

// The email of an issue (PLAN §13): its HTML and plain text from one content, the links (UTM tags
// on ours only, none on employers'), the footer, the size, and the version listmonk sends.

const ORIGIN = 'https://gliagora.com'

function job(n: number, overrides: Partial<IssueJob> = {}): IssueJob {
  return {
    id: n,
    title: `Postdoctoral researcher in cortical circuits ${n}`,
    path: `/en/jobs/postdoc-cortical-circuits-k3f${String(n).padStart(2, '0')}/`,
    originalUrl: `https://jobs.example.org/posting/${n}?ref=list`,
    institution: 'Example Institute of Neuroscience',
    place: 'Lisbon, Portugal',
    positionType: 'Postdoc',
    deadline: { kind: 'fixed', day: '2026-11-20', timeZone: 'Europe/Lisbon' },
    summary: null,
    ...overrides,
  }
}

const content = (overrides: Partial<IssueContent> = {}): IssueContent => ({
  version: 1,
  month: '2026-11',
  sendAt: '2026-11-03T13:00:00.000Z',
  subject: 'Glia Notes, November 2026: deadlines and positions',
  preheader: 'Twelve positions across six regions, and the deadlines of the next 45 days.',
  intro: 'Welcome to the first Glia Notes.\n\nThis issue lists the deadlines of the next weeks.',
  deadlines: {
    from: '2026-11-03',
    to: '2026-12-18',
    jobs: [job(1), job(2, { deadline: { kind: 'fixed', day: '2026-12-01', timeZone: null } })],
    more: 0,
  },
  selected: [
    job(3, { summary: 'A three-year position on the circuits of the visual cortex.' }),
    job(4, { deadline: { kind: 'rolling' }, originalUrl: null }),
    job(5, { deadline: { kind: 'until-filled' } }),
  ],
  ...overrides,
})

const hrefs = (html: string) =>
  [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replaceAll('&amp;', '&'))

describe('the email of an issue (PLAN §13)', () => {
  it('is one column of 600px in English, with the preheader and no comments', async () => {
    const { html, subject } = await renderIssue(content(), {
      origin: ORIGIN,
      recipient: { kind: 'preview' },
    })
    expect(subject).toBe('Glia Notes, November 2026: deadlines and positions')
    expect(html).toMatch(/^<!DOCTYPE html/)
    expect(html).toContain('<html dir="ltr" lang="en"')
    expect(html).toContain('max-width:600px')
    expect(html).toContain('Twelve positions across six regions')
    expect(html).toContain('<meta name="color-scheme" content="light dark"')
    expect(html).toContain('@media (prefers-color-scheme:dark)')
    expect(html).not.toContain('<!--')
  })

  it('loads nothing from anywhere: no images without alt text, no scripts, no remote styles', async () => {
    const { html } = await renderIssue(content(), {
      origin: ORIGIN,
      recipient: { kind: 'preview' },
    })
    expect(html).not.toMatch(/<script|<link |<iframe|<object|<embed|url\(/i)
    for (const img of html.match(/<img\b[^>]*>/g) ?? []) expect(img).toMatch(/\salt="[^"]+"/)
    expect(html).not.toMatch(/\ssrc=/i)
  })

  it('tags only links to our own pages, and never names the subscriber in them', async () => {
    const { html, text } = await renderIssue(content(), {
      origin: ORIGIN,
      recipient: { kind: 'preview' },
    })
    const links = hrefs(html)
    const employer = links.filter((href) => href.startsWith('https://jobs.example.org/'))
    expect(employer).toEqual([
      'https://jobs.example.org/posting/3?ref=list',
      'https://jobs.example.org/posting/5?ref=list',
    ])
    for (const href of links) {
      const url = new URL(href)
      if (url.origin !== ORIGIN) {
        expect(
          [...url.searchParams.keys()].some((key) => key.startsWith('utm_')),
          href,
        ).toBe(false)
        continue
      }
      const personal =
        url.pathname.startsWith('/en/newsletter/unsubscribe/') ||
        url.pathname.startsWith('/en/legal/') ||
        url.pathname.startsWith('/tr/') ||
        url.pathname === '/en/contact/'
      expect(url.searchParams.get('utm_source'), href).toBe(personal ? null : 'glia-notes')
      if (!personal) {
        expect(url.searchParams.get('utm_medium')).toBe('email')
        expect(url.searchParams.get('utm_campaign')).toBe('glia-notes-2026-11')
      }
    }
    // The plain text has the same links.
    for (const href of links) expect(text).toContain(href)
  })

  it('has the footer of §13: why, unsubscribe (preview UUID in a preview), contact, privacy', async () => {
    const { html, text, oneClick } = await renderIssue(content(), {
      origin: ORIGIN,
      recipient: { kind: 'preview' },
    })
    const page = `${ORIGIN}/en/newsletter/unsubscribe/?id=0&s=${PREVIEW_UUID}`
    expect(hrefs(html)).toContain(page)
    expect(text).toContain(page)
    expect(oneClick).toBe(`${ORIGIN}/en/newsletter/unsubscribe/use/?id=0&s=${PREVIEW_UUID}`)
    for (const words of [
      'You get Glia Notes because you subscribed at gliagora.com',
      'Contact and legal notice',
      'Privacy policy',
      'KVKK notice',
    ]) {
      expect(html).toContain(words)
      expect(text).toContain(words)
    }
    expect(hrefs(html)).toEqual(
      expect.arrayContaining([
        `${ORIGIN}/en/contact/`,
        `${ORIGIN}/en/legal/privacy/`,
        `${ORIGIN}/tr/legal/kvkk-aydinlatma-metni/`,
      ]),
    )
  })

  it('says each deadline with its time zone, or Anywhere on Earth, rolling or until filled', async () => {
    const { text } = await renderIssue(content(), {
      origin: ORIGIN,
      recipient: { kind: 'preview' },
    })
    expect(text).toMatch(/Deadline: 20 Nov 2026, end of the day in .*\(UTC\)/)
    expect(text).toContain('Deadline: 1 Dec 2026, Anywhere on Earth')
    expect(text).toContain('Rolling deadline')
    expect(text).toContain('Open until filled')
  })

  it('marks a test email in its subject and at the top', async () => {
    const { subject, html, text } = await renderIssue(content(), {
      origin: ORIGIN,
      recipient: { kind: 'preview' },
      test: true,
    })
    expect(subject).toBe('[Test] Glia Notes, November 2026: deadlines and positions')
    expect(html).toContain('This is a test of an issue that has not been sent.')
    expect(text.startsWith('This is a test of an issue that has not been sent.')).toBe(true)
  })

  it('fits under 100 KB of HTML, moving the last deadlines into the link to the jobs list', async () => {
    // Titles of 300 characters (the field's limit) outside ASCII, and summaries of 280.
    const long = 'ğüşıöç çğü '.repeat(30).slice(0, 290)
    const full = content({
      deadlines: {
        from: '2026-11-03',
        to: '2026-12-18',
        jobs: Array.from({ length: DEADLINES_MAX }, (_, i) =>
          job(100 + i, { title: `${long} ${i}`, institution: long.slice(0, 120) }),
        ),
        more: 25,
      },
      selected: Array.from({ length: SELECTED_MAX }, (_, i) =>
        job(200 + i, { title: `${long} ${i}`, summary: 'é'.repeat(280) }),
      ),
    })
    expect(byteSize((await campaignBody(full, ORIGIN)).html)).toBeGreaterThan(HTML_MAX_BYTES)
    const { content: fitted, trimmed } = await fitWithinCap(full, ORIGIN)
    expect(trimmed).toBeGreaterThan(0)
    expect(fitted.deadlines.jobs).toHaveLength(DEADLINES_MAX - trimmed)
    expect(fitted.deadlines.more).toBe(25 + trimmed)
    expect(byteSize((await campaignBody(fitted, ORIGIN)).html)).toBeLessThan(HTML_MAX_BYTES)
    // The usual issue is left as it is.
    expect((await fitWithinCap(content(), ORIGIN)).trimmed).toBe(0)
  })
})

describe('the campaign listmonk sends', () => {
  it("puts each subscriber's own ID and UUID in the unsubscribe links and headers", async () => {
    const { html, text, headers } = await campaignBody(content(), ORIGIN)
    const page = `${ORIGIN}/en/newsletter/unsubscribe/?id=${SUBSCRIBER_ID}&amp;s=${SUBSCRIBER_UUID}`
    expect(html).toContain(`href="${page}"`)
    expect(text).toContain(
      `${ORIGIN}/en/newsletter/unsubscribe/?id=${SUBSCRIBER_ID}&s=${SUBSCRIBER_UUID}`,
    )
    expect(headers).toEqual([
      {
        'List-Unsubscribe': `<${ORIGIN}/en/newsletter/unsubscribe/use/?id=${SUBSCRIBER_ID}&s=${SUBSCRIBER_UUID}>`,
      },
      { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    ])
    // No other template expression, and no preview UUID.
    expect((html.match(/\{\{/g) ?? []).length).toBe(2)
    expect((text.match(/\{\{/g) ?? []).length).toBe(2)
    expect(html).not.toContain(PREVIEW_UUID)
  })

  it('makes everything that came from the site literal for listmonk', async () => {
    const tricky = content({
      subject: 'Deadlines {{ .Subscriber.Email }} https://a.org@TrackLink',
      intro: 'Write {{ .Subscriber.Name }} here, see https://example.org/@TrackLink and <b>this.',
      selected: [job(9, { title: 'Lab {{ template "x" }} <i> & a < b' })],
    })
    const { subject, html, text } = await campaignBody(tricky, ORIGIN)
    expect(subject).toBe('Deadlines {{"{{"}} .Subscriber.Email }} https://a.org@\u200bTrackLink')
    expect(html).toContain('Write {{"{{"}} .Subscriber.Name }} here')
    expect(html).toContain('https://example.org/@\u200bTrackLink')
    // In the plain text every `<` is printed by listmonk's Safe, which html/template leaves alone.
    expect(text).toContain('Lab {{"{{"}} template "x" }} {{ Safe "<" }}i> & a {{ Safe "<" }} b')
    expect(text).toContain('{{ Safe "<" }}b>this.')
    expect(html).not.toMatch(/\{\{\s*\.Subscriber\.(Email|Name)/)
  })

  it('leaves text without template characters alone, but for the plain text’s `<`', () => {
    expect(literalForListmonk('Plain & text > here', 'text')).toBe('Plain & text > here')
    expect(literalForListmonk('a <3', 'html')).toBe('a <3')
    expect(literalForListmonk('a <3', 'text')).toBe('a {{ Safe "<" }}3')
  })
})
