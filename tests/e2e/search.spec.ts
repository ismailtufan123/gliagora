import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'

import { FIXED_JOBS, jobPath } from '../../src/scripts/fake-jobs-fixed'

// Search (PLAN §2.3, §3.2, §7.5): the /en/search/ page, the header's search link and dialog, and
// the jobs list's free text. Needs the ROR test data and the fake jobs (pnpm fake:jobs).

const search = (page: Page, q: string) => page.goto(`/en/search/?${new URLSearchParams({ q })}`)
const group = (page: Page, name: string) =>
  page.locator('main section').filter({ has: page.getByRole('heading', { level: 2, name }) })
const positionLink = (page: Page, job: { slug: string; shortId: string }) =>
  group(page, 'Positions').locator(`a[href="${jobPath(job)}"]`)
const dialog = (page: Page) => page.locator('dialog#search-dialog')
const trigger = (page: Page) => page.locator('header a[data-search-open]').first()

test.describe('search page', () => {
  test.skip(({ isMobile }) => isMobile, 'the page works the same on every screen')

  test('finds an open position by words of its title', async ({ page }) => {
    await search(page, 'astrocyte neuron')
    await expect(positionLink(page, FIXED_JOBS.open)).toBeVisible()
    // Title words rank first; the count is in the status region.
    await expect(group(page, 'Positions').locator('.job-list > li').first()).toContainText(
      FIXED_JOBS.open.title,
    )
    await expect(page.getByRole('status')).toContainText(/\d+ results? for “astrocyte neuron”/)
  })

  test('never finds closed, withdrawn or draft positions', async ({ page }) => {
    for (const job of [
      FIXED_JOBS.expiredRecently,
      FIXED_JOBS.expiredLongAgo,
      FIXED_JOBS.withdrawn,
      FIXED_JOBS.draft,
    ]) {
      await search(page, `"${job.title}"`)
      await expect(page.locator(`a[href="${jobPath(job)}"]`), job.shortId).toHaveCount(0)
    }
    await search(page, 'neurobiology')
    await expect(page.locator(`a[href="${jobPath(FIXED_JOBS.draft)}"]`)).toHaveCount(0)
  })

  test('finds the last word as the start of a longer one', async ({ page }) => {
    await search(page, 'astro')
    await expect(positionLink(page, FIXED_JOBS.open)).toBeVisible()
  })

  test('finds institutions by name, folding Turkish letters and accents', async ({ page }) => {
    await search(page, 'karolinska')
    const institutions = group(page, 'Institutions')
    await expect(
      institutions.getByRole('link', { name: 'Karolinska Institutet', exact: true }),
    ).toHaveAttribute('href', '/en/institutions/karolinska-institutet-056d84691/')
    // Its open positions too, by the institution's name.
    await expect(positionLink(page, FIXED_JOBS.open)).toBeVisible()

    for (const [q, name] of [
      ['İSTANBUL', 'Istanbul University'],
      ['ıstanbul', 'Istanbul University'],
      ['koc', 'Koç University'],
      ['BOGAZICI', 'Boğaziçi University'],
    ] as const) {
      await search(page, q)
      await expect(
        group(page, 'Institutions').getByRole('link', { name, exact: true }),
        q,
      ).toBeVisible()
    }
  })

  test('does not need a word that is left out, even in a phrase', async ({ page }) => {
    for (const q of ['karolinska -"university hospital"', 'karolinska –hospital']) {
      await search(page, q)
      await expect(
        group(page, 'Institutions').getByRole('link', {
          name: 'Karolinska Institutet',
          exact: true,
        }),
        q,
      ).toBeVisible()
    }
  })

  test('"glia" finds the Glial biology subfield', async ({ page }) => {
    await search(page, 'glia')
    await expect(
      group(page, 'Subfields').getByRole('link', { name: 'Glial biology' }),
    ).toHaveAttribute('href', '/en/subfields/glia/')
  })

  test('links to the jobs list with the same search, which counts the same', async ({ page }) => {
    await search(page, 'research')
    const count = Number(
      (await group(page, 'Positions').locator('.result-head p').textContent())?.match(/\d+/)?.[0],
    )
    const all = group(page, 'Positions').getByRole('link', { name: /^See all \d+ positions/ })
    await expect(all).toHaveAttribute('href', '/en/jobs/?q=research')
    await all.click()
    await expect(page.locator('#job-results-count')).toHaveText(`${count} positions match`)
  })

  test('without a query: hints and the windows', async ({ page }) => {
    const response = await page.goto('/en/search/')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'What are you looking for?' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Jobs', exact: true }).last()).toHaveAttribute(
      'href',
      '/en/jobs/',
    )
    await expect(page.getByRole('link', { name: 'All subfields' })).toBeVisible()
  })

  test('nothing found: suggestions', async ({ page }) => {
    await search(page, 'zzqxv')
    await expect(page.getByRole('status')).toHaveText('No results for “zzqxv”')
    await expect(page.getByRole('heading', { name: 'Some ideas' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Browse all positions' })).toHaveAttribute(
      'href',
      '/en/jobs/',
    )
    await expect(page.getByRole('link', { name: 'Suggest a listing' })).toHaveAttribute(
      'href',
      '/en/suggest/',
    )
  })

  test('is not indexed, with /en/search/ as its canonical address', async ({ page }) => {
    await search(page, 'glia')
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, follow',
    )
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/en\/search\/$/,
    )
  })

  test('keeps the query in the field, and punctuation matches nothing', async ({ page }) => {
    await search(page, '  "cortical   circuit"  ')
    await expect(page.locator('#search-q')).toHaveValue('"cortical circuit"')
    const response = await search(page, "':* & | ! ( )")
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('status')).toContainText('No results')
  })
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('the form searches, and the header link leads to the search page', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/en/contact/')
    await trigger(page).click()
    await expect(page).toHaveURL(/\/en\/search\/$/)
    await page.locator('#search-q').fill('astrocyte')
    await page.locator('#search-q').press('Enter')
    await expect(page).toHaveURL(/\/en\/search\/\?q=astrocyte$/)
    await expect(positionLink(page, FIXED_JOBS.open)).toBeVisible()
    // No shortcut without the script that makes it work.
    if (!isMobile) await expect(page.locator('.search-hint')).toBeHidden()
  })
})

test.describe('search dialog', () => {
  test.skip(({ isMobile }) => isMobile, 'the keyboard shortcut is for keyboards')

  test('Ctrl+K opens it; typing and Enter show the results', async ({ page }) => {
    await page.goto('/en/jobs/')
    await expect(page.locator('html[data-js]')).toBeAttached()
    await page.keyboard.press('ControlOrMeta+k')
    await expect(dialog(page)).toBeVisible()
    await expect(page.locator('#search-dialog-input')).toBeFocused()
    await page.keyboard.type('glia')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/en\/search\/\?q=glia$/)
    await expect(
      group(page, 'Subfields').getByRole('link', { name: 'Glial biology' }),
    ).toBeVisible()
  })

  test('Esc closes it and returns focus to where it was', async ({ page }) => {
    await page.goto('/en/contact/')
    await expect(page.locator('html[data-js]')).toBeAttached()
    const link = page.locator('main a').first()
    await link.focus()
    await page.keyboard.press('ControlOrMeta+k')
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await expect(link).toBeFocused()
  })

  test('the header link opens it, and focus returns to the link', async ({ page }) => {
    await page.goto('/en/')
    await expect(page.locator('html[data-js]')).toBeAttached()
    await expect(trigger(page)).toHaveAttribute('aria-keyshortcuts', 'Control+K')
    await expect(trigger(page)).toHaveAttribute('aria-haspopup', 'dialog')
    await expect(page.locator('.search-hint [data-key="ctrl"]')).toBeVisible()
    await trigger(page).click()
    await expect(dialog(page)).toBeVisible()
    await expect(page).toHaveURL(/\/en\/$/)
    await page.keyboard.press('Escape')
    await expect(trigger(page)).toBeFocused()
    // The close button and a click beside the dialog close it too.
    await trigger(page).click()
    await dialog(page).getByRole('button', { name: 'Close search' }).click()
    await expect(dialog(page)).toBeHidden()
    await trigger(page).click()
    await page.mouse.click(5, 790)
    await expect(dialog(page)).toBeHidden()
  })

  test('opened from a menu, Esc returns focus to the menu item', async ({ page }) => {
    await page.goto('/en/')
    await expect(page.locator('html[data-js]')).toBeAttached()
    await page.locator('header nav details[data-disclosure] > summary').first().click()
    const item = page.locator('header nav details[data-disclosure][open] .menu-item', {
      hasText: 'PhD',
    })
    await item.focus()
    await page.keyboard.press('ControlOrMeta+k')
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await expect(item).toBeFocused()

    // The same from a filter popover of the jobs list.
    await page.goto('/en/jobs/')
    await expect(page.locator('html[data-js]')).toBeAttached()
    await page.locator('details.filter > summary').first().click()
    const option = page.locator('details.filter[open] input').first()
    await option.focus()
    await page.keyboard.press('ControlOrMeta+k')
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(option).toBeFocused()
  })

  test('the page behind it does not scroll', async ({ page }) => {
    await page.goto('/en/jobs/')
    await expect(page.locator('html[data-js]')).toBeAttached()
    await page.evaluate(() => window.scrollTo(0, 400))
    await page.keyboard.press('ControlOrMeta+k')
    await expect(dialog(page)).toBeVisible()
    await page.mouse.move(20, 700)
    await page.mouse.wheel(0, 600)
    // Give a scroll the time to happen.
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.scrollY)).toBe(400)
  })

  test('selecting the text by dragging past its edge keeps it open', async ({ page }) => {
    await page.goto('/en/contact/')
    await expect(page.locator('html[data-js]')).toBeAttached()
    await page.keyboard.press('ControlOrMeta+k')
    const input = page.locator('#search-dialog-input')
    await input.fill('postdoc karolinska')
    // The dialog's code loads on first use; its backdrop click closes the dialog once it has.
    await page.waitForLoadState('networkidle')
    const field = (await input.boundingBox())!
    const box = (await dialog(page).boundingBox())!
    await page.mouse.move(field.x + field.width - 10, field.y + field.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x - 20, field.y + field.height / 2, { steps: 8 })
    await page.mouse.up()
    await expect(dialog(page)).toBeVisible()
    // A click on the backdrop still closes it.
    await page.mouse.click(box.x - 20, box.y + box.height + 40)
    await expect(dialog(page)).toBeHidden()
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`passes axe when open (${colorScheme} mode)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto('/en/contact/')
      await expect(page.locator('html[data-js]')).toBeAttached()
      await page.keyboard.press('ControlOrMeta+k')
      await expect(dialog(page)).toBeVisible()
      // The dialog fades in; measured halfway, its text would fail the contrast check.
      await dialog(page).evaluate((element) =>
        Promise.all(
          element.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
        ),
      )
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      )
      expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([])
    })
  }
})

test.describe('search on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch screens')

  test('the header search icon opens the dialog, with no shortcut shown', async ({ page }) => {
    await page.goto('/en/')
    await expect(page.locator('html[data-js]')).toBeAttached()
    await expect(trigger(page)).toHaveAccessibleName('Search')
    await expect(page.locator('.search-hint')).toBeHidden()
    await trigger(page).tap()
    await expect(dialog(page)).toBeVisible()
    await page.locator('#search-dialog-input').fill('karolinska')
    await page.locator('#search-dialog-input').press('Enter')
    await expect(page).toHaveURL(/\/en\/search\/\?q=karolinska$/)
    await expect(
      group(page, 'Institutions').getByRole('link', { name: 'Karolinska Institutet', exact: true }),
    ).toBeVisible()
  })

  test('below 360px the search link is in the menu', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto('/en/')
    await expect(page.locator('html[data-js]')).toBeAttached()
    await expect(trigger(page)).toBeHidden()
    await page.locator('header summary.button').click()
    const link = page.locator('.mobile-panel a[data-search-open]')
    await expect(link).toBeFocused()
    await link.click()
    await expect(dialog(page)).toBeVisible()
  })
})

test.describe("the jobs list's free text", () => {
  test.skip(({ isMobile }) => isMobile, 'filters work the same on every screen')

  test('pages and counts stay right, also with other filters', async ({ page }) => {
    await page.goto('/en/jobs/?q=research')
    const count = Number(
      (await page.locator('#job-results-count').textContent())?.match(/\d+/)?.[0],
    )
    expect(count).toBeGreaterThan(25)
    await expect(page.locator('#job-results .job-list > li')).toHaveCount(25)
    await page.goto('/en/jobs/?q=research&page=2')
    await expect(page.locator('#job-results-count')).toHaveText(`${count} positions match`)
    await expect(page.locator('#job-results .job-list > li')).toHaveCount(count - 25)

    await page.goto('/en/jobs/?type=phd&q=research')
    const phd = Number((await page.locator('#job-results-count').textContent())?.match(/\d+/)?.[0])
    expect(phd).toBeGreaterThan(0)
    expect(phd).toBeLessThan(count)
    for (const row of await page.locator('#job-results .job-list > li').all()) {
      await expect(row.locator('.job-meta dd.font-bold')).toHaveText('PhD')
    }
  })

  test('folds case and accents, finds prefixes and institution names', async ({ page }) => {
    for (const q of ['ASTROCYTE', 'astro', 'karolinska phd']) {
      await page.goto(`/en/jobs/?${new URLSearchParams({ q })}`)
      await expect(
        page.locator(`#job-results a[href="${jobPath(FIXED_JOBS.open)}"]`),
        q,
      ).toBeVisible()
    }
    await page.goto('/en/jobs/?q=%C4%B1stanbul')
    await expect(page.locator('#job-results-count')).not.toHaveText('No positions match')
  })

  test('needs every word, the ninth too, but a phrase within one field', async ({ page }) => {
    // Nine words; only the last one, "karolinska", is in the institution's name alone.
    const q = 'phd position astrocyte neuron signalling fully funded doctoral karolinska'
    await page.goto(`/en/jobs/?${new URLSearchParams({ q })}`)
    await expect(page.locator(`#job-results a[href="${jobPath(FIXED_JOBS.open)}"]`)).toBeVisible()
    // The title ends with "signalling", the institution's name starts with "Karolinska".
    await page.goto(`/en/jobs/?${new URLSearchParams({ q: '"signalling karolinska"' })}`)
    await expect(page.locator('#job-results-count')).toHaveText('No positions match')
    await page.goto(`/en/jobs/?${new URLSearchParams({ q: '"karolinska institutet"' })}`)
    await expect(page.locator(`#job-results a[href="${jobPath(FIXED_JOBS.open)}"]`)).toBeVisible()
  })
})

test.describe('the 404 page', () => {
  test.use({ javaScriptEnabled: false })

  test('has the search form, which works without JavaScript', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist/')
    expect(response?.status()).toBe(404)
    const form = page.locator('main form[role="search"]')
    await expect(form).toBeVisible()
    await form.getByLabel('Search positions, institutions and subfields').fill('karolinska')
    await form.getByRole('button', { name: 'Search' }).click()
    await expect(page).toHaveURL(/\/en\/search\/\?q=karolinska$/)
    await expect(positionLink(page, FIXED_JOBS.open)).toBeVisible()
  })
})
