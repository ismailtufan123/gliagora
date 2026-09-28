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

  test('using the header while scrolled does not move the page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 })
    await page.goto('/en/contact/')
    await page.evaluate(() => window.scrollTo(0, 300))
    const nav = header(page).getByRole('navigation', { name: 'Main' })
    await nav.getByLabel('Jobs menu').click()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Escape')
    expect(await page.evaluate(() => window.scrollY)).toBe(300)
    // Focusing a link in the content may scroll to it; moving back into the header must not.
    await page.locator('main a').first().focus()
    const beforeShiftTab = await page.evaluate(() => window.scrollY)
    await page.keyboard.press('Shift+Tab')
    await expect(page.locator(':focus')).toHaveText('Get the monthly digest')
    expect(await page.evaluate(() => window.scrollY)).toBe(beforeShiftTab)
  })

  test('the current page is marked in the navigation', async ({ page }) => {
    await page.goto('/en/jobs/')
    const nav = header(page).getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: 'Jobs', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('on a filtered list, the matching menu entry is current, not "All positions"', async ({
    page,
  }) => {
    await page.goto('/en/jobs/?type=phd')
    const nav = header(page).getByRole('navigation', { name: 'Main' })
    await nav.getByLabel('Jobs menu').click()
    await expect(nav.getByRole('link', { name: 'PhD' })).toHaveAttribute('aria-current', 'page')
    await expect(nav.getByRole('link', { name: 'All positions' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  test('focus in a mega-menu moves to the menu button when the window narrows', async ({
    page,
  }) => {
    await page.goto('/en/')
    await header(page).getByLabel('Jobs menu').click()
    await header(page).getByRole('link', { name: 'All positions' }).focus()
    await page.setViewportSize({ width: 1024, height: 800 })
    await expect(menuButton(page)).toBeFocused()
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

test.describe('mobile menu, small landscape screen', () => {
  test.skip(({ isMobile }) => !isMobile, 'the mobile menu shows below 1280px')
  test.use({ viewport: { width: 667, height: 375 } })

  test('tabbing out of an open section keeps the focused item in view', async ({ page }) => {
    await page.goto('/en/')
    await menuButton(page).click()
    const panel = header(page).locator('.mobile-panel')
    await panel.locator('summary').first().click()
    await panel.getByRole('link', { name: 'Suggest a listing' }).focus()
    await page.keyboard.press('Tab')
    const focused = page.locator(':focus')
    await expect(focused).toHaveText('Events')
    await expect(focused).toBeInViewport()
  })

  test('focus in the mobile menu moves to the desktop navigation when the window widens', async ({
    page,
  }) => {
    await page.goto('/en/')
    await menuButton(page).click()
    await header(page).locator('.mobile-panel summary').first().click()
    await header(page).locator('.mobile-panel').getByRole('link', { name: 'PhD' }).focus()
    await page.setViewportSize({ width: 1300, height: 800 })
    await expect(
      header(page)
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Jobs', exact: true }),
    ).toBeFocused()
  })
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('the menus still open', async ({ page, isMobile }) => {
    await page.goto('/en/')
    if (isMobile) {
      await menuButton(page).click()
      await expect(header(page).locator('.mobile-panel')).toBeVisible()
      // The page behind the panel is hidden, so Tab cannot reach it.
      await expect(page.locator('main')).toBeHidden()
      await expect(page.locator('footer')).toBeHidden()
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

// WCAG 1.4.12: with the text-spacing overrides, nothing may be cut off or scroll sideways.
const TEXT_SPACING =
  '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }'
for (const width of [320, 1280]) {
  for (const path of ['/en/contact/', '/tr/iletisim/']) {
    test(`${path} at ${width}px with text spacing has no horizontal scroll`, async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, 'the width is set explicitly')
      await page.setViewportSize({ width, height: 800 })
      await page.goto(path)
      await page.addStyleTag({ content: TEXT_SPACING })
      const overflow = await page.evaluate(
        () =>
          // Against the layout's width: clientWidth includes the space scrollbar-gutter keeps.
          document.documentElement.scrollWidth -
          Math.round(document.documentElement.getBoundingClientRect().width),
      )
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }
}

test('the header lockup fits at 320px, divider included', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the width is set explicitly')
  await page.setViewportSize({ width: 320, height: 640 })
  for (const path of ['/en/', '/tr/iletisim/']) {
    await page.goto(path)
    const lockup = header(page).locator('a').first()
    const fits = await lockup.evaluate((a) => a.scrollWidth <= a.clientWidth)
    expect(fits, path).toBe(true)
    await expect(lockup.locator('[aria-hidden="true"]')).toHaveCSS('width', '2px')
  }
})

test('in forced-colours mode the header keeps a visible edge', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/en/')
  await expect(header(page)).toHaveCSS('border-bottom-width', '1px')
})

for (const path of ['/en/', '/tr/iletisim/']) {
  test(`${path}: every link in the header and footer leads to a page`, async ({
    page,
    request,
  }) => {
    await page.goto(path)
    const hrefs = await page
      .locator('header a[href], footer a[href]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
    const internal = [...new Set(hrefs.filter((href) => href.startsWith('/')))]
    expect(internal.length).toBeGreaterThan(10)
    for (const href of internal) {
      // No redirect either: every link already ends with a slash (PLAN §2.1).
      const response = await request.get(href, { maxRedirects: 0 })
      expect(response.status(), href).toBe(200)
    }
  })
}

test('the Turkish language menu links back to the English page', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the language menu shows in the header from 768px')
  await page.goto('/tr/iletisim/')
  await header(page).getByLabel('Dil: Türkçe (TR)').click()
  const english = header(page).locator('.menu-panel').getByRole('link', { name: 'English' })
  await expect(english).toHaveAttribute('href', '/en/contact/')
  await expect(english).toHaveAttribute('hreflang', 'en')
})

test('placeholder pages are not indexed', async ({ request }) => {
  const html = await (await request.get('/en/events/')).text()
  expect(html).toContain('<meta name="robots" content="noindex"')
})
