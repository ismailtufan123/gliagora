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

// The account's own navigation (M4b): the current page is marked, and Tab goes on to the saved
// positions (with how many there are), the privacy page, Sign out and then into the page, whose
// first control is the Glia Notes consent box (never ticked in advance). Nothing is pressed: the
// test member's session is shared with other tests.
test('account navigation by keyboard', async ({ page, isMobile, baseURL }) => {
  test.skip(isMobile, 'keyboard paths are checked on desktop')
  await signInAs(page.context(), 'email', baseURL!)
  await page.goto('/en/account/')
  const nav = page.getByRole('navigation', { name: 'Your account' })
  const current = nav.getByRole('link', { name: 'Account' })
  await expect(current).toHaveAttribute('aria-current', 'page')
  await current.focus()
  await page.keyboard.press('Tab')
  await expect(nav.getByRole('link', { name: 'Saved (3)' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(nav.getByRole('link', { name: 'Privacy' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(nav.getByRole('button', { name: 'Sign out' })).toBeFocused()
  await page.keyboard.press('Tab')
  const consent = page.getByRole('checkbox', { name: 'I agree to receive Glia Notes by email.' })
  await expect(consent).toBeFocused()
  await expect(consent).not.toBeChecked()
})

// The privacy page (M4b): marked in the account navigation; after Sign out, Tab reaches Download
// my data, Sign out everywhere and Delete my account (a link to the confirmation page, never a
// dialog), then the links to the privacy policy and the data requests page. Nothing is pressed.
test('privacy page by keyboard', async ({ page, isMobile, baseURL }) => {
  test.skip(isMobile, 'keyboard paths are checked on desktop')
  await signInAs(page.context(), 'email', baseURL!)
  await page.goto('/en/account/privacy/')
  const nav = page.getByRole('navigation', { name: 'Your account' })
  await expect(nav.getByRole('link', { name: 'Privacy' })).toHaveAttribute('aria-current', 'page')
  await nav.getByRole('button', { name: 'Sign out' }).focus()
  const main = page.locator('main')
  for (const control of [
    main.getByRole('link', { name: 'Download my data' }),
    main.getByRole('button', { name: 'Sign out everywhere' }),
    main.getByRole('link', { name: 'Delete my account' }),
    main.getByRole('link', { name: 'privacy policy' }),
    main.getByRole('link', { name: 'data requests' }),
  ]) {
    await page.keyboard.press('Tab')
    await expect(control).toBeFocused()
  }
  await expect(main.getByRole('link', { name: 'Delete my account' })).toHaveAttribute(
    'href',
    '/en/account/privacy/delete/',
  )
})
