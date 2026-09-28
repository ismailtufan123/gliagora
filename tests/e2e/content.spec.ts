import { expect, test } from '@playwright/test'

// Long-form pages from content/ (About, legal texts): draft texts are marked as drafts and not
// indexed, and every link to another page of the site leads somewhere (CLAUDE.md, D28).

const DRAFTS = [
  '/en/contact/',
  '/tr/iletisim/',
  '/en/legal/privacy/',
  '/tr/legal/kvkk-aydinlatma-metni/',
  '/tr/legal/acik-riza-metni/',
  '/en/legal/cookies/',
  '/en/legal/terms/',
  '/en/legal/takedown/',
  '/en/legal/data-requests/',
]
const CONTENT = ['/en/about/', ...DRAFTS]

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

  test('the sitemap lists no draft or placeholder', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text()
    expect(xml).toContain('<loc>https://gliagora.com/en/</loc>')
    expect(xml).toContain('<loc>https://gliagora.com/en/about/</loc>')
    expect(xml).toContain('<loc>https://gliagora.com/en/suggest/</loc>')
    for (const path of [...DRAFTS, '/en/jobs/', '/en/gone/', '/en/suggest/sent/']) {
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
