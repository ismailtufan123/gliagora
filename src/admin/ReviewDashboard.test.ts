import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { ReviewSummary } from '@/lib/review/dashboard'

import { ReviewDashboard, ReviewDashboardView } from './ReviewDashboard'

const now = new Date('2026-09-28T09:00:00.000Z')

const summary = (overrides: Partial<ReviewSummary> = {}): ReviewSummary => ({
  candidates: { new: 3, triaged: 1 },
  jobsInReview: 1,
  suggestions: { waiting: 4, notQueued: 2 },
  reports: { new: 3, personalRightsDue: 2, personalRightsOverdue: 1 },
  dataRequests: { due: 2, overdue: 1 },
  closing: {
    total: 11,
    next: [
      { id: 7, title: 'Postdoc in glia', shortId: 'k3f9a', day: '2026-10-02' },
      { id: 8, title: 'PhD position in sleep', shortId: 'm7p2q', day: '2026-10-09' },
    ],
  },
  ...overrides,
})

const links = {
  list: (collection: string, where?: unknown) =>
    `/admin/collections/${collection}?where=${JSON.stringify(where)}`,
  doc: (collection: string, id: number | string) => `/admin/collections/${collection}/${id}`,
}

const render = (value: ReviewSummary) =>
  renderToStaticMarkup(createElement(ReviewDashboardView, { summary: value, links, now }))

// The text a reader gets, without tags.
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"')

describe('ReviewDashboardView', () => {
  it('says what waits for an editor, each count linking to its list', () => {
    const html = render(summary())
    expect(text(html)).toContain('Review queue: 3 new, 1 triaged')
    expect(text(html)).toContain('In review: 1 job')
    expect(text(html)).toContain(
      'Suggestions waiting: 4 suggestions (2 not in the review queue, to handle by hand)',
    )
    expect(html).toContain(
      'href="/admin/collections/candidates?where={&quot;status&quot;:{&quot;equals&quot;:&quot;new&quot;}}"',
    )
    expect(html).toContain(
      'href="/admin/collections/jobs?where={&quot;status&quot;:{&quot;equals&quot;:&quot;in_review&quot;}}"',
    )
  })

  it('lists the next jobs to close with their deadline day, and links to all of them', () => {
    const html = render(summary())
    expect(text(html)).toContain('Closing within 14 days: 11')
    expect(html).toContain(
      '<li><a href="/admin/collections/jobs/7">Postdoc in glia</a> – <time dateTime="2026-10-02">2 Oct 2026</time></li>',
    )
    expect(html).toMatch(/<a href="[^"]*">All 11 jobs closing within 14 days<\/a>/)
  })

  it('counts new reports and the personal-rights requests due within 24 hours', () => {
    const html = render(summary())
    expect(text(html)).toContain('Reports: 3 new')
    expect(text(html)).toContain('Personal-rights requests due within 24 hours: 2 (1 overdue)')
    expect(html).toContain(
      'href="/admin/collections/reports?where={&quot;status&quot;:{&quot;equals&quot;:&quot;new&quot;}}"',
    )
    const calm = render(
      summary({
        reports: { new: 0, personalRightsDue: 0, personalRightsOverdue: 0 },
        dataRequests: { due: 0, overdue: 0 },
      }),
    )
    expect(text(calm)).toContain('Reports: 0 new')
    expect(text(calm)).toContain('Personal-rights requests due within 24 hours: 0')
    expect(text(calm)).not.toContain('overdue')
  })

  it('counts the open data requests due within 7 days, with the overdue ones', () => {
    const html = render(summary())
    expect(text(html)).toContain('Data requests to answer within 7 days: 2 (1 overdue)')
    const calm = render(summary({ dataRequests: { due: 0, overdue: 0 } }))
    expect(text(calm)).toContain('Data requests to answer within 7 days: 0')
    expect(text(calm)).not.toMatch(/Data requests[^<]*overdue/)
  })

  it('has a heading for the section and one for the deadline tracker', () => {
    const html = render(summary())
    expect(html).toMatch(/<section[^>]*aria-labelledby="review-dashboard-title"/)
    expect(html).toMatch(/<h2 id="review-dashboard-title"[^>]*>Waiting for an editor<\/h2>/)
    expect(html).toMatch(/<h3[^>]*>Closing within 14 days: 11<\/h3>/)
  })

  it('says when nothing closes soon, and shows no "All" link when every job is listed', () => {
    const html = render(
      summary({
        jobsInReview: 0,
        suggestions: { waiting: 0, notQueued: 0 },
        closing: { total: 0, next: [] },
      }),
    )
    expect(text(html)).toContain('In review: 0 jobs')
    expect(text(html)).toContain('Suggestions waiting: 0 suggestions')
    expect(text(html)).not.toContain('not in the review queue')
    expect(text(html)).toContain('No published job closes within the next 14 days.')
    expect(html).not.toContain('All 0')
  })
})

describe('ReviewDashboard', () => {
  it('links to the admin lists filtered as the counts are', async () => {
    const payload = {
      config: { routes: { admin: '/admin' } },
      count: vi.fn(async () => ({ totalDocs: 1 })),
      find: vi.fn(async () => ({ totalDocs: 11, docs: [] })),
    }
    const element = await ReviewDashboard({ payload, user: { id: 1 } } as never)
    const html = decodeURIComponent(renderToStaticMarkup(element!))
    expect(html).toContain('href="/admin/collections/candidates?where[status][equals]=new"')
    expect(html).toContain('href="/admin/collections/candidates?where[status][equals]=triaged"')
    expect(html).toContain(
      'href="/admin/collections/submissions?where[status][in][0]=new&amp;where[status][in][1]=queued"',
    )
    expect(html).toMatch(
      /href="\/admin\/collections\/jobs\?where\[and\]\[0\]\[status\]\[equals\]=published[^"]*">All 11 jobs/,
    )
    expect(html).toContain('href="/admin/collections/reports?where[status][equals]=new"')
    expect(html).toMatch(
      /href="\/admin\/collections\/reports\?where\[and\]\[0\]\[kind\]\[equals\]=personal-rights&amp;where\[and\]\[1\]\[status\]\[equals\]=new&amp;where\[and\]\[2\]\[respondBy\]\[less_than_equal\]=[^"]+"/,
    )
    expect(html).toMatch(
      /href="\/admin\/collections\/data-requests\?where\[and\]\[0\]\[status\]\[in\]\[0\]=new&amp;where\[and\]\[0\]\[status\]\[in\]\[1\]=in-progress&amp;where\[and\]\[1\]\[respondBy\]\[less_than_equal\]=[^"]+"/,
    )
    // Payload saves a list URL's sort as the editor's preference for that list.
    expect(html).not.toContain('sort=')
  })

  it('shows nothing without a signed-in editor', async () => {
    expect(await ReviewDashboard({ payload: {}, user: undefined } as never)).toBeNull()
  })
})
