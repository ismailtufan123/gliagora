import { describe, expect, it } from 'vitest'

import { CONTENT_PAGES } from '@/lib/content'

import { sitemapIndexXml, sitemapXml, splitSitemap } from './sitemap'
import {
  type SitemapJob,
  institutionEntries,
  jobEntries,
  openJobsPer,
  pageEntries,
  subfieldEntries,
} from './sitemap-entries'

const NOW = new Date('2026-09-28T12:00:00Z')

const job = (shortId: string, fields: Partial<SitemapJob> = {}): SitemapJob => ({
  slug: `position-${shortId}`,
  shortId,
  status: 'published',
  deadlineKind: 'fixed',
  deadlineAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
  institution: 1,
  subfields: [10],
  ...fields,
})

const JOBS: SitemapJob[] = [
  job('aaaaa', { updatedAt: '2026-09-27T08:00:00.000Z' }),
  job('bbbbb', { deadlineKind: 'rolling', deadlineAt: null, institution: { id: 2 } }),
  job('ccccc', { deadlineKind: 'until-filled', deadlineAt: null, subfields: [10, 11, 10] }),
  // Closed: the deadline day ended, before the hourly check marks it expired.
  job('ddddd', { deadlineAt: '2026-09-28T11:59:59.000Z', updatedAt: '2026-09-28T11:00:00.000Z' }),
  job('eeeee', { status: 'expired', deadlineAt: '2026-09-18T00:00:00.000Z', institution: 3 }),
  job('fffff', { status: 'withdrawn', institution: 3 }),
  job('ggggg', { status: 'draft', institution: 3 }),
  job('hhhhh', { status: 'in_review', institution: 3 }),
  // Rolling, but marked as expired (filled early).
  job('jjjjj', { status: 'expired', deadlineKind: 'rolling', deadlineAt: null, institution: 3 }),
  // Every saved job has a slug; one without is left out rather than listed at a wrong address.
  job('kkkkk', { slug: null }),
]

describe('pageEntries', () => {
  it('lists the home page, the jobs list, Suggest a listing and the content pages that are not drafts', () => {
    const entries = pageEntries([])
    const published = Object.values(CONTENT_PAGES).filter((page) => !page.draft)
    expect(entries.map((entry) => entry.path)).toEqual([
      '/en/',
      '/en/jobs/',
      '/en/suggest/',
      ...published.map((page) => page.path),
    ])
    // Today only About is published (D28).
    expect(published.map((page) => page.path)).toEqual(['/en/about/'])
    expect(entries.find((entry) => entry.path === '/en/about/')?.lastmod).toBe(
      CONTENT_PAGES.about.updated,
    )
    // The home page and the lists change with the listings: no date is guessed for them.
    expect(entries.find((entry) => entry.path === '/en/')?.lastmod).toBeUndefined()
    expect(entries.find((entry) => entry.path === '/en/jobs/')?.lastmod).toBeUndefined()
  })

  it('never lists a draft text, a placeholder or a filtered list', () => {
    const paths = pageEntries([]).map((entry) => entry.path)
    for (const page of Object.values(CONTENT_PAGES).filter((p) => p.draft)) {
      expect(paths).not.toContain(page.path)
    }
    for (const path of ['/en/events/', '/en/map/', '/en/suggest/sent/', '/en/gone/']) {
      expect(paths).not.toContain(path)
    }
    expect(paths.some((path) => path.includes('?'))).toBe(false)
  })

  it('lists the subfield index once one of its hubs has its written introduction', () => {
    const hub = (hubIntro: string | null) => ({ slug: 'glia', hubIntro })
    expect(pageEntries([hub(null), hub('  \n ')]).map((e) => e.path)).not.toContain(
      '/en/subfields/',
    )
    expect(pageEntries([hub(null), hub('Glia are …')]).map((e) => e.path)).toContain(
      '/en/subfields/',
    )
  })

  it('gives no hreflang alternates while the translations are drafts', () => {
    expect(pageEntries([]).every((entry) => entry.alternates === undefined)).toBe(true)
  })
})

describe('jobEntries', () => {
  it('lists open jobs only, at their canonical addresses, last changed when saved', () => {
    expect(jobEntries(JOBS, NOW)).toEqual([
      { path: '/en/jobs/position-aaaaa-aaaaa/', lastmod: '2026-09-27T08:00:00.000Z' },
      { path: '/en/jobs/position-bbbbb-bbbbb/', lastmod: '2026-09-20T10:00:00.000Z' },
      { path: '/en/jobs/position-ccccc-ccccc/', lastmod: '2026-09-20T10:00:00.000Z' },
    ])
  })

  it('drops a job at the end of its deadline day', () => {
    const closing = job('mmmmm', { deadlineAt: '2026-09-28T12:00:00.000Z' })
    expect(jobEntries([closing], new Date('2026-09-28T11:59:59.999Z'))).toHaveLength(1)
    expect(jobEntries([closing], new Date('2026-09-28T12:00:00.000Z'))).toHaveLength(0)
  })

  it('is empty without open jobs', () => {
    expect(jobEntries([], NOW)).toEqual([])
  })
})

describe('openJobsPer', () => {
  it('counts the open jobs of each record once', () => {
    const perInstitution = openJobsPer(JOBS, NOW, (j) => [j.institution])
    expect([...perInstitution]).toEqual([
      [1, 3],
      [2, 1],
    ])
    const perSubfield = openJobsPer(JOBS, NOW, (j) => j.subfields ?? [])
    expect(perSubfield.get(10)).toBe(4)
    expect(perSubfield.get(11)).toBe(1)
  })
})

describe('institutionEntries', () => {
  const institutions = [
    { id: 1, slug: 'karolinska-institutet', rorId: '056d84691' },
    { id: 2, slug: 'example-lab', rorId: null, shortId: 'k3f9a' },
    // Only closed, withdrawn, draft and review jobs: not indexed, not listed.
    { id: 3, slug: 'no-open-jobs', rorId: '02h1nk258' },
    { id: 4, slug: 'no-jobs-at-all', rorId: '037mpqg03' },
  ]

  it('lists institutions with at least one open job, without lastmod', () => {
    const entries = institutionEntries(
      institutions,
      openJobsPer(JOBS, NOW, (j) => [j.institution]),
    )
    // Their pages list open positions with the days left: they change as deadlines pass.
    expect(entries).toEqual([
      { path: '/en/institutions/karolinska-institutet-056d84691/' },
      { path: '/en/institutions/example-lab-k3f9a/' },
    ])
  })

  it('is empty when no institution has open jobs', () => {
    expect(institutionEntries(institutions, new Map())).toEqual([])
  })
})

describe('subfieldEntries', () => {
  it('lists only hubs with their written introduction, without lastmod', () => {
    const subfields = [
      { slug: 'glia', hubIntro: 'Glia are …' },
      { slug: 'motor', hubIntro: '' },
      { slug: 'cognitive', hubIntro: 'Cognition …' },
    ]
    // A hub lists the open jobs of its subfield: it changes as deadlines pass.
    expect(subfieldEntries(subfields)).toEqual([
      { path: '/en/subfields/glia/' },
      { path: '/en/subfields/cognitive/' },
    ])
  })

  it('lists none while no hub has an introduction (M4: all hubs are skeletons)', () => {
    expect(subfieldEntries([{ slug: 'glia' }])).toEqual([])
  })
})

describe('lastmod when a job closes', () => {
  it('moves no date back in time, in the index or in any file', () => {
    // Both jobs are at institution 1 and in the glia hub; B, saved last, closes on 1 October.
    const jobs = [
      job('aaaaa', { updatedAt: '2026-09-20T10:00:00.000Z', deadlineAt: '2027-01-31T23:00:00Z' }),
      job('bbbbb', { updatedAt: '2026-09-25T10:00:00.000Z', deadlineAt: '2026-10-01T22:00:00Z' }),
    ]
    const institutions = [{ id: 1, slug: 'karolinska-institutet', rorId: '056d84691' }]
    const hubs = [{ slug: 'glia', hubIntro: 'Glia are …' }]
    const sitemaps = (now: Date) => {
      const perInstitution = openJobsPer(jobs, now, (j) => [j.institution])
      const files = [
        ...splitSitemap('pages', pageEntries(hubs)),
        ...splitSitemap('jobs', jobEntries(jobs, now)),
        ...splitSitemap('institutions', institutionEntries(institutions, perInstitution)),
        ...splitSitemap('subfields', subfieldEntries(hubs)),
      ]
      const xml = [sitemapIndexXml(files), ...files.map((file) => sitemapXml(file.entries))]
      // Every URL with its lastmod ('' when it has none), from the index and every file.
      return new Map(
        [...xml.join('').matchAll(/<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]+)<\/lastmod>)?/g)].map(
          ([, loc = '', lastmod = '']) => [loc, lastmod],
        ),
      )
    }
    const before = sitemaps(new Date('2026-09-28T12:00:00Z'))
    const after = sitemaps(new Date('2026-10-02T12:00:00Z'))
    expect(before.has('https://gliagora.com/en/jobs/position-bbbbb-bbbbb/')).toBe(true)
    expect(after.has('https://gliagora.com/en/jobs/position-bbbbb-bbbbb/')).toBe(false)
    for (const [loc, lastmod] of after) {
      const earlier = before.get(loc)
      if (earlier === undefined) continue
      if (earlier === '') expect(lastmod, loc).toBe('')
      else expect(Date.parse(lastmod), loc).toBeGreaterThanOrEqual(Date.parse(earlier))
    }
    // The files, the institution and the hub lost B: they carry no date that could show it.
    for (const loc of [
      'https://gliagora.com/sitemaps/jobs.xml',
      'https://gliagora.com/sitemaps/institutions.xml',
      'https://gliagora.com/en/institutions/karolinska-institutet-056d84691/',
      'https://gliagora.com/en/subfields/glia/',
    ]) {
      expect(after.get(loc), loc).toBe('')
    }
  })
})
