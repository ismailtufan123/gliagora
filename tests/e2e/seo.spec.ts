import { type APIRequestContext, type Page, expect, test } from '@playwright/test'

import { disallowRules, isDisallowed } from '../../src/lib/seo/robots'
import { FIXED_JOBS, jobPath } from '../../src/scripts/fake-jobs-fixed'

// Sitemaps, the jobs feed and robots.txt (PLAN §2.2, §2.5, §16.1) on the running app with the fake
// data (pnpm fake:jobs) and the ROR test institutions. The central check: every URL the sitemaps
// list answers 200, is not `noindex` and names itself as canonical, and robots.txt lets crawlers
// fetch it.

const ORIGIN = 'https://gliagora.com'
/** The fake data lists about 65 pages; more than this would mean the data is not what it seems. */
const MAX_CHECKED = 200

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!)
const pathOf = (url: string) => {
  expect(url.startsWith(`${ORIGIN}/`), url).toBe(true)
  return url.slice(ORIGIN.length)
}

/** Parses XML in the browser: the root element's name, or the parser's error. */
const parseXml = (page: Page, xml: string) =>
  page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml')
    const error = doc.querySelector('parsererror')
    return { error: error?.textContent ?? null, root: doc.documentElement.nodeName }
  }, xml)

async function getXml(request: APIRequestContext, path: string, type = 'application/xml') {
  const response = await request.get(path, { maxRedirects: 0 })
  expect(response.status(), path).toBe(200)
  expect(response.headers()['content-type'], path).toBe(`${type}; charset=utf-8`)
  expect(response.headers()['cache-control'], path).toBe('public, max-age=3600')
  return response.text()
}

/** Every sitemap file the index lists, with the URLs it lists. */
async function sitemaps(request: APIRequestContext): Promise<Map<string, string[]>> {
  const files = new Map<string, string[]>()
  for (const url of locs(await getXml(request, '/sitemap.xml'))) {
    files.set(pathOf(url), locs(await getXml(request, pathOf(url))))
  }
  return files
}

test.describe('sitemaps', () => {
  test.skip(({ isMobile }) => isMobile, 'machine files do not depend on the device')

  test('/sitemap.xml is an index of the type sitemaps, as well-formed XML', async ({
    page,
    request,
  }) => {
    const xml = await getXml(request, '/sitemap.xml')
    expect(await parseXml(page, xml)).toEqual({ error: null, root: 'sitemapindex' })
    const files = locs(xml).map(pathOf)
    expect(files).toEqual([
      '/sitemaps/pages.xml',
      '/sitemaps/jobs.xml',
      '/sitemaps/institutions.xml',
    ])
    for (const path of files) {
      const file = await getXml(request, path)
      expect(await parseXml(page, file)).toEqual({ error: null, root: 'urlset' })
      // The schema asks a urlset for at least one URL.
      expect(locs(file).length, path).toBeGreaterThan(0)
    }
    // A file also changes when a page leaves it, which its pages' dates cannot show.
    expect(xml).not.toContain('<lastmod>')
  })

  test('the subfields sitemap answers 404 while no hub has its introduction, and is not in the index', async ({
    request,
  }) => {
    const response = await request.get('/sitemaps/subfields.xml', { maxRedirects: 0 })
    expect(response.status()).toBe(404)
    expect(await (await request.get('/sitemap.xml')).text()).not.toContain('subfields.xml')
  })

  test('the pages sitemap lists the home page, the jobs list and About, and no draft', async ({
    request,
  }) => {
    const paths = locs(await getXml(request, '/sitemaps/pages.xml')).map(pathOf)
    expect(paths).toEqual(['/en/', '/en/jobs/', '/en/suggest/', '/en/about/'])
  })

  test('the jobs sitemap lists the open jobs, and no closed, gone, withdrawn or draft one', async ({
    request,
  }) => {
    const xml = await getXml(request, '/sitemaps/jobs.xml')
    const paths = locs(xml).map(pathOf)
    for (const job of [FIXED_JOBS.open, FIXED_JOBS.rolling]) {
      expect(paths).toContain(jobPath(job))
    }
    for (const job of [
      FIXED_JOBS.expiredRecently,
      FIXED_JOBS.expiredLongAgo,
      FIXED_JOBS.withdrawn,
      FIXED_JOBS.draft,
    ]) {
      expect(xml).not.toContain(`-${job.shortId}/`)
    }
    // Every job has the date it was last saved.
    expect(xml.match(/<lastmod>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/lastmod>/g)).toHaveLength(
      paths.length,
    )
  })

  test('the institutions sitemap lists institutions with open jobs only', async ({ request }) => {
    const xml = await getXml(request, '/sitemaps/institutions.xml')
    // Their pages list open positions with the days left, so they change as deadlines pass.
    expect(xml).not.toContain('<lastmod>')
    const paths = locs(xml).map(pathOf)
    expect(paths.some((path) => path.endsWith(`-${FIXED_JOBS.open.institutionRorId}/`))).toBe(true)
    // In the ROR test data, but no fake jobs are placed there.
    expect(paths.some((path) => path.includes('037mpqg03'))).toBe(false)
    for (const path of paths) expect(path).toMatch(/^\/en\/institutions\/[a-z0-9-]+-[a-z0-9]+\/$/)
  })

  test('every listed URL answers 200, is indexed, names itself as canonical and may be crawled', async ({
    request,
  }) => {
    test.setTimeout(180_000)
    const robots = disallowRules(await (await request.get('/robots.txt')).text())
    const urls = [...(await sitemaps(request)).values()].flat()
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.length).toBeLessThanOrEqual(MAX_CHECKED)
    expect(new Set(urls).size, 'no URL is listed twice').toBe(urls.length)
    for (const url of urls) {
      const path = pathOf(url)
      expect(isDisallowed(path, robots), `${path} is disallowed by robots.txt`).toBe(false)
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status(), path).toBe(200)
      const html = await response.text()
      expect(html, path).not.toMatch(/<meta name="robots" content="[^"]*noindex/)
      expect(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1], path).toBe(url)
    }
  })

  test('draft legal texts and placeholders are in no sitemap', async ({ request }) => {
    const listed = [...(await sitemaps(request)).values()].flat().map(pathOf)
    for (const path of [
      '/en/contact/',
      '/tr/iletisim/',
      '/en/legal/privacy/',
      '/en/legal/terms/',
      '/tr/legal/kvkk-aydinlatma-metni/',
      '/en/events/',
      '/en/suggest/sent/',
      '/en/subfields/',
      '/en/gone/',
    ]) {
      expect(listed).not.toContain(path)
    }
  })
})

test.describe('jobs feed', () => {
  test.skip(({ isMobile }) => isMobile, 'machine files do not depend on the device')

  test('/en/jobs/feed.xml is RSS 2.0 of open jobs, linking to their pages', async ({
    page,
    request,
  }) => {
    const xml = await getXml(request, '/en/jobs/feed.xml', 'application/rss+xml')
    expect(await parseXml(page, xml)).toEqual({ error: null, root: 'rss' })
    expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">')
    expect(xml).toContain(
      `<atom:link href="${ORIGIN}/en/jobs/feed.xml" rel="self" type="application/rss+xml"/>`,
    )
    expect(xml).toContain(`<link>${ORIGIN}/en/jobs/</link>`)
    expect(xml).toContain('<language>en</language>')
    // It would move back in time when a job leaves the feed.
    expect(xml).not.toContain('lastBuildDate')
    const open = FIXED_JOBS.open
    expect(xml).toContain(`<title>${open.title}</title>`)
    expect(xml).toContain(`<link>${ORIGIN}${jobPath(open)}</link>`)
    expect(xml).toContain(`<guid isPermaLink="true">${ORIGIN}/en/jobs/${open.shortId}/</guid>`)
    for (const job of [
      FIXED_JOBS.expiredRecently,
      FIXED_JOBS.expiredLongAgo,
      FIXED_JOBS.withdrawn,
      FIXED_JOBS.draft,
    ]) {
      expect(xml).not.toContain(job.title)
    }
    const items = xml.match(/<item>/g) ?? []
    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThanOrEqual(50)
    expect(
      xml.match(
        /<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT<\/pubDate>/g,
      ),
    ).toHaveLength(items.length)
  })

  test('each item links to a job page that is open and indexed, and its guid leads there', async ({
    request,
  }) => {
    const xml = await getXml(request, '/en/jobs/feed.xml', 'application/rss+xml')
    const item =
      /<item>[\s\S]*?<link>([^<]+)<\/link>\s*<guid isPermaLink="true">([^<]+)<\/guid>/.exec(xml)
    expect(item).not.toBeNull()
    const [, link = '', guid = ''] = item ?? []
    const html = await (await request.get(pathOf(link), { maxRedirects: 0 })).text()
    expect(html).not.toContain('This position has closed')
    expect(html).not.toMatch(/<meta name="robots" content="[^"]*noindex/)
    const redirect = await request.get(pathOf(guid), { maxRedirects: 0 })
    expect(redirect.status()).toBe(308)
    expect(new URL(redirect.headers()['location']!, ORIGIN).pathname).toBe(pathOf(link))
  })

  test('the jobs list links to the feed', async ({ request }) => {
    for (const path of ['/en/jobs/', '/en/jobs/?type=phd']) {
      const html = await (await request.get(path)).text()
      expect(html).toContain(
        `<link rel="alternate" type="application/rss+xml" href="${ORIGIN}/en/jobs/feed.xml" title="Latest neuroscience positions"/>`,
      )
    }
  })
})

test.describe('robots.txt', () => {
  test.skip(({ isMobile }) => isMobile, 'machine files do not depend on the device')

  test('keeps crawlers out of the admin, the API, search and filtered URLs, and names the sitemap', async ({
    request,
  }) => {
    const response = await request.get('/robots.txt', { maxRedirects: 0 })
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toMatch(/^text\/plain/)
    const text = await response.text()
    expect(disallowRules(text)).toEqual(['/admin', '/api', '/en/search/', '/*?'])
    expect(text).not.toMatch(/^Allow:/m)
    expect(text).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`)
    for (const path of ['/en/jobs/?type=phd', '/en/jobs/?page=2', '/admin', '/api/jobs']) {
      expect(isDisallowed(path, disallowRules(text)), path).toBe(true)
    }
    for (const path of ['/sitemap.xml', '/sitemaps/jobs.xml', '/en/jobs/feed.xml', '/en/jobs/']) {
      expect(isDisallowed(path, disallowRules(text)), path).toBe(false)
    }
  })
})
