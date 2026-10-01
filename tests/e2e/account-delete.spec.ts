import { type Page, expect, test } from '@playwright/test'

import { editorHeaders, editorPassword } from './editor'
import { emailCount, mailpitUrl } from './mailpit'
import { SESSION_COOKIE, isSignedIn, providerMember, startAt } from './member'

// Deleting an account (M4b, D49; the M4b design §5, §7.6). In the `destructive` project, which runs
// after every other test (playwright.config.ts), as a data request's deletion will. Members of
// their own, made through the fake Google with an address Google manages, so no email is needed to
// make them. The final email is sent by the task `sendRequestEmails`, which the app under test
// never runs (PAYLOAD_JOBS_AUTORUN is false; tests/integration/members.db.test.ts runs it): so
// nothing reaches Mailpit here. Needs the fake providers and the test editor (E2E_EDITOR_PASSWORD)
// for its API.

type DataRequest = {
  kind: string
  source: string
  status: string
  action: string | null
  email: string | null
  outcome: Record<string, number> | null
  receivedAt: string | null
  closedAt: string | null
  respondBy: string | null
  purgeAt: string | null
  confirmationSentAt: string | null
}

test.skip(
  !editorPassword && !process.env.CI,
  'needs the test editor (E2E_EDITOR_PASSWORD, pnpm e2e:editor)',
)

/** The data requests recorded under `address`, read through the editors' API. */
async function requestsFor(page: Page, address: string): Promise<DataRequest[]> {
  const query = new URLSearchParams({ 'where[email][equals]': address, depth: '0' })
  const response = await page.request.get(`/api/data-requests/?${query}`, {
    headers: editorHeaders(),
  })
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { docs: DataRequest[] }).docs
}

test('deletes the account through its confirmation page, by keyboard', async ({ browser }) => {
  const { context, page, email, sub } = await providerMember(browser, 'google')
  const address = email!
  const before = mailpitUrl ? await emailCount(address) : 0

  // Privacy and your data → Delete my account, a link to the confirmation page.
  await page.goto('/en/account/privacy/')
  await page.getByRole('button', { name: 'Sign out everywhere' }).focus()
  await page.keyboard.press('Tab')
  const link = page.getByRole('link', { name: 'Delete my account' })
  await expect(link).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/en\/account\/privacy\/delete\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Delete your account?')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'What is deleted' })).toBeVisible()
  await expect(main.getByRole('heading', { name: 'What stays' })).toBeVisible()
  await expect(main).toContainText('We keep it for 2 years')
  await expect(main).toContainText('up to 6 months')
  await expect(main).toContainText(
    `We will send one email to ${address} to confirm that your account was deleted.`,
  )

  // Tab from the last link of the text: the button, then Cancel. Enter on the button deletes.
  await main.getByRole('link', { name: 'data requests' }).focus()
  await page.keyboard.press('Tab')
  const button = main.getByRole('button', { name: 'Delete my account' })
  await expect(button).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(main.getByRole('link', { name: 'Cancel' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(button).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/en\/account\/deleted\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your account has been deleted')
  // The session cookie is gone, and the session with it.
  expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain(SESSION_COOKIE)
  expect(await isSignedIn(page)).toBe(false)

  // The request is recorded closed, with the address the final email will go to.
  const [request, ...others] = await requestsFor(page, address)
  expect(others).toEqual([])
  expect(request).toMatchObject({
    kind: 'deletion',
    source: 'account',
    status: 'closed',
    action: 'deleted-automatically',
    email: address,
    outcome: { accountDeleted: 1 },
    confirmationSentAt: null,
  })
  const received = Date.parse(request!.receivedAt!)
  expect(Math.abs(Date.parse(request!.closedAt!) - received)).toBeLessThan(5_000)
  // Kept for 2 years after it was closed.
  const years = (Date.parse(request!.purgeAt!) - Date.parse(request!.closedAt!)) / 86_400_000 / 365
  expect(years).toBeGreaterThan(1.99)
  expect(years).toBeLessThan(2.01)

  // No email yet: only the task sends it, within minutes, on the server.
  if (mailpitUrl) expect(await emailCount(address)).toBe(before)

  // The same Google account now finds no member: it would make a new account.
  await page.context().clearCookies()
  await startAt(page, 'google', { fields: { sub: sub!, email: address, hd: 'example.org' } })
  await expect(page).toHaveURL(/\/en\/sign-in\/confirm\/$/)
  await context.close()
})

test('Cancel on the confirmation page deletes nothing', async ({ browser }) => {
  const { context, page, email } = await providerMember(browser, 'google')
  await page.goto('/en/account/privacy/delete/')
  await page.getByRole('link', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(/\/en\/account\/privacy\/$/)
  expect(await isSignedIn(page)).toBe(true)
  expect(await requestsFor(page, email!)).toEqual([])
  await context.close()
})
