import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'

import { FIXED_JOBS, jobPath } from '../../src/scripts/fake-jobs-fixed'

// The jobs list (PLAN §2.4, §3.2, §7.5, §9.3, §9.4). Needs the fake jobs (pnpm fake:jobs): 45 open
// positions, so the list has two pages of 25.

const results = (page: Page) => page.locator('#job-results')
const rows = (page: Page) => results(page).locator('.job-list > li')
const count = (page: Page) => page.locator('#job-results-count')
const rowLink = (page: Page, job: { slug: string; shortId: string }) =>
  results(page).locator(`a[href="${jobPath(job)}"]`)
const filterButton = (page: Page, name: string) =>
  page.locator('summary.filter-button', { hasText: name })
const option = (page: Page, name: string) =>
  page.locator('.filter-panel label', { hasText: new RegExp(`^${name}$`) })

/** The number in "38 positions match". */
const matches = async (page: Page) =>
  Number((await count(page).textContent())?.match(/\d+/)?.[0] ?? 0)

/** Adds up the layout shifts that no recent input explains, from `window.layoutShift = 0` on. */
const recordLayoutShifts = (page: Page) =>
  page.addInitScript(() => {
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
const layoutShift = (page: Page) =>
  page.evaluate(() => (window as unknown as { layoutShift: number }).layoutShift)

test.describe('filtered lists', () => {
  test.skip(({ isMobile }) => isMobile, 'filters work the same on every screen')

  test('the list shows the open positions, 25 per page, and the total', async ({ page }) => {
    await page.goto('/en/jobs/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Neuroscience positions')
    await expect(page.locator('main')).toContainText('45 open positions')
    await expect(count(page)).toHaveText('45 positions match')
    await expect(rows(page)).toHaveCount(25)
    // Job titles are headings one level below the count.
    await expect(results(page).getByRole('heading', { level: 3 })).toHaveCount(25)
  })

  test('by position type', async ({ page }) => {
    await page.goto('/en/jobs/?type=phd')
    const n = await matches(page)
    expect(n).toBeGreaterThan(1)
    expect(n).toBeLessThan(45)
    await expect(rows(page)).toHaveCount(n)
    for (const row of await rows(page).all()) {
      await expect(row.locator('.job-meta dd.font-bold')).toHaveText('PhD')
    }
    await expect(rowLink(page, FIXED_JOBS.open)).toBeVisible()
    await expect(rowLink(page, FIXED_JOBS.closingSoon)).toHaveCount(0)
  })

  test('by subfield', async ({ page }) => {
    await page.goto('/en/jobs/?subfield=glia')
    await expect(rowLink(page, FIXED_JOBS.open)).toBeVisible()
    await expect(rowLink(page, FIXED_JOBS.closingSoon)).toHaveCount(0)
  })

  test('by model system: a parent finds its children (rodent → mouse)', async ({ page }) => {
    await page.goto('/en/jobs/?model=rodent')
    await expect(rowLink(page, FIXED_JOBS.open)).toBeVisible()
    await expect(rowLink(page, FIXED_JOBS.closingSoon)).toBeVisible()
    await expect(rowLink(page, FIXED_JOBS.rolling)).toHaveCount(0)
    const rodent = await matches(page)
    await page.goto('/en/jobs/?model=mouse')
    expect(await matches(page)).toBeLessThanOrEqual(rodent)
    await expect(rowLink(page, FIXED_JOBS.open)).toBeVisible()
  })

  test('by country and by region', async ({ page }) => {
    await page.goto('/en/jobs/?country=SE')
    await expect(rowLink(page, FIXED_JOBS.open)).toBeVisible()
    await expect(rowLink(page, FIXED_JOBS.closingSoon)).toHaveCount(0)
    await page.goto('/en/jobs/?region=europe')
    await expect(rowLink(page, FIXED_JOBS.open)).toBeVisible()
    await expect(rowLink(page, FIXED_JOBS.closingSoon)).toBeVisible()
    await expect(rowLink(page, FIXED_JOBS.rolling)).toHaveCount(0)
  })

  test('the country filter lists only countries with open positions', async ({ page }) => {
    await page.goto('/en/jobs/')
    await filterButton(page, 'Country').click()
    const countries = page.locator('#filter-country label')
    await expect(countries.filter({ hasText: 'Sweden' })).toHaveCount(1)
    await expect(countries.filter({ hasText: 'Afghanistan' })).toHaveCount(0)
    const names = await countries.allTextContents()
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')))
  })

  test('closing within 14 days: the closing-soon position, not the one with 60 days', async ({
    page,
  }) => {
    await page.goto('/en/jobs/?deadline=14d')
    await expect(rowLink(page, FIXED_JOBS.closingSoon)).toBeVisible()
    await expect(rowLink(page, FIXED_JOBS.open)).toHaveCount(0)
    await expect(rowLink(page, FIXED_JOBS.rolling)).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Remove filter: Closes within 14 days' }),
    ).toBeVisible()
  })

  test('by institution, named in its chip', async ({ page }) => {
    await page.goto(`/en/jobs/?institution=${FIXED_JOBS.open.institutionRorId}`)
    await expect(rowLink(page, FIXED_JOBS.open)).toBeVisible()
    await expect(rowLink(page, FIXED_JOBS.closingSoon)).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Remove filter: Karolinska Institutet' }),
    ).toBeVisible()
  })

  test('by free text', async ({ page }) => {
    await page.goto('/en/jobs/?q=astrocyte')
    await expect(rowLink(page, FIXED_JOBS.open)).toBeVisible()
    await expect(page.locator('#job-q')).toHaveValue('astrocyte')
  })

  test('closed, withdrawn and draft positions never appear', async ({ page }) => {
    const hidden = [
      FIXED_JOBS.expiredRecently,
      FIXED_JOBS.expiredLongAgo,
      FIXED_JOBS.withdrawn,
      FIXED_JOBS.draft,
    ]
    for (const path of [
      '/en/jobs/',
      '/en/jobs/?page=2',
      '/en/jobs/?sort=newest',
      '/en/jobs/?sort=newest&page=2',
    ]) {
      await page.goto(path)
      for (const job of hidden)
        await expect(rowLink(page, job), `${job.shortId} on ${path}`).toHaveCount(0)
    }
    for (const job of hidden) {
      await page.goto(`/en/jobs/?q=${encodeURIComponent(job.title)}`)
      await expect(count(page)).toHaveText('No positions match')
    }
  })

  test('unknown values match nothing and get no chip', async ({ page }) => {
    await page.goto('/en/jobs/?type=astronaut')
    await expect(count(page)).toHaveText('No positions match')
    await expect(page.locator('[data-chip]')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Clear all filters' })).toHaveAttribute(
      'href',
      '/en/jobs/',
    )
    await expect(page.getByRole('link', { name: /^Remove the/ })).toHaveCount(0)
  })

  test('the empty state and the chips drop values that name nothing', async ({ page }) => {
    // A retired or mistyped term empties the list; the known filter still works.
    await page.goto('/en/jobs/?subfield=glia&type=astronaut')
    await expect(count(page)).toHaveText('No positions match')
    const back = page.getByRole('link', { name: 'Remove the filters that no longer exist' })
    await expect(back).toHaveAttribute('href', '/en/jobs/?subfield=glia')
    await expect(page.getByRole('link', { name: /^Remove the last filter/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Remove filter: Glial biology' })).toHaveAttribute(
      'href',
      '/en/jobs/',
    )
    await back.click()
    await expect(page).toHaveURL(/\/en\/jobs\/\?subfield=glia$/)
    await expect(rowLink(page, FIXED_JOBS.open)).toBeVisible()
    // Several known values: the last one goes, with the unknown ones.
    await page.goto('/en/jobs/?type=phd&stage=no-such-stage&country=DE')
    await expect(
      page.getByRole('link', { name: 'Remove the filters that no longer exist' }),
    ).toHaveAttribute('href', '/en/jobs/?type=phd&country=DE')
  })

  test('the form drops an institution that does not exist', async ({ page }) => {
    await page.goto('/en/jobs/?institution=abcde')
    await expect(count(page)).toHaveText('No positions match')
    await expect(page.locator('input[name="institution"]')).toHaveCount(0)
    await filterButton(page, 'Position type').click()
    await option(page, 'PhD').click()
    await expect(page).toHaveURL(/\/en\/jobs\/\?type=phd$/)
    await expect(rowLink(page, FIXED_JOBS.open)).toBeVisible()
    // A known institution stays.
    await page.goto(`/en/jobs/?institution=${FIXED_JOBS.open.institutionRorId},abcde`)
    await expect(page.locator('input[name="institution"]')).toHaveAttribute(
      'value',
      FIXED_JOBS.open.institutionRorId,
    )
  })

  test('a range up to the last day there is', async ({ page }) => {
    const response = await page.goto('/en/jobs/?deadline=2026-01-01..9999-12-31')
    expect(response?.status()).toBe(200)
    await expect(rowLink(page, FIXED_JOBS.open)).toBeVisible()
    await expect(rowLink(page, FIXED_JOBS.rolling)).toHaveCount(0)
  })
})

test.describe('order and pages', () => {
  test.skip(({ isMobile }) => isMobile, 'the same on every screen')

  test('deadline order: nearest first, rolling and until-filled after the fixed ones', async ({
    page,
  }) => {
    await page.goto('/en/jobs/')
    await expect(page.locator('#job-sort')).toHaveValue('deadline')
    await expect(results(page).getByText(/^(Rolling deadline|Open until filled)$/)).toHaveCount(0)
    await page.goto('/en/jobs/?page=2')
    const kinds = await rows(page)
      .locator('.deadline')
      .evaluateAll((deadlines) =>
        deadlines.map((d) =>
          /Rolling deadline|Open until filled/.test(d.textContent ?? '') ? 'open-ended' : 'fixed',
        ),
      )
    expect(kinds.indexOf('open-ended')).toBeGreaterThan(0)
    expect(kinds.slice(kinds.indexOf('open-ended'))).not.toContain('fixed')
  })

  test('newest first', async ({ page }) => {
    await page.goto('/en/jobs/?sort=newest')
    await expect(page.locator('#job-sort')).toHaveValue('newest')
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, follow',
    )
    // Rolling and until-filled positions are no longer held back to the end.
    await expect(
      results(page)
        .getByText(/^(Rolling deadline|Open until filled)$/)
        .first(),
    ).toBeVisible()
  })

  test('pagination: real links, the current page marked, Previous and Next', async ({ page }) => {
    await page.goto('/en/jobs/')
    const pages = page.getByRole('navigation', { name: 'Pages' })
    await expect(pages.getByRole('link', { name: 'Page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(pages.getByRole('link', { name: 'Previous' })).toHaveCount(0)
    await expect(pages.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/en/jobs/?page=2',
    )
    await pages.getByRole('link', { name: 'Page 2' }).click()
    await expect(page).toHaveURL(/\/en\/jobs\/\?page=2$/)
    await expect(rows(page)).toHaveCount(20)
    await expect(pages.getByRole('link', { name: 'Page 2' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(pages.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '/en/jobs/')
    await expect(pages.getByRole('link', { name: 'Next' })).toHaveCount(0)
    await expect(page).toHaveTitle(/^Neuroscience positions, page 2/)
  })

  test('a page past the end says so and links to the first', async ({ page }) => {
    await page.goto('/en/jobs/?page=9')
    await expect(rows(page)).toHaveCount(0)
    await expect(page.getByText('This list has 2 pages.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go to the first page' })).toHaveAttribute(
      'href',
      '/en/jobs/',
    )
  })

  test('a page past the end still counts the matches of every filter', async ({ page }) => {
    // Terms a job has several of (subfields, career stages) and the search query other tables.
    for (const query of ['subfield=glia', 'stage=student', 'q=research']) {
      await page.goto(`/en/jobs/?${query}`)
      const n = await matches(page)
      expect(n, query).toBeGreaterThan(0)
      await page.goto(`/en/jobs/?${query}&page=9`)
      await expect(rows(page)).toHaveCount(0)
      expect(await matches(page), query).toBe(n)
      await expect(page.getByText(/^This list has (only 1 page|\d+ pages)\.$/)).toBeVisible()
      await expect(page.getByRole('link', { name: 'Go to the first page' })).toHaveAttribute(
        'href',
        `/en/jobs/?${query}`,
      )
      await expect(page.getByRole('link', { name: 'Clear all filters' })).toHaveCount(0)
    }
  })
})

test.describe('the list in search engines (PLAN §2.1, §16.1)', () => {
  test.skip(({ isMobile }) => isMobile, 'the same on every screen')

  test('the base list is indexed; filtered, sorted and later pages are not', async ({
    request,
  }) => {
    const base = await (await request.get('/en/jobs/')).text()
    expect(base).not.toContain('<meta name="robots"')
    expect(base).toContain('<link rel="canonical" href="https://gliagora.com/en/jobs/"')
    for (const path of [
      '/en/jobs/?type=phd',
      '/en/jobs/?q=glia',
      '/en/jobs/?page=2',
      '/en/jobs/?sort=newest',
      '/en/jobs/?view=map',
    ]) {
      const html = await (await request.get(path)).text()
      expect(html, path).toContain('<meta name="robots" content="noindex, follow"')
      expect(html, path).toContain('<link rel="canonical" href="https://gliagora.com/en/jobs/"')
    }
  })

  test('other spellings of the filters redirect permanently to the canonical address', async ({
    request,
  }) => {
    const response = await request.get(
      '/en/jobs/?type=phd&type=msc&subfield=glia&q=&sort=deadline',
      {
        maxRedirects: 0,
      },
    )
    expect(response.status()).toBe(308)
    expect(response.headers()['location']).toBe('/en/jobs/?subfield=glia&type=msc,phd')
    expect(response.headers()['cache-control']).toBe('public, max-age=86400')
    const canonical = await request.get('/en/jobs/?subfield=glia&type=msc,phd', { maxRedirects: 0 })
    expect(canonical.status()).toBe(200)
  })

  test('campaign tags on our own links are kept (PLAN §13, §16.4)', async ({ request }) => {
    const tagged = await request.get(
      '/en/jobs/?deadline=14d&utm_source=glia-notes&utm_medium=email',
      { maxRedirects: 0 },
    )
    expect(tagged.status()).toBe(200)
    const response = await request.get('/en/jobs/?utm_source=linkedin&type=PhD', {
      maxRedirects: 0,
    })
    expect(response.status()).toBe(308)
    expect(response.headers()['location']).toBe('/en/jobs/?type=phd&utm_source=linkedin')
  })
})

test.describe('with JavaScript', () => {
  test.skip(({ isMobile }) => isMobile, 'the sheet is checked below')

  test('ticking a box updates the address and the results without a page load', async ({
    page,
  }) => {
    await page.goto('/en/jobs/')
    await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1))
    await filterButton(page, 'Position type').click()
    await option(page, 'PhD').click()
    await expect(page).toHaveURL(/\/en\/jobs\/\?type=phd$/)
    await expect(count(page)).not.toHaveText('45 positions match')
    await expect(rowLink(page, FIXED_JOBS.closingSoon)).toHaveCount(0)
    await expect(results(page)).toHaveAttribute('aria-busy', 'false')
    // No page load: the page's own state is still there, the popover open, focus on the box.
    expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1)
    await expect(option(page, 'PhD')).toBeVisible()
    await expect(page.locator('input[name="type"][value="phd"]')).toBeFocused()
    await expect(filterButton(page, 'Position type')).toHaveText('Position type (1)')
    // The header's menu marks the matching entry as the current page.
    await expect(
      page.locator('header nav').first().getByRole('link', { name: 'PhD', includeHidden: true }),
    ).toHaveAttribute('aria-current', 'page')
  })

  // D45: the list's behaviour (ListBehaviour) loads when the reader first reaches for the filters,
  // chips or sort order; what they do before it has arrived is kept and done once it is there.
  test('its script loads when first needed, and a change made before it arrives applies', async ({
    page,
  }) => {
    await page.goto('/en/jobs/', { waitUntil: 'networkidle' })
    await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1))
    // From now on, scripts arrive late.
    const late: string[] = []
    await page.route('**/_next/static/chunks/*.js', async (route) => {
      late.push(route.request().url())
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })
    await filterButton(page, 'Position type').click()
    await option(page, 'PhD').click()
    await expect(page).toHaveURL(/\/en\/jobs\/\?type=phd$/)
    await expect(page.locator('[data-chip]', { hasText: 'PhD' })).toBeVisible()
    expect(late.length).toBeGreaterThan(0)
    expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1)
  })

  test('a chip clicked before the script arrives removes its value without a page load', async ({
    page,
  }) => {
    await page.goto('/en/jobs/?type=phd,postdoc', { waitUntil: 'networkidle' })
    await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1))
    await page.route('**/_next/static/chunks/*.js', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })
    await page.getByRole('link', { name: 'Remove filter: PhD' }).click()
    await expect(page).toHaveURL(/\/en\/jobs\/\?type=postdoc$/)
    await expect(page.getByRole('link', { name: 'Remove filter: Postdoc' })).toBeFocused()
    expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1)
  })

  test('the count is a live region', async ({ page }) => {
    await page.goto('/en/jobs/')
    await expect(page.getByRole('status').filter({ has: count(page) })).toHaveCount(1)
  })

  test('a chip removes its value; focus moves to the next chip', async ({ page }) => {
    await page.goto('/en/jobs/?type=phd,postdoc')
    await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1))
    await page.getByRole('link', { name: 'Remove filter: PhD' }).click()
    await expect(page).toHaveURL(/\/en\/jobs\/\?type=postdoc$/)
    await expect(page.getByRole('link', { name: 'Remove filter: PhD' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Remove filter: Postdoc' })).toBeFocused()
    // The form follows: the removed value is no longer ticked.
    await expect(page.locator('input[name="type"][value="phd"]')).not.toBeChecked()
    await expect(page.locator('input[name="type"][value="postdoc"]')).toBeChecked()
    expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1)
  })

  test('Clear all removes every filter', async ({ page }) => {
    await page.goto('/en/jobs/?subfield=glia&type=phd&deadline=90d')
    await page.locator('.filter-status').getByRole('link', { name: 'Clear all' }).click()
    await expect(page).toHaveURL(/\/en\/jobs\/$/)
    await expect(count(page)).toHaveText('45 positions match')
    await expect(page.locator('[data-chip]')).toHaveCount(0)
    await expect(count(page)).toBeFocused()
  })

  test('the sort order applies when chosen', async ({ page }) => {
    await page.goto('/en/jobs/?type=phd')
    await page.locator('#job-sort').focus()
    await page.locator('#job-sort').selectOption('newest')
    await expect(page).toHaveURL(/\/en\/jobs\/\?type=phd&sort=newest$/)
    await expect(page.locator('#job-sort')).toBeFocused()
  })

  test('Enter in the search box searches', async ({ page }) => {
    await page.goto('/en/jobs/')
    await page.locator('#job-q').fill('  astrocyte  ')
    await page.locator('#job-q').press('Enter')
    await expect(page).toHaveURL(/\/en\/jobs\/\?q=astrocyte$/)
    await expect(rowLink(page, FIXED_JOBS.open)).toBeVisible()
  })

  test('a range of deadline days applies with Apply', async ({ page }) => {
    await page.goto('/en/jobs/')
    await filterButton(page, 'Deadline').click()
    await page.locator('input[name="deadline-from"]').fill('2026-01-01')
    await page.locator('input[name="deadline-to"]').fill('2099-12-31')
    await expect(page.locator('input[name="deadline"][value="range"]')).toBeChecked()
    await page.locator('.filter[open] .filter-apply').click()
    await expect(page).toHaveURL(/\/en\/jobs\/\?deadline=2026-01-01\.\.2099-12-31$/)
    await expect(
      page.getByRole('link', { name: /^Remove filter: Closes 1 Jan 2026 – 31 Dec 2099$/ }),
    ).toBeVisible()
    await expect(rowLink(page, FIXED_JOBS.rolling)).toHaveCount(0)
  })

  test('a range with a day missing or in the wrong order shows an error, not applied', async ({
    page,
  }) => {
    await page.goto('/en/jobs/?type=phd')
    await filterButton(page, 'Deadline').click()
    const from = page.locator('input[name="deadline-from"]')
    const to = page.locator('input[name="deadline-to"]')
    const error = page.getByText('Enter both dates, the first on or before the second.')
    await expect(error).toBeHidden()
    await expect(from).not.toHaveAttribute('aria-invalid')
    await from.fill('2026-12-31')
    await page.locator('.filter[open] .filter-apply').click()
    await expect(error).toBeVisible()
    await expect(to).toBeFocused()
    for (const day of [from, to]) {
      await expect(day).toHaveAttribute('aria-invalid', 'true')
      await expect(day).toHaveAccessibleDescription(
        'Enter both dates, the first on or before the second.',
      )
    }
    await to.fill('2026-10-01')
    await to.press('Enter')
    await expect(error).toBeVisible()
    await expect(page).toHaveURL(/\/en\/jobs\/\?type=phd$/)
    await expect(from).toHaveValue('2026-12-31')
    // Put right, the error goes, and Apply applies.
    await to.fill('2027-01-31')
    await expect(error).toBeHidden()
    await expect(to).not.toHaveAttribute('aria-invalid')
    await page.locator('.filter[open] .filter-apply').click()
    await expect(page).toHaveURL(/\/en\/jobs\/\?type=phd&deadline=2026-12-31\.\.2027-01-31$/)
  })

  test('arrow keys move through the deadline options; Enter applies the one chosen', async ({
    page,
  }) => {
    await page.goto('/en/jobs/')
    await filterButton(page, 'Deadline').click()
    await page.locator('input[name="deadline"][value=""]').focus()
    const before = await page.evaluate(() => history.length)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('input[name="deadline"][value="14d"]')).toBeFocused()
    await expect(page.locator('input[name="deadline"][value="14d"]')).toBeChecked()
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/en\/jobs\/$/)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/en\/jobs\/\?deadline=14d$/)
    expect(await page.evaluate(() => history.length)).toBe(before + 1)
    await expect(page.locator('input[name="deadline"][value="14d"]')).toBeFocused()
  })

  test('long lists narrow as one types in their search box', async ({ page }) => {
    await page.goto('/en/jobs/')
    await filterButton(page, 'Subfield').click()
    const box = page.getByRole('searchbox', { name: 'Search in this list' })
    await box.fill('glia')
    await expect(page.locator('#filter-subfield li:visible')).toHaveCount(1)
    await expect(option(page, 'Glial biology')).toBeVisible()
    await box.fill('')
    await expect(page.locator('#filter-subfield li:visible')).not.toHaveCount(1)
  })

  test('the empty state offers to remove the last filter, clear all or suggest a listing', async ({
    page,
  }) => {
    await page.goto('/en/jobs/?type=phd&q=no+such+position')
    await expect(count(page)).toHaveText('No positions match')
    const removeLast = page.getByRole('link', {
      name: 'Remove the last filter (Search: no such position)',
    })
    await expect(removeLast).toHaveAttribute('href', '/en/jobs/?type=phd')
    await expect(page.getByRole('link', { name: 'Clear all filters' })).toHaveAttribute(
      'href',
      '/en/jobs/',
    )
    await expect(results(page).getByRole('link', { name: 'Suggest a listing' })).toHaveAttribute(
      'href',
      '/en/suggest/',
    )
    await removeLast.click()
    await expect(page).toHaveURL(/\/en\/jobs\/\?type=phd$/)
    await expect(rowLink(page, FIXED_JOBS.open)).toBeVisible()
  })
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('the form filters, and the address becomes canonical', async ({ page, isMobile }) => {
    const redirects: string[] = []
    page.on('response', (response) => {
      if (response.status() === 308) redirects.push(response.url())
    })
    await page.goto('/en/jobs/')
    await expect(page.locator('main')).toContainText('45 open positions')
    if (isMobile) {
      await page.locator('.filter-sheet > summary').click()
    }
    await filterButton(page, 'Position type').click()
    await option(page, 'PhD').click()
    await option(page, 'Postdoc').click()
    await (
      isMobile
        ? page.locator('button[data-close-sheet]')
        : page.locator('.filter[open] .filter-apply')
    ).click()
    await expect(page).toHaveURL(/\/en\/jobs\/\?type=phd,postdoc$/)
    expect(redirects).toHaveLength(1)
    expect(redirects[0]).toContain('type=phd&type=postdoc')
    await expect(rowLink(page, FIXED_JOBS.open)).toBeVisible()
    await expect(rowLink(page, FIXED_JOBS.closingSoon)).toBeVisible()
    await expect(rowLink(page, FIXED_JOBS.rolling)).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Remove filter: PhD' })).toBeVisible()
  })

  test('chips and the sort order work as links and a form', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the same on every screen')
    await page.goto('/en/jobs/?type=phd,postdoc')
    await page.getByRole('link', { name: 'Remove filter: Postdoc' }).click()
    await expect(page).toHaveURL(/\/en\/jobs\/\?type=phd$/)
    await page.locator('#job-sort').selectOption('newest')
    await page.getByRole('button', { name: 'Apply', exact: true }).last().click()
    await expect(page).toHaveURL(/\/en\/jobs\/\?type=phd&sort=newest$/)
  })

  test('a range with a mistake comes back with the error and the days entered', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/en/jobs/?type=phd')
    const phd = await matches(page)
    if (isMobile) await page.locator('.filter-sheet > summary').click()
    await filterButton(page, 'Deadline').click()
    await page.getByLabel('Closes between these dates').check()
    await page.locator('input[name="deadline-from"]').fill('2026-12-31')
    await page.locator('input[name="deadline-to"]').fill('2026-10-01')
    await (
      isMobile
        ? page.locator('button[data-close-sheet]')
        : page.locator('.filter[open] .filter-apply')
    ).click()
    // Not redirected: the page shows what was sent, with the other filters applied.
    await expect(page).toHaveURL(/deadline=range&deadline-from=2026-12-31&deadline-to=2026-10-01/)
    expect(await matches(page)).toBe(phd)
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, follow',
    )
    await expect(
      page.getByText('Enter both dates, the first on or before the second.'),
    ).toBeVisible()
    await expect(page.getByLabel('Closes between these dates')).toBeChecked()
    await expect(page.locator('input[name="deadline-from"]')).toHaveValue('2026-12-31')
    await expect(page.locator('input[name="deadline-to"]')).toHaveValue('2026-10-01')
    await expect(page.locator('input[name="deadline-to"]')).toHaveAttribute('aria-invalid', 'true')
  })

  test('controls that need JavaScript are not shown', async ({ page }) => {
    await page.goto('/en/jobs/')
    await expect(page.locator('[data-list-search]').first()).toBeHidden()
    await expect(page.locator('[data-disclosure-close]')).toBeHidden()
  })
})

test.describe('keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard paths are checked on desktop')

  test('Tab through the bar, open a filter with Enter, Esc closes it and returns focus', async ({
    page,
  }) => {
    await page.goto('/en/jobs/')
    await page.locator('#job-q').focus()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    const type = filterButton(page, 'Position type')
    await expect(type).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(option(page, 'MSc')).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.locator('input[name="type"][value="msc"]')).toBeFocused()
    await page.keyboard.press('Space')
    await expect(page).toHaveURL(/\/en\/jobs\/\?type=msc$/)
    await expect(page.locator('input[name="type"][value="msc"]')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(option(page, 'MSc')).toBeHidden()
    await expect(type).toBeFocused()
    // Space opens a filter too, and the next filter's button follows in the tab order.
    await page.keyboard.press('Tab')
    await expect(filterButton(page, 'Subfield')).toBeFocused()
    await page.keyboard.press('Space')
    await expect(option(page, 'Glial biology')).toBeVisible()
    await page.keyboard.press('Escape')
    // The chips come after the bar.
    let reached = false
    for (let step = 0; step < 12 && !reached; step++) {
      await page.keyboard.press('Tab')
      reached = await page.evaluate(
        () => document.activeElement?.hasAttribute('data-chip') ?? false,
      )
    }
    expect(reached).toBe(true)
    await expect(page.locator(':focus')).toHaveAccessibleName('Remove filter: MSc')
  })

  test('only one filter is open at a time, and a click outside closes it', async ({ page }) => {
    await page.goto('/en/jobs/')
    await filterButton(page, 'Position type').click()
    await filterButton(page, 'Deadline').click()
    await expect(option(page, 'MSc')).toBeHidden()
    await expect(option(page, 'Any deadline')).toBeVisible()
    await page.locator('h1').click()
    await expect(option(page, 'Any deadline')).toBeHidden()
  })
})

test.describe('filter sheet on a phone (PLAN §9.4)', () => {
  test.skip(({ isMobile }) => !isMobile, 'the sheet is for small screens')

  test('opens as a dialog over an inert page; Esc closes it and returns focus', async ({
    page,
  }) => {
    await page.goto('/en/jobs/?type=phd')
    const button = page.locator('.filter-sheet > summary')
    await expect(button).toHaveText('Filters (1)')
    // The bar's controls are inside the closed sheet, out of the accessibility tree.
    await expect(page.getByRole('checkbox', { name: 'PhD' })).toBeHidden()
    await button.click()
    const dialog = page.getByRole('dialog', { name: 'Filters' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog.getByRole('button', { name: 'Close filters' })).toBeFocused()
    await expect(page.locator('header.site-header')).toHaveJSProperty('inert', true)
    await expect(results(page)).toHaveJSProperty('inert', true)
    await expect(page.locator('footer').last()).toHaveJSProperty('inert', true)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(button).toBeFocused()
    await expect(results(page)).toHaveJSProperty('inert', false)
  })

  test('filters apply as they change; "Show N positions" closes the sheet', async ({ page }) => {
    await page.goto('/en/jobs/')
    await page.locator('.filter-sheet > summary').click()
    const dialog = page.getByRole('dialog', { name: 'Filters' })
    await dialog.locator('summary', { hasText: 'Position type' }).click()
    await dialog.locator('label', { hasText: /^PhD$/ }).click()
    await expect(page).toHaveURL(/\/en\/jobs\/\?type=phd$/)
    const show = dialog.getByRole('button', { name: /^Show \d+ positions?$/ })
    await expect(show).not.toHaveText('Show 45 positions')
    const shown = Number((await show.textContent())?.match(/\d+/)?.[0])
    // The page behind the dialog is inert, its count too: the dialog announces the new one.
    await expect(dialog.getByRole('status')).toHaveText(`${shown} positions match`)
    await show.click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('.filter-sheet > summary')).toHaveText('Filters (1)')
    await expect(count(page)).toHaveText(`${shown} positions match`)
    await expect(page.locator('.filter-sheet > summary')).toBeFocused()
  })

  test('when the open sheet leaves the page, the page is usable again', async ({ page }) => {
    await page.goto('/en/jobs/')
    await page.locator('.filter-sheet > summary').click()
    await expect(page.locator('header.site-header')).toHaveJSProperty('inert', true)
    // As when the list's error state replaces the page.
    await page.evaluate(() => document.querySelector('main')?.replaceChildren())
    for (const selector of ['header.site-header', '.skip-link', 'footer']) {
      await expect(page.locator(selector).last(), selector).toHaveJSProperty('inert', false)
    }
  })

  test('a sheet opened before JavaScript runs stays in the page, so nothing moves', async ({
    page,
  }) => {
    let release = () => {}
    const scriptsHeld = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/_next/static/chunks/**/*.js', async (route) => {
      await scriptsHeld
      await route.continue()
    })
    await recordLayoutShifts(page)
    await page.goto('/en/jobs/', { waitUntil: 'commit' })
    await page.locator('.filter-sheet > summary').click()
    await expect(page.locator('.sheet-panel')).toBeVisible()
    await expect(page.locator('html')).not.toHaveAttribute('data-js')
    // Past the 500 ms after the tap in which a shift would not count.
    await page.waitForTimeout(600)
    await page.evaluate(() => ((window as unknown as { layoutShift: number }).layoutShift = 0))
    release()
    await expect(page.locator('html')).toHaveAttribute('data-js', '')
    await page.waitForTimeout(500)
    expect(await layoutShift(page)).toBeLessThanOrEqual(0.01)
    // Not a dialog: the page stays usable; its own button closes it.
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('header.site-header')).toHaveJSProperty('inert', false)
    await page.locator('.filter-sheet > summary').click()
    await expect(page.locator('.sheet-panel')).toBeHidden()
    // Opened again, it is the dialog.
    await page.locator('.filter-sheet > summary').click()
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible()
  })

  test('the close button closes the sheet', async ({ page }) => {
    await page.goto('/en/jobs/')
    await page.locator('.filter-sheet > summary').click()
    await page.getByRole('button', { name: 'Close filters' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.filter-sheet > summary')).toBeFocused()
  })
})

test('an address with a mistaken range, opened with JavaScript, can be put right', async ({
  page,
  isMobile,
}) => {
  await page.goto(
    '/en/jobs/?type=phd&deadline=range&deadline-from=2026-12-31&deadline-to=2026-10-01',
  )
  await expect(page.locator('html')).toHaveAttribute('data-js', '')
  const error = page.getByText('Enter both dates, the first on or before the second.')
  await expect(error).toBeVisible()
  // The sheet the server opened stays in the page: nothing is inert.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('header.site-header')).toHaveJSProperty('inert', false)
  await page.locator('input[name="deadline-to"]').fill('2027-01-31')
  await expect(error).toBeHidden()
  await (
    isMobile
      ? page.locator('button[data-close-sheet]')
      : page.locator('.filter[open] .filter-apply')
  ).click()
  await expect(page).toHaveURL(/\/en\/jobs\/\?type=phd&deadline=2026-12-31\.\.2027-01-31$/)
  // The filter closes with the new list; focus goes to its button, not lost.
  await expect(
    isMobile ? page.locator('.filter-sheet > summary') : filterButton(page, 'Deadline'),
  ).toBeFocused()
})

test.describe('no layout shift when a change arrives late (PLAN §17.1)', () => {
  // Shifts within 500 ms of an input do not count, and the local server answers well within them;
  // real networks may not. So the router's request for the new list is held for 700 ms.
  test.beforeEach(async ({ page }) => {
    await page.route(
      (url) => url.pathname.startsWith('/en/jobs/'),
      async (route) => {
        const headers = route.request().headers()
        if (headers['rsc'] === '1' && !headers['next-router-prefetch']) {
          await new Promise((resolve) => setTimeout(resolve, 700))
        }
        await route.continue()
      },
    )
    await recordLayoutShifts(page)
  })

  /** The layout shift from a change until its list has arrived. */
  const shiftOf = async (page: Page, change: () => Promise<unknown>, url: RegExp) => {
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
    await page.evaluate(() => ((window as unknown as { layoutShift: number }).layoutShift = 0))
    await change()
    await expect(page).toHaveURL(url)
    await expect(results(page)).toHaveAttribute('aria-busy', 'false')
    await page.waitForTimeout(300)
    return layoutShift(page)
  }

  test('ticking boxes, removing a chip, sorting', async ({ page, isMobile }) => {
    await page.goto('/en/jobs/')
    const tick = async (name: string) => {
      const panel = isMobile ? page.getByRole('dialog') : page
      await panel.locator('label', { hasText: new RegExp(`^${name}$`) }).click()
    }
    if (isMobile) {
      await page.locator('.filter-sheet > summary').click()
      await page.getByRole('dialog').locator('summary', { hasText: 'Position type' }).click()
    } else {
      await filterButton(page, 'Position type').click()
    }
    expect(await shiftOf(page, () => tick('PhD'), /\?type=phd$/)).toBeLessThanOrEqual(0.02)
    expect(await shiftOf(page, () => tick('Postdoc'), /\?type=phd,postdoc$/)).toBeLessThanOrEqual(
      0.02,
    )
    if (isMobile) await page.getByRole('dialog').getByRole('button', { name: /^Show/ }).click()
    else await page.keyboard.press('Escape')
    const chip = page.getByRole('link', { name: 'Remove filter: PhD' })
    expect(await shiftOf(page, () => chip.click(), /\?type=postdoc$/)).toBeLessThanOrEqual(0.02)
    const sort = () => page.locator('#job-sort').selectOption('newest')
    expect(await shiftOf(page, sort, /\?type=postdoc&sort=newest$/)).toBeLessThanOrEqual(0.02)
  })
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`open filters pass axe (${colorScheme} mode)`, async ({ page, isMobile }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/en/jobs/?type=phd&subfield=glia')
    if (isMobile) {
      await page.locator('.filter-sheet > summary').click()
      await page.getByRole('dialog').locator('summary', { hasText: 'Method' }).click()
    } else {
      await filterButton(page, 'Method').click()
    }
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
}
