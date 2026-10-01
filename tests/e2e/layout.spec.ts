import { type Locator, type Page, expect, test } from '@playwright/test'

import { FIXED_JOBS, jobPath } from '../../src/scripts/fake-jobs-fixed'
import { clientAddress } from './forms'
import {
  answerAtProvider,
  asTemplateMember,
  needsFakeProviders,
  newAddress,
  newGoogleSub,
  newOrcidId,
  startAt,
} from './member'
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
 * The visible parts of the header that reach above or below it. Its box is 64px high whatever it
 * holds (global.css fixes the height), so a label that wraps to more lines shows only here. The
 * closed menus' panels do not count.
 */
const headerOverflow = (page: Page) =>
  page.locator('.site-header').evaluate((header) => {
    const box = header.getBoundingClientRect()
    return [...header.querySelectorAll('.page-frame *')].flatMap((element) => {
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height) return []
      if (element.closest('details:not([open]) > :not(summary)')) return []
      return rect.top < box.top - 0.5 || rect.bottom > box.bottom + 0.5
        ? [
            `${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]} ${rect.top}–${rect.bottom}px`,
          ]
        : []
    })
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
    test(`${template.name}: no horizontal scroll, also with text spacing`, async ({
      page,
      baseURL,
    }) => {
      await asTemplateMember(page, template, baseURL)
      await page.goto(template.path)
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
      await page.addStyleTag({ content: TEXT_SPACING })
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
    })

    test(`${template.name}: no horizontal scroll with text at 200%`, async ({ page, baseURL }) => {
      await asTemplateMember(page, template, baseURL)
      await page.goto(template.path)
      await page.addStyleTag({ content: TEXT_200 })
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
      // The search form's button keeps its word whole: the field leaves it room, or it moves
      // below the field (search, 404 and 410 pages).
      expect(await labelsOverLines(page.locator('main .search-row .button'))).toEqual([])
    })
  }

  // The states of signing in with Google or ORCID that need a pending identity or a member with
  // two ways in, which no fixed address shows: through the fake providers.
  test('sign-in with Google and ORCID: no horizontal scroll, with text spacing and at 200%', async ({
    browser,
  }) => {
    needsFakeProviders()
    const context = await browser.newContext({
      viewport: { width: 320, height: 640 },
      extraHTTPHeaders: { 'X-Forwarded-For': clientAddress() },
    })
    const page = await context.newPage()
    const reflows = async (state: string) => {
      expect(await sidewaysScroll(page), state).toBeLessThanOrEqual(0)
      await page.addStyleTag({ content: TEXT_SPACING })
      expect(await sidewaysScroll(page), `${state}, text spacing`).toBeLessThanOrEqual(0)
      await page.reload()
      await page.addStyleTag({ content: TEXT_200 })
      expect(await sidewaysScroll(page), `${state}, text at 200%`).toBeLessThanOrEqual(0)
    }

    // Create your account after Google, with the note about an address Google does not manage.
    await startAt(page, 'google', { fields: { sub: newGoogleSub(), email: newAddress(), hd: '' } })
    await expect(page.getByRole('note')).toBeVisible()
    await reflows('create your account, Google')
    // After ORCID, with the box that keeps the record's name.
    await startAt(page, 'orcid', { fields: { sub: newOrcidId() } })
    await expect(page.getByRole('checkbox')).toBeVisible()
    await reflows('create your account, ORCID')
    // An account with two ways in: ORCID, then Google linked, each with its Remove button.
    await page.reload()
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.getByRole('link', { name: 'Link your Google account' }).click()
    await answerAtProvider(page, 'google', {
      fields: { sub: newGoogleSub(), email: newAddress(), hd: 'example.org' },
    })
    await expect(page.getByRole('button', { name: 'Remove ORCID' })).toBeVisible()
    await reflows('account with two ways in')
    await context.close()
  })

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

// The header's Account link (M4b, D49) sits beside the search, language and digest buttons from
// 1280px, the narrowest desktop layout. It is an icon so that the lockup keeps its descriptor
// there at the default text size, in English and in Turkish (the descriptor is never cut: where it
// does not fit, global.css hides it, so a width of a pixel or so means it went), and so that
// labels 40% longer still leave the header one line high (the lockup gives way first).
test.describe('header at 1280px with the Account link', () => {
  test.skip(({ isMobile }) => isMobile, 'the width is set explicitly')
  test.use({ viewport: { width: 1280, height: 800 } })

  for (const path of ['/en/', '/tr/iletisim/']) {
    test(`${path}: the lockup keeps its descriptor`, async ({ page }) => {
      await page.goto(path)
      await page.evaluate(() => document.fonts.ready)
      await expect(page.locator('.site-header .account-link')).toBeVisible()
      const descriptor = await page.locator('.site-header .lockup-descriptor').boundingBox()
      expect(descriptor?.width ?? 0).toBeGreaterThan(40)
      expect(await lockupProblems(page)).toEqual([])
    })
  }

  for (const path of ['/en/', '/tr/iletisim/']) {
    test(`${path} with labels 40% longer: the header stays one line, 64px high`, async ({
      page,
    }) => {
      await page.goto(path)
      await pseudoLocalise(page)
      await page.evaluate(() => document.fonts.ready)
      const header = await page.locator('.site-header').boundingBox()
      expect(header?.height).toBe(64)
      // The box is fixed; what is in it must fit too.
      expect(await headerOverflow(page)).toEqual([])
      await expect(page.locator('.site-header .account-link')).toBeVisible()
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
      expect(await lockupProblems(page)).toEqual([])
    })
  }
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
        type Rect = { y: number; height: number }
        type Source = { node?: Node | null; previousRect: Rect; currentRect: Rect }
        const win = window as unknown as { layoutShift: number; shiftSources: string[] }
        win.layoutShift = 0
        win.shiftSources = []
        // What moved, for the failure message: the element, and its top and height before and
        // after (a shift on one machine but not another usually means a different fallback font).
        const describe = (source: Source) => {
          const node = source.node
          const element = node instanceof Element ? node : node?.parentElement
          const name = element
            ? `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).split(' ')[0]}` : ''}`
            : 'text'
          const { previousRect: a, currentRect: b } = source
          return `${name} y ${Math.round(a.y)}→${Math.round(b.y)} h ${Math.round(a.height)}→${Math.round(b.height)}`
        }
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as unknown as {
            value: number
            hadRecentInput: boolean
            startTime: number
            sources: Source[]
          }[]) {
            if (entry.hadRecentInput) continue
            win.layoutShift += entry.value
            win.shiftSources.push(
              `${entry.value.toFixed(4)} at ${Math.round(entry.startTime)} ms: ${entry.sources.map(describe).join('; ')}`,
            )
          }
        }).observe({ type: 'layout-shift', buffered: true })
      })
      await page.goto(path, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(300)
      const { shift, sources, faces } = await page.evaluate(() => {
        const win = window as unknown as { layoutShift: number; shiftSources: string[] }
        return {
          shift: win.layoutShift,
          sources: win.shiftSources,
          // Every font face and whether it loaded: a fallback face whose local() font is missing
          // on this machine shows as "error".
          faces: [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`),
        }
      })
      // PLAN §17: Core Web Vitals "good" means a cumulative layout shift of 0.1 or less, and the
      // late fonts must keep the page within it. With the size-adjusted fallbacks (bold text has
      // its own, since M4.10) only a few lines re-wrap: measured locally at most 0.013 (desktop, the
      // privacy policy) and 0.035 (412px, the jobs list). A heading that fills its line almost
      // exactly can take one more line in the fallback on one machine and not on another (fonts
      // and their rendering differ): on CI the title of /tr/iletisim/ ("İletişim ve yasal
      // bilgiler", 376 px in a 376 px line at 412px) does, which moves the page below it by one
      // line when Commissioner arrives: 0.058. Without the size-adjusted fallbacks the same page
      // shifts 0.17, so the test still fails when they are lost.
      expect(
        shift,
        `layout shifts:\n${sources.join('\n')}\nfont faces:\n${[...new Set(faces)].join('\n')}`,
      ).toBeLessThanOrEqual(0.1)
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
