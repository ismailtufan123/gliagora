import { type Locator, type Page, expect, test } from '@playwright/test'

import { FIXED_JOBS, jobPath } from '../../src/scripts/fake-jobs-fixed'
import { PAGES } from './pages'
import { hiddenWhenFocused, pseudoLocalise } from './pseudo-locale'

// PLAN §17.1, §17.2, §7.3: pages reflow at 320px (also with WCAG 1.4.12 text spacing, and with
// text at 200%, WCAG 1.4.4), the header fits with the browser's text size enlarged, nothing
// shifts while the web fonts load, and the logo follows dark mode. Longer text (other languages)
// is checked by pseudo-locale.spec.ts.

const TEXT_SPACING =
  '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }'

// Text at 200%: everything is sized in rem, so doubling the root size doubles all text. Media
// queries still see a 320px screen (they are measured in the browser's default size), which is
// harder than zooming the page; container queries see the new size (the header's lockup,
// global.css).
const TEXT_200 = 'html { font-size: 200% !important; }'

/**
 * How far the page scrolls sideways: its content against the width of the layout (the <html>
 * box). Not against clientWidth, which includes the scrollbar's space that
 * `scrollbar-gutter: stable` keeps (15px where the scrollbar is hidden, as in these tests).
 */
const sidewaysScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      Math.round(document.documentElement.getBoundingClientRect().width),
  )

/** The texts of these buttons that run over more than one line, such as "Searc" / "h". */
const labelsOverLines = (buttons: Locator) =>
  buttons.evaluateAll((elements) =>
    elements.flatMap((button) => {
      const split: string[] = []
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const text = walker.currentNode as Text
        if (!text.data.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(text)
        const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
        if (lines.size > 1) split.push(text.data.trim())
      }
      return split
    }),
  )

/**
 * The header's home link encloses its mark (its box is what the focus outline draws) and ends
 * before the navigation begins.
 */
const lockupProblems = (page: Page) =>
  page.locator('.site-header').evaluate((header) => {
    const problems: string[] = []
    const link = header.querySelector('.lockup-frame-header a')!.getBoundingClientRect()
    const mark = header.querySelector('.lockup-frame-header img')!.getBoundingClientRect()
    if (link.left > mark.left + 0.5 || link.right < mark.right - 0.5) {
      problems.push(
        `the link (${link.left}–${link.right}px) cuts the mark (${mark.left}–${mark.right}px)`,
      )
    }
    const first = [...header.querySelectorAll('.page-frame > nav a')].find(
      (a) => a.getClientRects().length,
    )
    const nav = first?.getBoundingClientRect()
    if (nav && Math.max(link.right, mark.right) > nav.left + 0.5) {
      problems.push(`the lockup reaches into the navigation (${nav.left}px)`)
    }
    return problems
  })

/**
 * The browser's own text size (its default font size, as a person sets it), which rem media
 * queries follow, unlike TEXT_200. A Chromium protocol command; set before the page loads.
 */
async function setBrowserTextSize(page: Page, px: number) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Page.setFontSizes', {
    fontSizes: { standard: px, fixed: Math.round((px * 13) / 16) },
  })
}

test.describe('reflow at 320px', () => {
  test.skip(({ isMobile }) => isMobile, 'the width is set explicitly')
  test.use({ viewport: { width: 320, height: 640 } })

  for (const template of PAGES) {
    test(`${template.name}: no horizontal scroll, also with text spacing`, async ({ page }) => {
      await page.goto(template.path)
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
      await page.addStyleTag({ content: TEXT_SPACING })
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
    })

    test(`${template.name}: no horizontal scroll with text at 200%`, async ({ page }) => {
      await page.goto(template.path)
      await page.addStyleTag({ content: TEXT_200 })
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
      // The search form's button keeps its word whole: the field leaves it room, or it moves
      // below the field (search, 404 and 410 pages).
      expect(await labelsOverLines(page.locator('main .search-row .button'))).toEqual([])
    })
  }

  test('search dialog with text at 200%: the form fits, and the field has room', async ({
    page,
  }) => {
    await page.goto('/en/')
    await page.addStyleTag({ content: TEXT_200 })
    await expect(page.locator('html[data-js]')).toBeAttached()
    await page.keyboard.press('ControlOrMeta+k')
    const dialog = page.locator('dialog#search-dialog')
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
    expect(await labelsOverLines(dialog.locator('.search-row .button'))).toEqual([])
    // Room for about 8 characters of the query, in rem (the root's size).
    const room = await page.locator('#search-dialog-input').evaluate((input) => {
      const style = getComputedStyle(input)
      const width =
        input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      return width / parseFloat(getComputedStyle(document.documentElement).fontSize)
    })
    expect(room).toBeGreaterThanOrEqual(5)
  })
})

// With the browser's text size enlarged (Chromium's default font size), the rem breakpoints and the
// page frame (80rem) grow with the text, so the desktop header keeps the room it was designed for.
test.describe('browser text size', () => {
  test.skip(
    ({ isMobile, browserName }) => isMobile || browserName !== 'chromium',
    'the sizes are set explicitly, through the Chromium protocol',
  )

  for (const { text, width, height, path } of [
    { text: 24, width: 1920, height: 1080, path: '/en/' },
    { text: 24, width: 1920, height: 1080, path: '/tr/iletisim/' },
    { text: 32, width: 2560, height: 1440, path: '/tr/iletisim/' },
  ]) {
    test(`${path} at ${width}px with ${text}px text: the desktop header fits its frame`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await setBrowserTextSize(page, text)
      await page.goto(path)
      await expect(page.locator('.site-header > .page-frame > nav')).toBeVisible()
      const { end, frameEnd } = await page
        .locator('.site-header > .page-frame')
        .evaluate((frame) => ({
          end: frame.querySelector('.ms-auto')!.getBoundingClientRect().right,
          frameEnd:
            frame.getBoundingClientRect().right - parseFloat(getComputedStyle(frame).paddingRight),
        }))
      expect(end).toBeLessThanOrEqual(frameEnd + 0.5)
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
      expect(await lockupProblems(page)).toEqual([])
    })
  }

  // Tab from the end of one footer column to the top of the next moves focus up the screen, where
  // the browser does not scroll (global.css keeps the strip under the header out of the view).
  for (const path of ['/en/', jobPath(FIXED_JOBS.open)]) {
    test(`${path} at 1024px with 32px text: no focused control under the header`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1024, height: 768 })
      await setBrowserTextSize(page, 32)
      await page.goto(path)
      await expect(page.locator('html[data-js]')).toBeAttached()
      expect(await hiddenWhenFocused(page)).toEqual([])
    })
  }
})

// The header's lockup gives way to longer labels, down to the mark alone, and no further: the
// Turkish header with labels 40% longer (the pseudo-locale) leaves it less room than the mark.
test('the header lockup never gets narrower than its mark', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the width is set explicitly')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/tr/iletisim/')
  await pseudoLocalise(page)
  await page.evaluate(() => document.fonts.ready)
  expect(await lockupProblems(page)).toEqual([])
})

test.describe('fonts', () => {
  for (const path of [
    '/en/',
    '/en/legal/privacy/',
    '/tr/iletisim/',
    '/en/about/',
    '/en/jobs/',
    jobPath(FIXED_JOBS.open),
    '/en/search/?q=neuro',
  ]) {
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
      // PLAN §17: Core Web Vitals "good" means a cumulative layout shift of 0.1 or less; the fonts
      // may use at most half of it. With the size-adjusted fallbacks (bold text has its own, since
      // M4.10) only a few lines re-wrap: measured at M4.10 at most 0.013 (desktop, the privacy
      // policy) and 0.035 (412px, the jobs list; 0.076 before the bold fallbacks).
      expect(shift).toBeLessThanOrEqual(0.05)
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
