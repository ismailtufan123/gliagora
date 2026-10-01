import { expect, test } from '@playwright/test'

import { asTemplateMember, signInAs } from './member'
import { PAGES } from './pages'

// PLAN §7.5, §17.2: the skip link is the first focusable element and moves focus to the content.
for (const page of PAGES) {
  test(`${page.name}: skip link is first and reaches main`, async ({
    page: tab,
    isMobile,
    baseURL,
  }) => {
    test.skip(isMobile, 'keyboard paths are checked on desktop')
    await asTemplateMember(tab, page, baseURL)
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

// The account's own navigation (M4b): the current page is marked, and Tab goes on to Sign out and
// then into the page. Nothing is pressed: the test member's session is shared with other tests.
test('account navigation by keyboard', async ({ page, isMobile, baseURL }) => {
  test.skip(isMobile, 'keyboard paths are checked on desktop')
  await signInAs(page.context(), 'email', baseURL!)
  await page.goto('/en/account/')
  const nav = page.getByRole('navigation', { name: 'Your account' })
  const current = nav.getByRole('link', { name: 'Account' })
  await expect(current).toHaveAttribute('aria-current', 'page')
  await current.focus()
  await page.keyboard.press('Tab')
  await expect(nav.getByRole('button', { name: 'Sign out' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Sign out everywhere' })).toBeFocused()
})
