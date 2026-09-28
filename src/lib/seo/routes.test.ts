import { afterEach, describe, expect, it, vi } from 'vitest'

import { GET as feed } from '@/app/(frontend)/en/jobs/feed.xml/route'
import { GET as sitemapIndex } from '@/app/sitemap.xml/route'
import { GET as sitemapFile } from '@/app/sitemaps/[file]/route'

import type { FeedJob } from './feed'
import type { SitemapEntry } from './sitemap'

// The route handlers of the machine files: media types, cache headers, 404 for names that are no
// file, and 503 (not 500) while the database cannot be reached. What they list is tested with
// the builders; the live files are checked end to end (tests/e2e/seo.spec.ts).

const database = { down: false }

const read = (entries: SitemapEntry[]) => async () => {
  if (database.down) throw new Error('connect ECONNREFUSED 127.0.0.1:5432')
  return entries
}

vi.mock('@/lib/seo/sitemap-data', () => ({
  sitemapSource: () => ({
    pages: read([{ path: '/en/' }, { path: '/en/about/', lastmod: '2026-09-27' }]),
    jobs: read([{ path: '/en/jobs/phd-test1/', lastmod: '2026-09-28T00:28:46.928Z' }]),
    institutions: read([]),
    subfields: read([]),
  }),
}))

const OPEN_JOB: FeedJob = {
  id: 1,
  shortId: 'test1',
  path: '/en/jobs/phd-test1/',
  title: 'PhD position in astrocyte–neuron signalling',
  originalLanguage: 'en',
  institution: { id: 1, name: 'Karolinska Institutet', path: '/en/i/', urlId: '056d84691' },
  city: 'Solna',
  country: 'Sweden',
  positionType: null,
  subfields: [],
  methods: [],
  modelSystems: [],
  originalUrl: null,
  status: 'published',
  deadlineKind: 'rolling',
  deadlineDate: null,
  deadlineTz: null,
  deadlineAt: null,
  expiredAt: null,
  withdrawnAt: null,
  summary: 'Our summary.',
  publishedAt: '2026-09-20T09:00:00.000Z',
}

vi.mock('@/lib/records', () => ({
  latestOpenJobs: async () => {
    if (database.down) throw new Error('connect ECONNREFUSED 127.0.0.1:5432')
    return [OPEN_JOB]
  },
}))

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl')
  const messages = (await import('../../../messages/en.json')).default
  return {
    getTranslations: async ({ namespace }: { namespace?: string }) =>
      createTranslator({ locale: 'en', messages, namespace: namespace as never }),
  }
})

const file = (name: string) =>
  sitemapFile(new Request(`http://localhost/sitemaps/${name}`), {
    params: Promise.resolve({ file: name }),
  })

afterEach(() => {
  database.down = false
  vi.restoreAllMocks()
})

describe('sitemap routes', () => {
  it('answer the index as XML that crawlers may keep for an hour', async () => {
    const response = await sitemapIndex()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
    const xml = await response.text()
    expect(xml).toContain('<loc>https://gliagora.com/sitemaps/pages.xml</loc>')
    expect(xml).toContain('<loc>https://gliagora.com/sitemaps/jobs.xml</loc>')
    // Types without pages have no file.
    expect(xml).not.toContain('institutions.xml')
    expect(xml).not.toContain('subfields.xml')
    // A file also changes when a page leaves it, which its pages' dates cannot show.
    expect(xml).not.toContain('<lastmod>')
  })

  it('answer a type file with its pages', async () => {
    const jobs = await file('jobs.xml')
    expect(jobs.status).toBe(200)
    expect(jobs.headers.get('content-type')).toBe('application/xml; charset=utf-8')
    expect(await jobs.text()).toContain('<loc>https://gliagora.com/en/jobs/phd-test1/</loc>')
  })

  it('answer the file after a type’s last one with that file’s last page, for older indexes', async () => {
    const next = await file('jobs-2.xml')
    expect(next.status).toBe(200)
    const xml = await next.text()
    expect(xml.match(/<loc>[^<]+<\/loc>/g)).toEqual([
      '<loc>https://gliagora.com/en/jobs/phd-test1/</loc>',
    ])
  })

  it.each([
    // A type without pages: the schema asks a urlset for at least one URL.
    'subfields.xml',
    'subfields-2.xml',
    'jobs-3.xml',
    'pages-tr.xml',
    'events.xml',
    'jobs-1.xml',
    'jobs',
  ])('answer 404 for %s, which names no file now', async (name) => {
    const response = await file(name)
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toContain('no-store')
    // The text comes from the messages, like every text people may read.
    expect(await response.text()).toBe('Page not found')
  })

  it('answer 503 with Retry-After while the database cannot be reached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    database.down = true
    for (const response of [await sitemapIndex(), await file('jobs.xml')]) {
      expect(response.status).toBe(503)
      expect(response.headers.get('retry-after')).toBe('120')
      expect(response.headers.get('cache-control')).toContain('no-store')
    }
  })
})

describe('jobs feed route', () => {
  it('answers RSS with the channel texts from the messages', async () => {
    const response = await feed()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
    const xml = await response.text()
    expect(xml).toContain('<title>Latest neuroscience positions – Gliagora | Neuroscience</title>')
    expect(xml).toContain('<link>https://gliagora.com/en/jobs/</link>')
    expect(xml).toContain('<link>https://gliagora.com/en/jobs/phd-test1/</link>')
    expect(xml).toContain(
      '<description>Our summary. Institution: Karolinska Institutet. Location: Solna, Sweden. Rolling deadline.</description>',
    )
    // No lastBuildDate: it would move back in time when a job leaves the feed.
    expect(xml).not.toContain('lastBuildDate')
  })

  it('answers 503 with Retry-After while the database cannot be reached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    database.down = true
    const response = await feed()
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('120')
  })
})
