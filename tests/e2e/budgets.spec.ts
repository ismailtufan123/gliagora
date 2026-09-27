import { gzipSync } from 'node:zlib'

import { type APIRequestContext, expect, test } from '@playwright/test'

import { PAGES } from './pages'

// PLAN §17.3: size budgets for every template. JavaScript counts what modern browsers load
// (scripts marked noModule are only for old browsers). Measured at M1: 135 KB of JavaScript,
// of which about 132 KB is React and Next.js themselves.
const BUDGET_KB = { js: 140, css: 35, html: 60, fonts: 120 }
const MAX_PRELOADED_FONTS = 4

async function size(request: APIRequestContext, url: string, gzip: boolean) {
  const body = await (await request.get(url)).body()
  return (gzip ? gzipSync(body).length : body.length) / 1024
}

test.describe('size budgets', () => {
  test.skip(({ isMobile }) => isMobile, 'sizes do not depend on the device')

  for (const page of PAGES) {
    test(`${page.name} stays within the budgets`, async ({ request }) => {
      const html = await (await request.get(page.path)).text()
      const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"[^>]*>/g)]
        .filter((match) => !/noModule/i.test(match[0]))
        .map((match) => match[1]!)
      const styles = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(
        (match) => match[1]!,
      )
      const fonts = [...html.matchAll(/<link rel="preload" href="([^"]+\.woff2)"/g)].map(
        (match) => match[1]!,
      )

      let js = 0
      for (const src of new Set(scripts)) js += await size(request, src, true)
      let css = 0
      for (const href of new Set(styles)) css += await size(request, href, true)
      let fontKb = 0
      for (const href of new Set(fonts)) fontKb += await size(request, href, false)

      expect(js, 'JavaScript, KB gzip').toBeLessThanOrEqual(BUDGET_KB.js)
      expect(css, 'CSS, KB gzip').toBeLessThanOrEqual(BUDGET_KB.css)
      expect(gzipSync(html).length / 1024, 'HTML, KB gzip').toBeLessThanOrEqual(BUDGET_KB.html)
      expect(new Set(fonts).size, 'preloaded fonts').toBeLessThanOrEqual(MAX_PRELOADED_FONTS)
      expect(fontKb, 'preloaded fonts, KB').toBeLessThanOrEqual(BUDGET_KB.fonts)
    })
  }
})
