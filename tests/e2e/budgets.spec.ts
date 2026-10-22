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
/**
 * The home page's 3D hero (PLAN §10.5, §17.3, "Hero chunk"; D60): its code and its point file load
 * after the page's `load`, on the home page only and only where its checks pass, with budgets of
 * their own. The home page's first JavaScript is measured with the hero off (reduced motion).
 */
const HERO_BUDGET_KB = { script: 230, points: 150 }
/** A word three.js's code holds (its warnings' prefix): no other script of the site has it. */
const THREE_MARK = 'THREE.'
const MAX_PRELOADED_FONTS = 4
const MAX_FONT_FAMILIES = 2

type Kind = 'script' | 'stylesheet' | 'font'
const KINDS: Kind[] = ['script', 'stylesheet', 'font']

test.describe('size budgets', () => {
  test.skip(({ isMobile }) => isMobile, 'sizes do not depend on the device')

  for (const template of PAGES) {
    test(`${template.name} stays within the budgets`, async ({ page, baseURL }) => {
      await asTemplateMember(page, template, baseURL)
      // The home page's first JavaScript, without the hero (measured below).
      if (template.path === '/en/') await page.emulateMedia({ reducedMotion: 'reduce' })
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
        // The hero's code loads nowhere else, and not on the home page with reduced motion.
        if (kind === 'script')
          expect(body.includes(THREE_MARK), `${response.url()} holds three.js`).toBe(false)
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

  test('the home page’s 3D hero stays within its budgets', async ({ browser, baseURL }) => {
    /** The scripts a load of the home page fetches, by address, with their sizes (KB gzip). */
    async function scripts(reducedMotion: 'reduce' | 'no-preference') {
      const context = await browser.newContext({ reducedMotion, baseURL })
      const page = await context.newPage()
      const sizes = new Map<string, number>()
      let points = 0
      const pending: Promise<void>[] = []
      page.on('response', (response) => {
        const path = new URL(response.url()).pathname
        if (path.startsWith('/hero/'))
          pending.push(response.body().then((body) => void (points += body.length / 1024)))
        else if (response.request().resourceType() === 'script')
          pending.push(
            response.body().then((body) => void sizes.set(path, gzipSync(body).length / 1024)),
          )
      })
      await page.goto('/en/')
      if (reducedMotion === 'no-preference')
        await expect(page.locator('.home-poster')).toHaveAttribute('data-hero', /^(live|poster)$/, {
          timeout: 20_000,
        })
      else await page.waitForLoadState('networkidle')
      await Promise.all(pending)
      await context.close()
      return { sizes, points }
    }
    const first = await scripts('reduce')
    const hero = await scripts('no-preference')
    const extra = [...hero.sizes].filter(([path]) => !first.sizes.has(path))
    const heroKb = extra.reduce((sum, [, kb]) => sum + kb, 0)
    console.log(
      `home hero: JavaScript ${heroKb.toFixed(2)} KB (gzip, ${extra.length} chunks), point file ${hero.points.toFixed(1)} KB`,
    )
    expect(extra.length, 'the hero loads its own chunks').toBeGreaterThan(0)
    expect(heroKb, 'hero JavaScript, KB gzip').toBeLessThanOrEqual(HERO_BUDGET_KB.script)
    expect(hero.points, 'point file, KB').toBeGreaterThan(0)
    expect(hero.points, 'point file, KB').toBeLessThanOrEqual(HERO_BUDGET_KB.points)
    expect(first.points, 'no point file without the hero').toBe(0)
  })
})
