import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { SourcesSummary } from '@/lib/sources/dashboard'

import { SourcesDashboardView } from './SourcesDashboard'

const now = new Date('2026-10-20T09:00:00.000Z')
const links = {
  list: (collection: string, where?: unknown) =>
    `/admin/collections/${collection}?where=${JSON.stringify(where)}`,
  doc: (collection: string, id: number | string) => `/admin/collections/${collection}/${id}`,
}
const summary: SourcesSummary = {
  found: { total: 5, bySource: [{ id: 3, name: 'Example Institute vacancies', count: 4 }] },
  attention: { total: 1, rows: [{ id: 9, name: 'Example list', note: 'its last 3 runs failed' }] },
  manualDue: {
    total: 2,
    rows: [
      {
        id: 11,
        name: 'Example careers (manual)',
        url: 'https://www.example.org/careers/',
        note: 'never looked at',
      },
    ],
  },
  links: { gone: 1, broken: 0, saysClosed: 2 },
}
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"')

describe('SourcesDashboardView', () => {
  const html = renderToStaticMarkup(createElement(SourcesDashboardView, { summary, links, now }))

  it('shows the new candidates by source, the sources that need attention and the manual ones due', () => {
    expect(text(html)).toContain('New candidates from sources: 5')
    expect(text(html)).toContain('Example Institute vacancies: 4')
    expect(text(html)).toContain('Example list – its last 3 runs failed')
    expect(text(html)).toContain('Example careers (manual) (open the page) – never looked at')
    expect(html).toContain('href="https://www.example.org/careers/"')
    expect(html).toContain('href="/admin/collections/sources/9"')
  })

  it("shows the link check's findings, each linking to its jobs", () => {
    expect(text(html)).toContain('Page gone: 1 job')
    expect(text(html)).toContain('Page says the position is filled or closed: 2 jobs')
    expect(html.replace(/&quot;/g, '"')).toContain('"linkSaysClosed":{"equals":true}')
  })
})
