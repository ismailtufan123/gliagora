import { expect, test } from '@playwright/test'

import { PAGES } from './pages'

// PLAN §17.1, §17.2, §7.3: pages reflow at 320px (also with WCAG 1.4.12 text spacing), nothing
// shifts while the web fonts load, and the logo follows dark mode.

const TEXT_SPACING =
  '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }'

test.describe('reflow at 320px', () => {
  test.skip(({ isMobile }) => isMobile, 'the width is set explicitly')
  test.use({ viewport: { width: 320, height: 640 } })

  for (const template of PAGES) {
    test(`${template.name}: no horizontal scroll, also with text spacing`, async ({ page }) => {
      await page.goto(template.path)
      const overflow = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
      expect(await overflow()).toBeLessThanOrEqual(0)
      await page.addStyleTag({ content: TEXT_SPACING })
      expect(await overflow()).toBeLessThanOrEqual(0)
    })
  }
})

test.describe('fonts', () => {
  for (const path of ['/en/legal/privacy/', '/tr/iletisim/', '/en/about/']) {
    test(`${path}: no layout shift when the web fonts arrive late`, async ({ page }) => {
      await page.route('**/*.woff2', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        await route.continue()
      })
      await page.addInitScript(() => {
        const win = window as unknown as { layoutShift: number }
        win.layoutShift = 0
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as unknown as {
            value: number
            hadRecentInput: boolean
          }[]) {
            if (!entry.hadRecentInput) win.layoutShift += entry.value
          }
        }).observe({ type: 'layout-shift', buffered: true })
      })
      await page.goto(path, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(300)
      const shift = await page.evaluate(
        () => (window as unknown as { layoutShift: number }).layoutShift,
      )
      // PLAN §17: Core Web Vitals "good" means a cumulative layout shift of 0.1 or less. With the
      // size-adjusted fallbacks only a few lines re-wrap (measured at M1: at most 0.07).
      expect(shift).toBeLessThanOrEqual(0.1)
    })
  }
})

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' })

  test('the header and About logos use the dark marks', async ({ page }) => {
    await page.goto('/en/about/')
    const sources = await page
      .locator('picture img')
      .evaluateAll((images) => images.map((img) => (img as HTMLImageElement).currentSrc))
    expect(sources.length).toBeGreaterThanOrEqual(2)
    for (const src of sources) expect(src).toMatch(/-dark\.svg$/)
  })
})
