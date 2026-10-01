import { expect, test } from '@playwright/test'

import { editorHeaders, editorPassword } from './editor'

// The Turkish editor guide (docs/editor-guide-tr.md) inside the admin, behind "Yardım" at the end
// of the side menu (D45, src/admin/help.ts).

const TITLE = 'Gliagora yönetim paneli: editör rehberi'

test.describe('the editor guide in the admin', () => {
  test.skip(({ isMobile }) => isMobile, 'the admin is the same on a phone')

  test('signed out, it sends to the sign-in page', async ({ page }) => {
    await page.goto('/admin/help/')
    await expect(page).toHaveURL(/\/admin\/login\/?\?redirect=/)
    await expect(page.getByRole('heading', { name: TITLE })).toHaveCount(0)
  })

  test('“Yardım” in the side menu opens it', async ({ page }) => {
    test.skip(
      !editorPassword && !process.env.CI,
      'needs the test editor: E2E_EDITOR_PASSWORD=… pnpm e2e:editor',
    )
    await page.context().setExtraHTTPHeaders(editorHeaders())
    await page.goto('/admin/')
    // Below Payload's widest layout (1440px; the desktop project is 1280px wide) the side menu
    // closes once the admin has started in the browser, and its button then says "Open Menu":
    // waiting for that button waits for the menu to settle.
    await page.getByRole('button', { name: 'Open Menu' }).click()
    await expect(page.locator('#nav-help')).toBeVisible()
    await page.locator('#nav-help').click()
    await expect(page).toHaveURL(/\/admin\/help\/$/)
    await expect(page).toHaveTitle(/^Yardım – Gliagora admin/)
    const guide = page.locator('article.editor-guide')
    await expect(guide).toHaveAttribute('lang', 'tr')
    await expect(guide.getByRole('heading', { level: 1, name: TITLE })).toBeVisible()
    await expect(guide.getByRole('heading', { level: 2 }).first()).toBeVisible()
    // The menu marks where the editor is, as it does for Payload's own entries.
    await expect(page.locator('#nav-help')).toHaveAttribute('aria-current', 'page')
  })
})
