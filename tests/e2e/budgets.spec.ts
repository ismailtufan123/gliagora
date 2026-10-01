import { gzipSync } from 'node:zlib'

import { type Response, expect, test } from '@playwright/test'

import { asTemplateMember } from './member'
import { PAGES } from './pages'

// PLAN §17.3: size budgets for every template, measured from what the browser actually
// downloads (so scripts added by next/script or next/dynamic count too, and the noModule
// polyfill that modern browsers skip does not). Measured at M1: 135 KB of JavaScript, of which
// about 132 KB is React and Next.js themselves.
const BUDGET_KB = { script: 140, stylesheet: 35, html: 60, font: 120 }
/**
 * Where a map is shown, its own code comes on top (PLAN §17.3, "Map chunk"): MapLibre GL JS with its
 * worker and stylesheet (src/scripts/vendor-maplibre.mjs) and the map's chunk (src/components/map).
 */
const MAP_BUDGET_KB = { script: 330, stylesheet: 11 }
const MAPLIBRE = /\/map\/maplibre-gl\//
const MAX_PRELOADED_FONTS = 4
const MAX_FONT_FAMILIES = 2

type Kind = 'script' | 'stylesheet' | 'font'
const KINDS: Kind[] = ['script', 'stylesheet', 'font']

test.describe('size budgets', () => {
  test.skip(({ isMobile }) => isMobile, 'sizes do not depend on the device')

  for (const template of PAGES) {
    test(`${template.name} stays within the budgets`, async ({ page, baseURL }) => {
      await asTemplateMember(page, template, baseURL)
      const responses: Response[] = []
      page.on('response', (response) => {
        if (
          (KINDS as string[]).includes(response.request().resourceType()) ||
          MAPLIBRE.test(response.url())
        )
          responses.push(response)
      })
      const main = await page.goto(template.path, { waitUntil: 'networkidle' })
      const map = 'map' in template
      // The map loads after the page: wait for it, so its code counts.
      if (map) {
        await expect(page.locator('.map-view')).toHaveAttribute('data-status', 'ready')
        await page.waitForLoadState('networkidle')
      }

      const kb: Record<Kind, number> = { script: 0, stylesheet: 0, font: 0 }
      let maplibreKb = 0
      const seen = new Set<string>()
      for (const response of responses) {
        if (seen.has(response.url())) continue
        seen.add(response.url())
        expect(response.ok(), response.url()).toBe(true)
        const type = response.request().resourceType()
        // MapLibre's worker is not a "script" to the browser, but it is JavaScript.
        const kind: Kind = MAPLIBRE.test(response.url())
          ? response.url().endsWith('.css')
            ? 'stylesheet'
            : 'script'
          : (type as Kind)
        const body = await response.body()
        // Scripts and styles are served compressed; font files are already compressed.
        const size = (kind === 'font' ? body.length : gzipSync(body).length) / 1024
        kb[kind] += size
        if (MAPLIBRE.test(response.url())) maplibreKb += size
      }
      const htmlKb = gzipSync(await main!.body()).length / 1024
      // For the record: the milestone notes (PLAN §20) give the JavaScript of each template.
      console.log(
        `${template.name}: JavaScript ${kb.script.toFixed(2)} KB, CSS ${kb.stylesheet.toFixed(2)} KB, HTML ${htmlKb.toFixed(2)} KB (gzip), fonts ${kb.font.toFixed(1)} KB${map ? `; of these, MapLibre ${maplibreKb.toFixed(2)} KB` : ''}`,
      )

      // The jobs list has a tighter budget of its own since its savings pass (D45, PLAN §17.3).
      const scriptKb = 'scriptKb' in template ? template.scriptKb : BUDGET_KB.script
      expect(kb.script, 'JavaScript, KB gzip').toBeLessThanOrEqual(
        scriptKb + (map ? MAP_BUDGET_KB.script : 0),
      )
      expect(kb.stylesheet, 'CSS, KB gzip').toBeLessThanOrEqual(
        BUDGET_KB.stylesheet + (map ? MAP_BUDGET_KB.stylesheet : 0),
      )
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
