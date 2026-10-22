import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'

import { cspViolations, withSiteCsp } from './map'

// The home page's 3D hero (PLAN §10; M13, D60): the checks of §10.2 decide in the page whether the
// 3D layer may load; where they pass, its code and point file are fetched after the page's `load`
// and the layer is shown over the poster; where one fails, nothing of it is requested and the
// poster stays. The sizes are checked by budgets.spec.ts.

/** Words only the hero's chunks hold: three.js's (its warnings' prefix) and the scene's own. */
const THREE_MARK = 'THREE.'
const SCENE_MARK = 'gliagora-hero-played'

/** Watches a page for the hero's requests: three.js's and the scene's chunks, and the point file. */
function watchHero(page: Page) {
  const seen = { three: 0, scene: 0, points: 0, pending: [] as Promise<void>[] }
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/hero/')) seen.points++
    if (response.request().resourceType() !== 'script') return
    seen.pending.push(
      response
        .text()
        .then((body) => {
          if (body.includes(THREE_MARK)) seen.three++
          if (body.includes(SCENE_MARK)) seen.scene++
        })
        .catch(() => {}),
    )
  })
  return {
    async counts() {
      await Promise.all(seen.pending)
      return { three: Math.min(seen.three, 1), scene: seen.scene, points: seen.points }
    },
  }
}

const heroState = (page: Page) =>
  page.locator('.home-poster').evaluate((box: HTMLElement) => ({
    hero: box.dataset.hero,
    skip: box.dataset.heroSkip,
    quality: box.dataset.heroQuality,
  }))

/** Waits until the 3D layer is shown, or gave up (`poster`), or never tried (`off`). */
async function settled(page: Page) {
  await expect(page.locator('.home-poster')).toHaveAttribute('data-hero', /^(live|poster|off)$/, {
    timeout: 20_000,
  })
  return (await heroState(page)).hero
}

/**
 * What the page sees in place of the browser's own: `navigator.connection`, `deviceMemory`,
 * and whether WebGL2 exists, before any of the page's scripts run.
 */
async function pretend(
  page: Page,
  device: { saveData?: boolean; effectiveType?: string; deviceMemory?: number; webgl2?: false },
) {
  await page.addInitScript((d) => {
    if (d.saveData !== undefined || d.effectiveType)
      Object.defineProperty(navigator, 'connection', {
        value: { saveData: d.saveData ?? false, effectiveType: d.effectiveType ?? '4g' },
      })
    if (d.deviceMemory !== undefined)
      Object.defineProperty(navigator, 'deviceMemory', { value: d.deviceMemory })
    if (d.webgl2 === false)
      delete (window as { WebGL2RenderingContext?: unknown }).WebGL2RenderingContext
  }, device)
}

test.describe('the 3D hero', () => {
  test.skip(({ isMobile }) => isMobile, 'the phone is checked below')

  test('loads after the page and is shown over the poster, under the site’s CSP', async ({
    page,
  }) => {
    const hero = watchHero(page)
    await withSiteCsp(page)
    await page.goto('/en/')
    expect(await heroState(page)).toMatchObject({ quality: 'full' })
    expect(await settled(page)).toBe('live')
    expect(await hero.counts()).toEqual({ three: 1, scene: 1, points: 1 })
    await expect(page.locator('canvas.hero-canvas')).toHaveCSS('opacity', '1')
    await expect(page.locator('svg.poster-art')).toHaveCSS('opacity', '0')
    // The canvas is a picture only; the windows are still the page's links.
    await expect(page.locator('canvas.hero-canvas')).toHaveAttribute('aria-hidden', 'true')
    await expect(
      page.getByRole('list', { name: 'The windows' }).getByRole('link', { name: /^Jobs\b/ }),
    ).toBeVisible()
    expect(await cspViolations(page)).toEqual([])
  })

  test('moves nothing on the page: no layout shift, the heading stays the largest paint', async ({
    page,
  }) => {
    await page.goto('/en/')
    expect(await settled(page)).toBe('live')
    const { shift, largest } = await page.evaluate(
      () =>
        new Promise<{ shift: number; largest: string }>((resolve) => {
          let shift = 0
          let largest = ''
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as (PerformanceEntry & { value: number })[])
              shift += entry.value
          }).observe({ type: 'layout-shift', buffered: true })
          new PerformanceObserver((list) => {
            const entries = list.getEntries() as (PerformanceEntry & { element?: Element })[]
            largest = entries.at(-1)?.element?.tagName ?? ''
          }).observe({ type: 'largest-contentful-paint', buffered: true })
          setTimeout(() => resolve({ shift, largest }), 300)
        }),
    )
    expect(shift).toBe(0)
    expect(largest).toBe('H1')
  })

  test('keyboard focus on a label does what hover does (F3)', async ({ page }) => {
    await page.goto('/en/')
    expect(await settled(page)).toBe('live')
    const box = page.locator('.home-poster')
    const jobs = page.getByRole('list', { name: 'The windows' }).getByRole('link').first()
    // The count stays in view, as with the poster, and in the link's name.
    await expect(jobs.locator('.home-poster-count')).toBeVisible()
    await expect(jobs.locator('.home-poster-count')).toHaveCSS('opacity', '1')
    await expect(jobs).toHaveAccessibleName(/^Jobs ?, \d+ open positions?$/)

    await jobs.hover()
    await expect(box).toHaveAttribute('data-hero-focus', 'jobs')
    await page.mouse.move(0, 0)
    await expect(box).not.toHaveAttribute('data-hero-focus')

    await jobs.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(jobs).toBeFocused()
    await expect(box).toHaveAttribute('data-hero-focus', 'jobs')
    await jobs.evaluate((link: HTMLElement) => link.blur())
    await expect(box).not.toHaveAttribute('data-hero-focus')
  })

  test('off screen, gives the GPU its memory back after 10 s and builds again on return (F5)', async ({
    page,
  }) => {
    await page.goto('/en/')
    expect(await settled(page)).toBe('live')
    await expect(page.locator('canvas.hero-canvas')).toHaveCount(1)
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
    // Paused: no canvas, the poster in its place.
    await expect(page.locator('.home-poster')).toHaveAttribute('data-hero', 'paused', {
      timeout: 15_000,
    })
    await expect(page.locator('canvas.hero-canvas')).toHaveCount(0)
    await expect(page.locator('svg.poster-art')).toHaveCSS('opacity', '1')
    // Back on screen: built again and shown.
    await page.evaluate(() => scrollTo(0, 0))
    await expect(page.locator('.home-poster')).toHaveAttribute('data-hero', 'live')
    await expect(page.locator('canvas.hero-canvas')).toHaveCount(1)
    await expect(page.locator('canvas.hero-canvas')).toHaveCSS('opacity', '1')
  })

  test('shows the poster, not the canvas, when printed', async ({ page }) => {
    await page.goto('/en/')
    expect(await settled(page)).toBe('live')
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('svg.poster-art')).toHaveCSS('opacity', '1')
    await expect(page.locator('canvas.hero-canvas')).toBeHidden()
  })

  test('plays its arrival once per session (session storage, D60)', async ({ page }) => {
    await page.goto('/en/')
    expect(await settled(page)).toBe('live')
    expect(await page.evaluate(() => sessionStorage.getItem('gliagora-hero-played'))).toBe('1')
    expect(
      await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes('hero'))),
    ).toEqual([])
  })

  test('axe finds nothing serious while the 3D layer is shown', async ({ page }) => {
    await page.goto('/en/')
    expect(await settled(page)).toBe('live')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(
      results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.help}`),
    ).toEqual([])
  })
})

test.describe('the poster stays, and nothing of the 3D layer is requested', () => {
  test.skip(({ isMobile }) => isMobile, 'each case sets its own screen')

  const cases: {
    name: string
    skip: string
    width?: number
    reducedMotion?: 'reduce'
    forcedColors?: 'active'
    device?: Parameters<typeof pretend>[1]
  }[] = [
    { name: 'with reduced motion', skip: 'reduced-motion', reducedMotion: 'reduce' },
    { name: 'in forced colours', skip: 'forced-colors', forcedColors: 'active' },
    { name: 'with Save-Data', skip: 'save-data', device: { saveData: true } },
    { name: 'on a 3g connection', skip: 'slow-connection', device: { effectiveType: '3g' } },
    { name: 'without WebGL2', skip: 'no-webgl2', device: { webgl2: false } },
    { name: 'with less than 4 GB', skip: 'low-memory', device: { deviceMemory: 2 } },
    {
      name: 'on a small screen that reports 4 GB',
      skip: 'small-screen',
      width: 390,
      device: { deviceMemory: 4 },
    },
  ]
  for (const c of cases) {
    test(c.name, async ({ page }) => {
      if (c.width) await page.setViewportSize({ width: c.width, height: 844 })
      await page.emulateMedia({
        reducedMotion: c.reducedMotion ?? 'no-preference',
        forcedColors: c.forcedColors ?? 'none',
      })
      if (c.device) await pretend(page, c.device)
      const hero = watchHero(page)
      await page.goto('/en/', { waitUntil: 'load' })
      expect(await heroState(page)).toEqual({ hero: 'off', skip: c.skip, quality: undefined })
      // Longer than the loader would wait for the browser to be idle (2 s).
      await page.waitForTimeout(2500)
      expect(await hero.counts()).toEqual({ three: 0, scene: 0, points: 0 })
      await expect(page.locator('canvas')).toHaveCount(0)
      await expect(page.locator('svg.poster-art')).toBeVisible()
      await expect(page.locator('svg.poster-art')).toHaveCSS('opacity', '1')
    })
  }

  test('axe finds nothing serious on the poster with its counts', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/en/')
    await expect(page.locator('.home-poster-count').first()).toHaveCSS('opacity', '1')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(
      results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.help}`),
    ).toEqual([])
  })
})

test.describe('the home page without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('is complete: the heading, the poster, the windows with their counts', async ({ page }) => {
    await page.goto('/en/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Where neuroscience meets')
    await expect(page.locator('svg.poster-art')).toBeVisible()
    await expect(page.locator('.home-poster')).not.toHaveAttribute('data-hero')
    const jobs = page.getByRole('list', { name: 'The windows' }).getByRole('link').first()
    await expect(jobs).toHaveAccessibleName(/^Jobs ?, \d+ open positions?$/)
    await expect(jobs.locator('.home-poster-count')).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(0)
  })
})

test.describe('the 3D hero on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'a phone')

  test('a phone that does not report its memory tries the lighter quality (D60)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'deviceMemory', { value: undefined })
    })
    await page.goto('/en/')
    expect(await heroState(page)).toMatchObject({ quality: 'phone' })
    // It shows once at least half of it is on screen.
    await page.locator('.home-poster').scrollIntoViewIfNeeded()
    expect(['live', 'poster']).toContain(await settled(page))
  })
})
