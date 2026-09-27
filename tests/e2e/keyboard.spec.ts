import { expect, test } from '@playwright/test'

import { PAGES } from './pages'

// PLAN §7.5, §17.2: the skip link is the first focusable element and moves focus to the content.
for (const page of PAGES) {
  test(`${page.name}: skip link is first and reaches main`, async ({ page: tab, isMobile }) => {
    test.skip(isMobile, 'keyboard paths are checked on desktop')
    await tab.goto(page.path)
    await tab.keyboard.press('Tab')
    const skip = tab.locator(':focus')
    await expect(skip).toHaveAttribute('href', '#main')
    await expect(skip).toBeVisible()
    await tab.keyboard.press('Enter')
    await expect(tab).toHaveURL(/#main$/)
    await expect(tab.locator('main#main')).toBeVisible()
  })
}
