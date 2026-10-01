import { type APIRequestContext, type Page, expect, test } from '@playwright/test'

// The home page (PLAN §3.2 "Home", §9.1, §9.2, §10 L1; M6). Needs the fake jobs (pnpm fake:jobs).

const WINDOWS = ['jobs', 'events', 'funding', 'papers', 'news', 'resources']

/** The number in the figure whose words match `name` ("45 open positions"). */
const figure = (page: Page, name: RegExp) => page.locator('.home-figures a', { hasText: name })
const figureNumber = async (page: Page, name: RegExp) =>
  Number((await figure(page, name).locator('.home-figure').textContent())!.replace(/\D/g, ''))

/** The number in "38 positions match" on the jobs list at `path`. */
async function listMatches(request: APIRequestContext, path: string) {
  const html = await (await request.get(path)).text()
  return Number(/(\d+) positions? match/.exec(html)?.[1] ?? 0)
}

/** The job pages a list links to, in order. */
const rowPaths = (page: Page, list: string) =>
  page
    .locator(`${list} .job-list > li h3 a`)
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')))

test.describe('home page', () => {
  test('the hero: the tagline, the subline, Find positions and Explore the map', async ({
    page,
  }) => {
    await page.goto('/en/')
    await expect(page).toHaveTitle('Gliagora | Neuroscience – Where neuroscience meets')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Where neuroscience meets')
    await expect(page.getByRole('link', { name: 'Find positions' })).toHaveAttribute(
      'href',
      '/en/jobs/',
    )
    await expect(
      page.locator('.home-actions').getByRole('link', { name: 'Explore the map' }),
    ).toHaveAttribute('href', '/en/map/')
    // The poster is a picture only; the windows around it are real links, with their counts.
    await expect(page.locator('svg.poster-art')).toHaveAttribute('aria-hidden', 'true')
    const windows = page.getByRole('list', { name: 'The windows' }).getByRole('link')
    await expect(windows.first()).toHaveAttribute('href', '/en/jobs/')
    await expect(windows.first()).toHaveText(/^Jobs, \d+ open positions?$/)
  })

  test('shows only the windows that are built', async ({ page, request }) => {
    await page.goto('/en/')
    const linked = new Set(
      await page
        .locator('.home-poster-links a, .home-window h3 a')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
    )
    for (const key of WINDOWS) {
      const html = await (await request.get(`/en/${key}/`)).text()
      // A window that is not built yet answers with a placeholder page, which is not indexed.
      const built = !/<meta name="robots" content="noindex/.test(html)
      expect(linked.has(`/en/${key}/`), key).toBe(built)
    }
  })

  test('the LCP element is text: the heading', async ({ page }) => {
    await page.goto('/en/', { waitUntil: 'networkidle' })
    const element = await page.evaluate(
      () =>
        new Promise<string>((resolve) =>
          new PerformanceObserver((list) => {
            const entries = list.getEntries() as (PerformanceEntry & { element?: Element })[]
            resolve(entries.at(-1)?.element?.tagName ?? '')
          }).observe({ type: 'largest-contentful-paint', buffered: true }),
        ),
    )
    expect(element).toBe('H1')
  })

  test('both digest blocks lead to the newsletter page until the signup opens (M2)', async ({
    page,
  }) => {
    await page.goto('/en/')
    for (const block of ['.home-digest-short', '.home-digest']) {
      await expect(
        page.locator(block).getByRole('link', { name: 'Get the monthly digest' }),
      ).toHaveAttribute('href', '/en/newsletter/')
    }
  })
})

test.describe('the hero beside the poster', () => {
  test.skip(({ isMobile }) => isMobile, 'the sizes are set explicitly')

  for (const fonts of ['web fonts', 'fallback fonts']) {
    for (const width of [1024, 1080, 1280]) {
      test(`at ${width}px with the ${fonts}, the heading breaks only between words`, async ({
        page,
      }) => {
        if (fonts === 'fallback fonts') await page.route('**/*.woff2', (route) => route.abort())
        await page.setViewportSize({ width, height: 800 })
        await page.goto('/en/')
        await page.evaluate(() => document.fonts.ready)
        // The words of the heading that run over two lines.
        const split = await page.locator('h1').evaluate((h1) => {
          const text = h1.firstChild as Text
          return [...text.data.matchAll(/\S+/g)]
            .filter((word) => {
              const range = document.createRange()
              range.setStart(text, word.index)
              range.setEnd(text, word.index + word[0].length)
              const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
              return lines.size > 1
            })
            .map((word) => word[0])
        })
        expect(split).toEqual([])
      })
    }
  }
})

test.describe('home page figures and lists', () => {
  test.skip(({ isMobile }) => isMobile, 'the same data on every screen')

  test('each figure is the number its list shows', async ({ page, request }) => {
    await page.goto('/en/')
    const open = figure(page, /open positions?/)
    await expect(open).toHaveAttribute('href', '/en/jobs/')
    expect(await figureNumber(page, /open positions?/)).toBe(
      await listMatches(request, '/en/jobs/'),
    )

    const deadlines = figure(page, /deadlines? this month/)
    await expect(deadlines).toHaveAttribute('href', '/en/jobs/?deadline=this-month')
    expect(await figureNumber(page, /deadlines? this month/)).toBe(
      await listMatches(request, '/en/jobs/?deadline=this-month'),
    )

    // Institutions: those the map pins.
    await expect(figure(page, /institutions?/)).toHaveAttribute('href', '/en/map/')
    const map = (await (await request.get('/api/map/institutions/')).json()) as {
      features: unknown[]
    }
    expect(await figureNumber(page, /institutions?/)).toBe(map.features.length)

    // Countries: those the jobs list's country filter offers, listed further down the page.
    await expect(figure(page, /countr(y|ies)/)).toHaveAttribute('href', '#countries')
    await page.goto('/en/jobs/')
    const offered = await page.locator('input[name="country"]').count()
    await page.goto('/en/')
    expect(await figureNumber(page, /countr(y|ies)/)).toBe(offered)
  })

  test('latest positions are the newest, and the deadlines the nearest', async ({ page }) => {
    await page.goto('/en/jobs/?sort=newest')
    const newest = (await rowPaths(page, '#job-results')).slice(0, 6)
    // Deadline order puts the fixed deadlines first (the fake jobs have more than six).
    await page.goto('/en/jobs/')
    const nearest = (await rowPaths(page, '#job-results')).slice(0, 6)

    await page.goto('/en/')
    const latest = page.locator('section[aria-labelledby="home-latest-title"]')
    const deadlines = page.locator('section[aria-labelledby="home-deadlines-title"]')
    expect(await rowPaths(page, 'section[aria-labelledby="home-latest-title"]')).toEqual(newest)
    expect(await rowPaths(page, 'section[aria-labelledby="home-deadlines-title"]')).toEqual(nearest)
    await expect(latest.getByRole('link', { name: 'All positions, newest first' })).toHaveAttribute(
      'href',
      '/en/jobs/?sort=newest',
    )
    await expect(
      deadlines.getByRole('link', { name: 'All positions by deadline' }),
    ).toHaveAttribute('href', '/en/jobs/')
    // Short rows: no tags and no posting links (those are on the list and the job pages).
    await expect(latest.locator('.chip')).toHaveCount(0)
    await expect(latest.getByRole('link', { name: /View original posting/ })).toHaveCount(0)
  })

  test('countries and position types link to their lists, with the same numbers', async ({
    page,
    request,
  }) => {
    await page.goto('/en/')
    const country = page.locator('.home-next-lab li a').first()
    const href = (await country.getAttribute('href'))!
    expect(href).toMatch(/^\/en\/jobs\/\?country=[A-Z]{2}$/)
    expect(Number(/\((\d+)\)$/.exec((await country.textContent())!)?.[1])).toBe(
      await listMatches(request, href),
    )

    const types = page.locator('.home-window-items a')
    expect(await types.count()).toBeGreaterThan(0)
    for (const type of await types.all()) {
      const typeHref = (await type.getAttribute('href'))!
      expect(typeHref).toMatch(/^\/en\/jobs\/\?type=[a-z-]+$/)
      expect(Number(/\((\d+)\)$/.exec((await type.textContent())!)?.[1])).toBe(
        await listMatches(request, typeHref),
      )
    }
  })
})

test.describe('home page on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phones only')

  test('four rows in each list', async ({ page }) => {
    await page.goto('/en/')
    for (const list of ['home-latest-title', 'home-deadlines-title']) {
      const rows = page.locator(`section[aria-labelledby="${list}"] .job-list > li`)
      await expect(rows.filter({ visible: true })).toHaveCount(4)
    }
  })
})

test.describe('home page without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('everything is there', async ({ page }) => {
    await page.goto('/en/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Where neuroscience meets')
    await expect(page.locator('.home-figures a')).toHaveCount(4)
    await expect(page.locator('.home-next-lab li').first()).toBeVisible()
  })
})

test.describe('the poster', () => {
  test.skip(({ isMobile }) => isMobile, 'the same drawing on every screen')

  test('draws its wave in once, in at most 1.2 s (PLAN §10.2)', async ({ page }) => {
    await page.goto('/en/')
    const timing = await page
      .locator('.poster-art .poster-wave')
      .first()
      .evaluate((wave) => {
        const style = getComputedStyle(wave)
        return {
          name: style.animationName,
          count: style.animationIterationCount,
          // In milliseconds, so that 0.1 s + 1.1 s is exactly 1200.
          ms: Math.round(
            (parseFloat(style.animationDelay) + parseFloat(style.animationDuration)) * 1000,
          ),
        }
      })
    expect(timing.name).not.toBe('none')
    expect(timing.count).toBe('1')
    expect(timing.ms).toBeGreaterThan(0)
    expect(timing.ms).toBeLessThanOrEqual(1200)
  })

  test('is small, and nothing in it comes from elsewhere', async ({ page }) => {
    await page.goto('/en/')
    const markup = await page.locator('.poster-art').evaluate((svg) => svg.outerHTML)
    expect(new TextEncoder().encode(markup).length).toBeLessThanOrEqual(15 * 1024)
    expect(markup).not.toMatch(/<(image|use|text)\b|href=/)
  })

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('does not move', async ({ page }) => {
      await page.goto('/en/')
      const name = await page
        .locator('.poster-art .poster-wave')
        .first()
        .evaluate((wave) => getComputedStyle(wave).animationName)
      expect(name).toBe('none')
    })
  })
})
