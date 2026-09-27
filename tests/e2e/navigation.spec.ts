import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'

// PLAN §2.3, §7.5, §17.2: header menus follow the disclosure pattern, work without JavaScript,
// and every link in the header and footer leads to a page.

const header = (tab: Page) => tab.locator('header.site-header')
// Menu buttons are <summary> elements. Screen readers announce them as buttons, but Playwright
// gives them no role, so they are found by their accessible name.
const menuButton = (tab: Page) => header(tab).locator('summary.button')

test.describe('desktop navigation', () => {
  test.skip(({ isMobile }) => isMobile, 'the desktop navigation shows from 1280px')

  test('a mega-menu opens from its button, and Esc closes it and returns focus', async ({
    page,
  }) => {
    await page.goto('/en/')
    const nav = header(page).getByRole('navigation', { name: 'Main' })
    const jobsLink = nav.getByRole('link', { name: 'Jobs', exact: true })
    await expect(jobsLink).toHaveAttribute('href', '/en/jobs/')

    const button = nav.getByRole('group').first().locator('summary')
    await expect(button).toHaveAccessibleName('Jobs menu')
    await jobsLink.focus()
    await page.keyboard.press('Tab')
    await expect(button).toBeFocused()
    await page.keyboard.press('Enter')
    const allPositions = nav.getByRole('link', { name: 'All positions' })
    await expect(allPositions).toBeVisible()

    await page.keyboard.press('Tab')
    await expect(allPositions).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(allPositions).toBeHidden()
    await expect(button).toBeFocused()
  })

  test('only one mega-menu is open at a time, and a click outside closes it', async ({ page }) => {
    await page.goto('/en/')
    const nav = header(page).getByRole('navigation', { name: 'Main' })
    await nav.getByLabel('Jobs menu').click()
    await expect(nav.getByRole('link', { name: 'All positions' })).toBeVisible()
    await nav.getByLabel('Events menu').click()
    await expect(nav.getByRole('link', { name: 'All events' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'All positions' })).toBeHidden()
    await page.mouse.click(5, 700)
    await expect(nav.getByRole('link', { name: 'All events' })).toBeHidden()
  })

  test('the current page is marked in the navigation', async ({ page }) => {
    await page.goto('/en/jobs/')
    const nav = header(page).getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: 'Jobs', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('the language menu names the current language and what is coming', async ({ page }) => {
    await page.goto('/en/contact/')
    const button = header(page).getByLabel('Language: English (EN)')
    await button.click()
    const turkish = header(page).getByRole('link', { name: 'Türkçe' })
    await expect(turkish).toHaveAttribute('href', '/tr/iletisim/')
    await expect(turkish).toHaveAttribute('lang', 'tr')
    await expect(
      header(page).locator('.menu-panel').getByText('More languages coming'),
    ).toBeVisible()
  })
})

test.describe('mobile menu', () => {
  test.skip(({ isMobile }) => !isMobile, 'the mobile menu shows below 1280px')

  test('opens as a full-height panel, makes the page inert, and Esc closes it', async ({
    page,
  }) => {
    await page.goto('/en/')
    const button = menuButton(page)
    await expect(button).toHaveAccessibleName('Menu')
    await button.click()
    const jobs = header(page).locator('.mobile-panel summary').first()
    await expect(jobs).toBeFocused()
    await expect(page.locator('main')).toHaveJSProperty('inert', true)
    await expect(page.locator('footer')).toHaveJSProperty('inert', true)

    await jobs.click()
    await expect(header(page).getByRole('link', { name: 'All positions' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(header(page).getByRole('link', { name: 'All positions' })).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(header(page).locator('.mobile-panel')).toBeHidden()
    await expect(button).toBeFocused()
    await expect(page.locator('main')).toHaveJSProperty('inert', false)
  })
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('the menus still open', async ({ page, isMobile }) => {
    await page.goto('/en/')
    if (isMobile) {
      await menuButton(page).click()
      await expect(header(page).locator('.mobile-panel')).toBeVisible()
    } else {
      await header(page).getByLabel('Resources menu').click()
      await expect(header(page).getByRole('link', { name: 'Datasets' })).toBeVisible()
    }
  })
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`open menus pass axe (${colorScheme} mode)`, async ({ page, isMobile }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/en/contact/')
    if (isMobile) {
      await menuButton(page).click()
      await header(page).locator('.mobile-panel summary').first().click()
    } else {
      await header(page).getByLabel('Jobs menu').click()
    }
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
}

test('every link in the header and footer leads to a page', async ({ page, request }) => {
  await page.goto('/en/')
  const hrefs = await page
    .locator('header a[href], footer a[href]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  const internal = [...new Set(hrefs.filter((href) => href.startsWith('/')))]
  expect(internal.length).toBeGreaterThan(10)
  for (const href of internal) {
    const response = await request.get(href)
    expect(response.status(), href).toBe(200)
  }
})

test('placeholder pages are not indexed', async ({ request }) => {
  const html = await (await request.get('/en/jobs/')).text()
  expect(html).toContain('<meta name="robots" content="noindex"')
})
