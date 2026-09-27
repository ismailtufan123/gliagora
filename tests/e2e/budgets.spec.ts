import { gzipSync } from 'node:zlib'

import { type Response, expect, test } from '@playwright/test'

import { PAGES } from './pages'

// PLAN §17.3: size budgets for every template, measured from what the browser actually
// downloads (so scripts added by next/script or next/dynamic count too, and the noModule
// polyfill that modern browsers skip does not). Measured at M1: 135 KB of JavaScript, of which
// about 132 KB is React and Next.js themselves.
const BUDGET_KB = { script: 140, stylesheet: 35, html: 60, font: 120 }
const MAX_PRELOADED_FONTS = 4
const MAX_FONT_FAMILIES = 2

type Kind = 'script' | 'stylesheet' | 'font'
const KINDS: Kind[] = ['script', 'stylesheet', 'font']

test.describe('size budgets', () => {
  test.skip(({ isMobile }) => isMobile, 'sizes do not depend on the device')

  for (const template of PAGES) {
    test(`${template.name} stays within the budgets`, async ({ page }) => {
      const responses: Response[] = []
      page.on('response', (response) => {
        if ((KINDS as string[]).includes(response.request().resourceType()))
          responses.push(response)
      })
      const main = await page.goto(template.path, { waitUntil: 'networkidle' })

      const kb: Record<Kind, number> = { script: 0, stylesheet: 0, font: 0 }
      const seen = new Set<string>()
      for (const response of responses) {
        if (seen.has(response.url())) continue
        seen.add(response.url())
        expect(response.ok(), response.url()).toBe(true)
        const kind = response.request().resourceType() as Kind
        const body = await response.body()
        // Scripts and styles are served compressed; font files are already compressed.
        kb[kind] += (kind === 'font' ? body.length : gzipSync(body).length) / 1024
      }
      const htmlKb = gzipSync(await main!.body()).length / 1024

      expect(kb.script, 'JavaScript, KB gzip').toBeLessThanOrEqual(BUDGET_KB.script)
      expect(kb.stylesheet, 'CSS, KB gzip').toBeLessThanOrEqual(BUDGET_KB.stylesheet)
      expect(htmlKb, 'HTML, KB gzip').toBeLessThanOrEqual(BUDGET_KB.html)
      expect(kb.font, 'fonts, KB').toBeLessThanOrEqual(BUDGET_KB.font)
      expect(await page.locator('link[rel="preload"][as="font"]').count()).toBeLessThanOrEqual(
        MAX_PRELOADED_FONTS,
      )
      // next/font adds a local "… Fallback" face for each font; it downloads nothing.
      const families = await page.evaluate(
        () =>
          new Set(
            [...document.fonts]
              .filter((face) => face.status === 'loaded' && !face.family.endsWith('Fallback'))
              .map((face) => face.family),
          ).size,
      )
      expect(families, 'font families').toBeLessThanOrEqual(MAX_FONT_FAMILIES)
    })
  }
})
