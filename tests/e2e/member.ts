import { randomBytes } from 'node:crypto'

import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test'

import { type E2eMember, e2eMemberToken } from '../../src/scripts/e2e-member-account'
import { fakeOrcidId } from '../fake-oidc/server'
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

/**
 * A member of its own, signed in, in a context of its own: for tests that change an account. Made
 * with an emailed link, to a new address unless the test gives one.
 */
export async function freshMember(browser: Browser, email?: string) {
  needsMailpit()
  const context = await ownContext(browser)
  const page = await context.newPage()
  const address = await signInByLink(page, email)
  return { context, page, address }
}

// Signing in with Google and ORCID (M4b): through the fake providers of tests/fake-oidc/,
// which the app uses where AUTH_TEST_ISSUER is set (playwright.config.ts starts them). Each test
// makes its own members, with a Google account ID or an ORCID iD of their own and an example.org
// address, in a context with its own client address.

/** Where the fake providers are (the same value as the app's AUTH_TEST_ISSUER). */
export const testIssuer = process.env.AUTH_TEST_ISSUER?.replace(/\/+$/, '')

/** Skips locally without the fake providers; CI always has them, so there it fails instead. */
export function needsFakeProviders() {
  test.skip(
    !testIssuer && !process.env.CI,
    'needs the fake Google and ORCID (AUTH_TEST_ISSUER, for the app and the tests)',
  )
  expect(testIssuer, 'AUTH_TEST_ISSUER').toBeTruthy()
}

export type FakeProviderName = 'google' | 'orcid'

/** A new Google account ID (21 digits, as Google's). */
export const newGoogleSub = () =>
  `1${Array.from(randomBytes(20), (byte) => String(byte % 10)).join('')}`

/** A new ORCID iD with a valid check character, starting 9999 (never a real one). */
export const newOrcidId = fakeOrcidId

export type ProviderAnswer = {
  /** The fake's form fields (`sub`, `email`, `hd`, `email_verified`, `name`, …). */
  fields?: Record<string, string | boolean>
  /** What the ID token does wrong (tests/fake-oidc/server.ts `FAULTS`). */
  fault?: string
  decision?: 'allow' | 'deny'
}

/** Answers the fake provider's form, on its page, as a person would. */
export async function answerAtProvider(
  page: Page,
  provider: FakeProviderName,
  { fields = {}, fault, decision = 'allow' }: ProviderAnswer = {},
) {
  const issuer = testIssuer!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await expect(page).toHaveURL(new RegExp(`^${issuer}/${provider}/authorize\\?`))
  for (const [name, value] of Object.entries(fields)) {
    const field = page.locator(`form [name="${name}"]`)
    if (typeof value === 'boolean') await field.setChecked(value)
    else await field.fill(value)
  }
  if (fault) await page.locator('select[name="fault"]').selectOption(fault)
  await page.getByRole('button', { name: decision === 'deny' ? 'Deny' : 'Continue' }).click()
}

/** Starts signing in with a provider from the sign-in page (`from`, with its `next`). */
export async function startAt(
  page: Page,
  provider: FakeProviderName,
  answer: ProviderAnswer = {},
  from = '/en/sign-in/',
) {
  await page.goto(from)
  await page
    .getByRole('link', {
      name: provider === 'google' ? 'Continue with Google' : 'Continue with ORCID',
    })
    .click()
  await answerAtProvider(page, provider, answer)
}

/**
 * Whether the account page shows a member: its account navigation, which neither the sign-in panel
 * nor the page that says the account cannot be shown just now has.
 */
export async function isSignedIn(page: Page) {
  await page.goto('/en/account/')
  return page.getByRole('navigation', { name: 'Your account' }).isVisible()
}

/**
 * A new member made through a fake provider ("Create account" on the confirm page), signed in in a
 * context of its own: Google with an address Google manages (a Workspace domain) unless `email` is
 * null, or ORCID with its name kept when `useName`.
 */
export async function providerMember(
  browser: Browser,
  provider: FakeProviderName,
  {
    sub = provider === 'google' ? newGoogleSub() : undefined,
    email = provider === 'google' ? newAddress() : null,
    useName = false,
  }: { sub?: string; email?: string | null; useName?: boolean } = {},
) {
  needsFakeProviders()
  const context = await ownContext(browser)
  const page = await context.newPage()
  const id = sub ?? fakeOrcidId()
  const fields: Record<string, string> =
    provider === 'google'
      ? { sub: id, email: email ?? '', hd: email ? 'example.org' : '' }
      : { sub: id, name: 'Josiah Carberry' }
  await startAt(page, provider, { fields })
  await expect(page).toHaveURL(/\/en\/sign-in\/confirm\/$/)
  if (useName) await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/en\/account\/\?done=created#outcome$/)
  return { context, page, sub: id, email }
}
