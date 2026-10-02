import { expect, test } from '@playwright/test'

import { CONTENT_PAGES } from '../../src/lib/content'

// Long-form pages from content/ (About, legal texts): draft texts are marked as drafts and not
// indexed, and every link to another page of the site leads somewhere (CLAUDE.md, D28).

// From the texts' own draft flags, so that approving a text (draft: false) needs no change here.
const DRAFTS = Object.values(CONTENT_PAGES)
  .filter((page) => page.draft)
  .map((page) => page.path)
const CONTENT = Object.values(CONTENT_PAGES).map((page) => page.path)

test.describe('content pages', () => {
  test.skip(({ isMobile }) => isMobile, 'these checks do not depend on the device')

  for (const path of DRAFTS) {
    test(`${path} is shown as a draft and not indexed`, async ({ request }) => {
      const html = await (await request.get(path)).text()
      expect(html).toContain('class="draft-notice"')
      expect(html).toContain('<meta name="robots" content="noindex"')
    })
  }

  for (const path of DRAFTS) {
    test(`${path} has its canonical link and no hreflang while it is a draft`, async ({
      request,
    }) => {
      const html = await (await request.get(path)).text()
      expect(html).toContain(`<link rel="canonical" href="https://gliagora.com${path}"/>`)
      expect(html).not.toContain('rel="alternate" hrefLang')
    })
  }

  test('home and About carry Organization and WebSite data, and pages name the site', async ({
    request,
  }) => {
    for (const path of ['/en/', '/en/about/']) {
      const html = await (await request.get(path)).text()
      expect(html).toContain('"@type":"Organization"')
      expect(html).toContain('"@type":"WebSite"')
      expect(html).toContain('<meta property="og:site_name" content="Gliagora | Neuroscience"/>')
    }
  })

  test('robots.txt keeps crawlers out of the admin and the API', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).toContain('Disallow: /admin')
    expect(robots).toContain('Disallow: /api')
    expect(robots).toContain('Sitemap: https://gliagora.com/sitemap.xml')
  })

  test('the sitemaps list no draft or placeholder', async ({ request }) => {
    // /sitemap.xml is an index of the files under /sitemaps/ (tests/e2e/seo.spec.ts).
    const index = await (await request.get('/sitemap.xml')).text()
    const files = [...index.matchAll(/<loc>https:\/\/gliagora\.com([^<]+)<\/loc>/g)].map(
      (match) => match[1]!,
    )
    expect(files).toContain('/sitemaps/pages.xml')
    let xml = ''
    for (const file of files) xml += await (await request.get(file)).text()
    expect(xml).toContain('<loc>https://gliagora.com/en/</loc>')
    expect(xml).toContain('<loc>https://gliagora.com/en/about/</loc>')
    expect(xml).toContain('<loc>https://gliagora.com/en/suggest/</loc>')
    for (const path of [...DRAFTS, '/en/events/', '/en/gone/', '/en/suggest/sent/']) {
      expect(xml).not.toContain(`<loc>https://gliagora.com${path}</loc>`)
    }
  })

  for (const path of CONTENT) {
    test(`${path}: every link to this site leads to a page`, async ({ page, request }) => {
      await page.goto(path)
      const hrefs = await page
        .locator('main a[href^="/"]')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
      for (const href of new Set(hrefs)) {
        expect((await request.get(href)).status(), href).toBe(200)
      }
    })
  }
})
