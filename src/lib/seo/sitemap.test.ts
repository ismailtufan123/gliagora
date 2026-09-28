import { describe, expect, it } from 'vitest'

import {
  MAX_SITEMAP_URLS,
  type SitemapEntry,
  parseSitemapFileName,
  sitemapFileEntries,
  sitemapFileName,
  sitemapIndexXml,
  sitemapXml,
  splitSitemap,
} from './sitemap'

const jobs = (count: number): SitemapEntry[] =>
  Array.from({ length: count }, (_, index) => ({ path: `/en/jobs/job-${index}/` }))

describe('sitemap file names', () => {
  it('leave out English and page 1', () => {
    expect(sitemapFileName({ type: 'jobs', locale: 'en', page: 1 })).toBe('jobs.xml')
    expect(sitemapFileName({ type: 'jobs', locale: 'en', page: 2 })).toBe('jobs-2.xml')
    expect(sitemapFileName({ type: 'pages', locale: 'tr', page: 1 })).toBe('pages-tr.xml')
    expect(sitemapFileName({ type: 'pages', locale: 'tr', page: 3 })).toBe('pages-tr-3.xml')
  })

  it.each([
    ['pages.xml', { type: 'pages', locale: 'en', page: 1 }],
    ['jobs-2.xml', { type: 'jobs', locale: 'en', page: 2 }],
    ['institutions-12.xml', { type: 'institutions', locale: 'en', page: 12 }],
    ['pages-tr.xml', { type: 'pages', locale: 'tr', page: 1 }],
    ['subfields-tr-2.xml', { type: 'subfields', locale: 'tr', page: 2 }],
  ])('read %s back', (name, key) => {
    expect(parseSitemapFileName(name)).toEqual(key)
    expect(sitemapFileName(key as never)).toBe(name)
  })

  it.each([
    'jobs',
    'jobs.XML',
    'Jobs.xml',
    'events.xml',
    // One address per file: page 1 and English have no other spelling.
    'jobs-1.xml',
    'jobs-01.xml',
    'jobs-en.xml',
    'jobs-0.xml',
    'jobs-de.xml',
    'jobs-2-tr.xml',
    'jobs-9999999.xml',
    'sitemap.xml',
  ])('name no file: %s', (name) => {
    expect(parseSitemapFileName(name)).toBeNull()
  })
})

describe('splitSitemap', () => {
  it('keeps a type in one file up to 50,000 URLs, and starts a second file after that', () => {
    expect(MAX_SITEMAP_URLS).toBe(50_000)
    const one = splitSitemap('jobs', jobs(50_000))
    expect(one.map(({ page, entries }) => [page, entries.length])).toEqual([[1, 50_000]])
    const two = splitSitemap('jobs', jobs(50_001))
    expect(two.map(({ page, entries }) => [page, entries.length])).toEqual([
      [1, 50_000],
      [2, 1],
    ])
    expect(two[1]?.entries[0]?.path).toBe('/en/jobs/job-50000/')
  })

  it('cuts into files of at most `max` URLs, in the order given', () => {
    const files = splitSitemap('jobs', jobs(7), 3)
    expect(files.map((file) => sitemapFileName(file))).toEqual([
      'jobs.xml',
      'jobs-2.xml',
      'jobs-3.xml',
    ])
    expect(files.map((file) => file.entries.map((entry) => entry.path.slice(9, -1)))).toEqual([
      ['job-0', 'job-1', 'job-2'],
      ['job-3', 'job-4', 'job-5'],
      ['job-6'],
    ])
  })

  it('gives each locale its own files (PLAN §12)', () => {
    const files = splitSitemap('pages', [
      { path: '/en/' },
      { path: '/tr/iletisim/' },
      { path: '/en/about/' },
      { path: '/tr/legal/kvkk-aydinlatma-metni/' },
    ])
    expect(files.map((file) => [sitemapFileName(file), file.entries.map((e) => e.path)])).toEqual([
      ['pages.xml', ['/en/', '/en/about/']],
      ['pages-tr.xml', ['/tr/iletisim/', '/tr/legal/kvkk-aydinlatma-metni/']],
    ])
  })

  it('makes no empty file: the schema asks a urlset for at least one URL', () => {
    expect(splitSitemap('subfields', [])).toEqual([])
    expect(
      splitSitemap('pages', [{ path: '/tr/iletisim/' }]).map((f) => sitemapFileName(f)),
    ).toEqual(['pages-tr.xml'])
    for (const count of [1, 2, 3, 6, 7]) {
      expect(splitSitemap('jobs', jobs(count), 3).every((f) => f.entries.length > 0)).toBe(true)
    }
  })
})

describe('sitemapFileEntries', () => {
  const key = (page: number, locale: 'en' | 'tr' = 'en') => ({
    type: 'jobs' as const,
    locale,
    page,
  })
  const paths = (entries: SitemapEntry[] | null) => entries?.map((entry) => entry.path) ?? null

  it('answers the files that exist', () => {
    const files = splitSitemap('jobs', jobs(50_001))
    expect(sitemapFileEntries(files, key(1))).toHaveLength(50_000)
    expect(paths(sitemapFileEntries(files, key(2)))).toEqual(['/en/jobs/job-50000/'])
  })

  it('answers the file after the last one with its last entry, when jobs close after the index was read', () => {
    // The index listed jobs.xml and jobs-2.xml at 50,001 jobs; two close before jobs-2.xml is
    // read. Its job has moved back to the end of jobs.xml, and jobs-2.xml still answers with it.
    const all = jobs(50_001)
    const files = splitSitemap('jobs', [...all.slice(0, 10), ...all.slice(12)])
    expect(files).toHaveLength(1)
    expect(paths(sitemapFileEntries(files, key(2)))).toEqual(['/en/jobs/job-50000/'])
    expect(sitemapFileEntries(files, key(3))).toBeNull()
  })

  it('names nothing for a locale or a type without files', () => {
    const files = splitSitemap('jobs', jobs(3))
    expect(sitemapFileEntries(files, key(1, 'tr'))).toBeNull()
    expect(sitemapFileEntries(files, key(2, 'tr'))).toBeNull()
    expect(sitemapFileEntries([], key(1))).toBeNull()
    expect(sitemapFileEntries([], key(2))).toBeNull()
  })
})

const isWellFormedUrlset = (xml: string) =>
  xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset ') && xml.endsWith('</urlset>\n')

describe('sitemapXml', () => {
  it('writes absolute URLs, lastmod in W3C format and hreflang alternates', () => {
    const xml = sitemapXml([
      { path: '/en/' },
      { path: '/en/about/', lastmod: '2026-09-27' },
      { path: '/en/jobs/phd-test1/', lastmod: '2026-09-28T00:28:46.928Z' },
      {
        path: '/en/contact/',
        alternates: {
          en: 'https://gliagora.com/en/contact/',
          tr: 'https://gliagora.com/tr/iletisim/',
          'x-default': 'https://gliagora.com/en/contact/',
        },
      },
    ])
    expect(isWellFormedUrlset(xml)).toBe(true)
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    )
    expect(xml).toContain('  <url>\n    <loc>https://gliagora.com/en/</loc>\n  </url>')
    expect(xml).toContain(
      '<loc>https://gliagora.com/en/about/</loc>\n    <lastmod>2026-09-27</lastmod>',
    )
    expect(xml).toContain('<lastmod>2026-09-28T00:28:46Z</lastmod>')
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="tr" href="https://gliagora.com/tr/iletisim/"/>',
    )
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://gliagora.com/en/contact/"/>',
    )
    expect(xml.match(/<url>/g)).toHaveLength(4)
  })

  it('declares the xhtml namespace only when a page has alternates', () => {
    expect(sitemapXml([{ path: '/en/' }])).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    )
  })

  it('escapes and percent-encodes what it writes', () => {
    const xml = sitemapXml([
      { path: '/en/jobs/?a=1&b=2' },
      { path: '/en/über/', alternates: { en: 'https://gliagora.com/en/?x="1"&y=<2>' } },
    ])
    expect(xml).toContain('<loc>https://gliagora.com/en/jobs/?a=1&amp;b=2</loc>')
    expect(xml).toContain('<loc>https://gliagora.com/en/%C3%BCber/</loc>')
    expect(xml).toContain('href="https://gliagora.com/en/?x=&quot;1&quot;&amp;y=&lt;2&gt;"')
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/)
  })

  it('leaves out a lastmod that is not a date rather than fail', () => {
    const xml = sitemapXml([{ path: '/en/', lastmod: 'yesterday' }])
    expect(xml).not.toContain('<lastmod>')
  })
})

describe('sitemapIndexXml', () => {
  it('lists every file with pages, without lastmod', () => {
    const xml = sitemapIndexXml([
      ...splitSitemap('pages', [{ path: '/en/' }, { path: '/en/about/', lastmod: '2026-09-27' }]),
      ...splitSitemap(
        'jobs',
        [
          { path: '/en/jobs/a-aaaaa/', lastmod: '2026-09-28T10:00:00.000Z' },
          { path: '/en/jobs/b-bbbbb/', lastmod: '2026-09-28T12:30:00.000Z' },
          { path: '/en/jobs/c-ccccc/', lastmod: '2026-09-20T08:00:00.000Z' },
        ],
        2,
      ),
      ...splitSitemap('institutions', [{ path: '/en/institutions/x-05dxps055/' }]),
      ...splitSitemap('subfields', []),
    ])
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex ')).toBe(true)
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml.match(/<loc>[^<]+<\/loc>/g)).toEqual([
      '<loc>https://gliagora.com/sitemaps/pages.xml</loc>',
      '<loc>https://gliagora.com/sitemaps/jobs.xml</loc>',
      '<loc>https://gliagora.com/sitemaps/jobs-2.xml</loc>',
      '<loc>https://gliagora.com/sitemaps/institutions.xml</loc>',
    ])
    // A file also changes when a page leaves it, which the dates of its pages cannot show.
    expect(xml).not.toContain('<lastmod>')
    expect(xml).toContain('<loc>https://gliagora.com/sitemaps/institutions.xml</loc>\n  </sitemap>')
    expect(xml.endsWith('</sitemapindex>\n')).toBe(true)
  })

  it('is a well-formed empty index when nothing is listed', () => {
    expect(sitemapIndexXml(splitSitemap('jobs', []))).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</sitemapindex>\n',
    )
  })
})
