import { type Page, expect, test } from '@playwright/test'

import { FIXED_JOBS, jobPath } from '../../src/scripts/fake-jobs-fixed'

// The job page in the browser (PLAN §9.5, §17.3). Needs the fake jobs: pnpm fake:jobs.
const OPEN = jobPath(FIXED_JOBS.open)

const scriptsOf = async (page: Page, path: string) => {
  const urls = new Set<string>()
  page.on('request', (request) => {
    if (request.resourceType() === 'script') urls.add(new URL(request.url()).pathname)
  })
  await page.goto(path, { waitUntil: 'networkidle' })
  page.removeAllListeners('request')
  return [...urls].sort()
}

/** Tabs through the page: the fixed action bar covers no focused element nor the page's end. */
async function expectBarClearOfContent(page: Page) {
  const covered = () =>
    page.evaluate(() => {
      const focused = document.activeElement
      const bar = document.querySelector('.action-bar')
      if (!focused || !bar || bar.contains(focused) || focused === document.body) return null
      const a = focused.getBoundingClientRect()
      const b = bar.getBoundingClientRect()
      return a.bottom > b.top + 1 && a.top < b.bottom ? focused.outerHTML.slice(0, 120) : null
    })
  let reachedBar = false
  for (let step = 0; step < 80; step++) {
    await page.keyboard.press('Tab')
    expect(await covered()).toBeNull()
    // Focusing the bar's own button must not move the page.
    if (await page.evaluate(() => !!document.activeElement?.closest('.action-bar'))) {
      reachedBar = true
      const before = await page.evaluate(() => window.scrollY)
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => window.scrollY)).toBe(before)
    }
  }
  expect(reachedBar).toBe(true)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const footerBottom = await page
    .locator('footer')
    .last()
    .evaluate((footer) => footer.getBoundingClientRect().bottom)
  const barTop = (await page.locator('.action-bar').boundingBox())!.y
  expect(footerBottom).toBeLessThanOrEqual(barTop)
}

test.describe('job page', () => {
  test('adds no JavaScript to what every page loads (PLAN §17.3)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'scripts do not depend on the device')
    const shell = await scriptsOf(page, '/en/contact/')
    expect(await scriptsOf(page, OPEN)).toEqual(shell)
    expect(await scriptsOf(page, jobPath(FIXED_JOBS.expiredRecently))).toEqual(shell)
  })

  test('shows the deadline in words, with "Closing soon" within 14 days', async ({ page }) => {
    await page.goto(jobPath(FIXED_JOBS.closingSoon))
    const facts = page.getByRole('region', { name: 'Facts' })
    await expect(facts.getByText(/^(\d+ days left|Last day)$/)).toBeVisible()
    await expect(facts.getByText('Closing soon', { exact: true })).toBeVisible()
    await expect(facts.getByText(/^Until the end of that day, Central European Time/)).toBeVisible()
  })

  test('names the way to apply for screen readers and links the topics', async ({ page }) => {
    await page.goto(OPEN)
    const posting = page.getByRole('region', { name: 'Original posting' }).getByRole('link', {
      name: 'View original posting (opens the employer’s website)',
    })
    await expect(posting).toHaveAttribute(
      'href',
      `https://careers.example.org/${FIXED_JOBS.open.institutionRorId}/positions/${FIXED_JOBS.open.shortId}`,
    )
    await expect(page.getByRole('link', { name: 'Glial biology' }).last()).toHaveAttribute(
      'href',
      '/en/subfields/glia/',
    )
    await expect(page.getByRole('link', { name: 'Mouse', exact: true })).toHaveAttribute(
      'href',
      '/en/jobs/?model=mouse',
    )
    await expect(page.getByRole('link', { name: 'Report a problem' })).toHaveAttribute(
      'href',
      `/en/report/?item=job:${FIXED_JOBS.open.shortId}`,
    )
  })

  test('a closed job has no way to apply', async ({ page }) => {
    await page.goto(jobPath(FIXED_JOBS.expiredRecently))
    await expect(page.getByRole('heading', { name: 'This position has closed' })).toBeVisible()
    await expect(page.locator('main .action-bar')).toHaveCount(0)
    // The aside is named by what is left in it (WCAG 2.4.6).
    await expect(page.getByRole('region', { name: 'Original posting' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'About this listing' })).toContainText(
      'Report a problem',
    )
    const facts = page.getByRole('region', { name: 'Facts' })
    await expect(facts.getByText('Closed', { exact: true })).toBeVisible()
  })
})

test.describe('job page on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'the action bar is for narrow screens')

  test('keeps the primary action at the bottom of the screen', async ({ page }) => {
    await page.goto(OPEN)
    const bar = page.locator('.action-bar')
    const viewport = page.viewportSize()!
    const box = await bar.boundingBox()
    expect(box!.y + box!.height).toBeCloseTo(viewport.height, 0)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
    expect((await bar.boundingBox())!.y).toBeCloseTo(box!.y, 0)
  })

  test('the action bar never covers the focused element or the end of the page', async ({
    page,
  }) => {
    await page.goto(OPEN)
    await expectBarClearOfContent(page)
  })

  test('the action bar stays in the page on a short screen, e.g. at 400% zoom', async ({
    page,
  }) => {
    // A 1366×768 laptop at 400% zoom (WCAG 1.4.10).
    await page.setViewportSize({ width: 341, height: 192 })
    await page.goto(OPEN)
    await expect(page.locator('.action-bar')).toHaveCSS('position', 'static')
  })

  test('the action bar stays in the page when printed', async ({ page }) => {
    await page.emulateMedia({ media: 'print' })
    await page.goto(OPEN)
    await expect(page.locator('.action-bar')).toHaveCSS('position', 'static')
    expect(await page.evaluate(() => getComputedStyle(document.body).paddingBottom)).toBe('0px')
  })
})

// Enlarged text (PLAN §17.1): the label wraps, so the bar grows. In a narrow desktop window, not
// phone emulation, which zooms the whole page out when anything on it overflows.
test.describe('job page with text at 200%', () => {
  test.skip(({ isMobile }) => isMobile, 'runs once, in a narrow window')

  test('the action bar never covers the focused element or the end of the page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto(OPEN)
    await page.addStyleTag({ content: 'html { font-size: 200% }' })
    await expect(page.locator('.action-bar')).toHaveCSS('position', 'fixed')
    expect((await page.locator('.action-bar').boundingBox())!.height).toBeGreaterThan(100)
    await expectBarClearOfContent(page)
  })
})

test.describe('job page on a wide screen', () => {
  test.skip(({ isMobile }) => isMobile, 'the desktop layout starts at 1024px')

  test('shows the primary action next to the facts, not fixed', async ({ page }) => {
    await page.goto(OPEN)
    const posting = page.getByRole('region', { name: 'Original posting' })
    const facts = page.getByRole('region', { name: 'Facts' })
    await expect(page.locator('.action-bar')).toHaveCSS('position', 'static')
    const [a, b] = [await facts.boundingBox(), await posting.boundingBox()]
    expect(b!.x).toBeGreaterThan(a!.x + a!.width)
    expect(Math.abs(b!.y - a!.y)).toBeLessThan(2)
  })
})
