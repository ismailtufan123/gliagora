import { randomBytes } from 'node:crypto'

import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test'

import { type E2eMember, e2eMemberToken } from '../../src/scripts/e2e-member-account'
import { clientAddress } from './forms'
import { mailpitUrl, signInLinkTo } from './mailpit'

// Members in the end-to-end tests (M4b, D49).
//
// The test members of `pnpm e2e:member` (src/scripts/e2e-member.ts) have sessions made from
// E2E_MEMBER_TOKEN, so a test signs in as one by giving its browser the session cookie. Tests that
// only read pages share them; a test that changes an account (signs it out everywhere, for one)
// makes its own member through the emailed sign-in link instead (`freshMember`), so parallel tests
// never meet.

export const memberToken = process.env.E2E_MEMBER_TOKEN

/** The session cookie's name (src/lib/members/cookies.ts). */
export const SESSION_COOKIE = '__Host-gliagora-session'
/** The sign-in cookie's name (src/lib/members/cookies.ts). */
export const SIGN_IN_COOKIE = '__Host-gliagora-signin'

/** Skips locally without E2E_MEMBER_TOKEN; CI always has it, so there it fails instead. */
export function needsMemberToken() {
  test.skip(
    !memberToken && !process.env.CI,
    'needs the test members (E2E_MEMBER_TOKEN, pnpm e2e:member)',
  )
  expect(memberToken, 'E2E_MEMBER_TOKEN (pnpm e2e:member)').toBeTruthy()
}

/**
 * Signs a browser context in as a test member: its session cookie, set by domain and path. Never
 * by `url`: Playwright then makes a cookie secure only for an https address, and the `__Host-`
 * cookie is secure on http://localhost too.
 */
export async function signInAs(context: BrowserContext, member: E2eMember, baseURL: string) {
  needsMemberToken()
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: e2eMemberToken(memberToken!, member),
      domain: new URL(baseURL).hostname,
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
}

/** For the templates of tests/e2e/pages.ts: signs the page's context in when the template says. */
export async function asTemplateMember(page: Page, template: object, baseURL: string | undefined) {
  if ('member' in template) {
    await signInAs(page.context(), template.member as E2eMember, baseURL!)
  }
}

/** Skips locally without Mailpit (MAILPIT_URL); CI always has it, so there it fails instead. */
export function needsMailpit() {
  test.skip(!mailpitUrl && !process.env.CI, 'needs Mailpit (MAILPIT_URL) and an app with SMTP_HOST')
  expect(mailpitUrl, 'MAILPIT_URL').toBeTruthy()
}

/** A new example.org address, for a member nobody else uses. */
export const newAddress = () => `m-${randomBytes(6).toString('hex')}@example.org`

/**
 * A browser context of its own, with its own client address in X-Forwarded-For, so the per-IP
 * limits of the sign-in form never meet across tests or across the desktop and mobile projects.
 */
export function ownContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': clientAddress() } })
}

/** Asks for a sign-in link for `address` on the sign-in page, as a person does. */
export async function askForLink(page: Page, address: string) {
  await page.goto('/en/sign-in/')
  await page.getByRole('textbox', { name: 'Email address' }).fill(address)
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await expect(page).toHaveURL(/\/en\/sign-in\/sent\/$/)
}

/**
 * Signs a page in through an emailed link: asks for it, reads it in Mailpit, opens it and presses
 * the button ("Create account" for a new address). Returns the address.
 */
export async function signInByLink(page: Page, address = newAddress()) {
  await askForLink(page, address)
  await page.goto(await signInLinkTo(address))
  await page.getByRole('button', { name: /^(Sign in|Create account)$/ }).click()
  await expect(page).toHaveURL(/\/en\/account\/\?done=(created|signed-in)#outcome$/)
  return address
}

/** A member of its own, signed in, in a context of its own: for tests that change an account. */
export async function freshMember(browser: Browser) {
  needsMailpit()
  const context = await ownContext(browser)
  const page = await context.newPage()
  const address = await signInByLink(page)
  return { context, page, address }
}
