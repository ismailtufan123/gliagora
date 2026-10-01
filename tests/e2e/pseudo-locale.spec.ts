import { type Page, expect, test } from '@playwright/test'

import { FIXED_JOBS, jobPath } from '../../src/scripts/fake-jobs-fixed'
import { clientAddress, summary } from './forms'
import { signInLinkTo } from './mailpit'
import {
  askForLink,
  needsFakeProviders,
  needsMailpit,
  newAddress,
  newGoogleSub,
  newOrcidId,
  ownContext,
  signInAs,
  startAt,
} from './member'
import { PAGES } from './pages'
import { expectLayoutHolds } from './pseudo-locale'

// PLAN §12 (text expansion) and §17.1: components are designed for text 35% longer than English.
// These tests put the page into a pseudo-locale in the browser, which makes every text longer
// (by about 40%, for some margin) and accented, as a translation would be, and check the page at
// 320×640 and 1280×800: nothing makes the page scroll sideways, no text is cut off or sticks out
// of buttons, chips, badges, labels and the layers that stay in place (header, action bar, menu
// panel, filter sheet), and the sticky header and the job page's fixed action bar never hide a
// focused control. Needs the fake jobs (pnpm fake:jobs) and the ROR test data.
//
// Screenshots of each state are attached to the test report for a person to look at. They are not
// compared with committed baselines: fonts, their fallbacks, anti-aliasing and subpixel positions
// differ between machines and browser versions, so pixel comparisons would fail on another
// machine without any layout problem (and pass problems that fall below their threshold). What the
// tests assert are measurements of the layout, which do not depend on how glyphs are drawn.

// Chips, cards and two pages: 7 filter values, 31 positions of the fake jobs.
const FILTERED_LIST =
  '/en/jobs/?type=faculty-pi,industry,msc,phd,postdoc&region=europe,northern-america'
const INSTITUTION = PAGES.find((template) => template.name === 'institution')!.path
/** The ROR ID its address ends with, as its "Report a problem" link names it. */
const INSTITUTION_ID = /-(0[0-9a-z]{8})\/$/.exec(INSTITUTION)![1]

const filterButton = (page: Page, name: string) =>
  page.locator('summary.filter-button', { hasText: name })

for (const viewport of [
  { width: 320, height: 640 },
  { width: 1280, height: 800 },
]) {
  const narrow = viewport.width < 1280

  test.describe(`pseudo-locale at ${viewport.width}px`, () => {
    test.skip(({ isMobile }) => isMobile, 'the sizes are set explicitly')
    test.use({ viewport })

    test('home, with the header menu open', async ({ page }, testInfo) => {
      await page.goto('/en/')
      if (narrow) {
        await page.locator('.site-header details[data-modal] > summary').click()
        // A window's sub-sections too.
        await page.locator('.mobile-panel summary').first().click()
      } else {
        await page.locator('.site-header nav summary').first().click()
      }
      await expect(page.locator('.site-header details[open]').first()).toBeVisible()
      await expectLayoutHolds(page, testInfo, 'home, menu open', { modal: narrow })
    })

    test('jobs list with chips, rows and pages', async ({ page }, testInfo) => {
      await page.goto(FILTERED_LIST)
      await expect(page.locator('.chips')).toBeVisible()
      await expect(page.locator('.job-list .badge').first()).toBeVisible()
      await expect(page.locator('.pagination')).toBeVisible()
      if (!narrow) {
        // The popover with the most kinds of controls: options, dates, hint.
        await filterButton(page, 'Deadline').click()
        await expect(page.locator('.filter[open] .filter-panel')).toBeVisible()
      }
      await expectLayoutHolds(page, testInfo, narrow ? 'jobs list' : 'jobs list, popover open')
    })

    if (narrow) {
      test('jobs list with the filter sheet open', async ({ page }, testInfo) => {
        await page.goto(FILTERED_LIST)
        await page.locator('.filter-sheet > summary').click()
        await filterButton(page, 'Deadline').click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await expectLayoutHolds(page, testInfo, 'jobs list, filter sheet open', { modal: true })
      })
    }

    test('job page: facts, action bar and similar positions', async ({ page }, testInfo) => {
      await page.goto(jobPath(FIXED_JOBS.open))
      await expect(page.locator('.action-bar')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Similar positions' })).toBeVisible()
      await expectLayoutHolds(page, testInfo, 'job page')
    })

    test('suggest a listing, with errors', async ({ page }, testInfo) => {
      await page.setExtraHTTPHeaders({ 'X-Forwarded-For': clientAddress() })
      await page.goto('/en/suggest/')
      await page.getByLabel('Address of the original page').fill('javascript:alert(1)')
      await page.getByLabel('Your email address (optional)').fill('someone@example.org')
      await page.getByRole('button', { name: 'Send suggestion' }).click()
      await expect(summary(page)).toBeFocused()
      await expectLayoutHolds(page, testInfo, 'suggest a listing, errors')
    })

    test('report a problem, with errors', async ({ page }, testInfo) => {
      await page.setExtraHTTPHeaders({ 'X-Forwarded-For': clientAddress() })
      await page.goto(`/en/report/?item=job:${FIXED_JOBS.open.shortId}`)
      await page.getByRole('button', { name: 'Send report' }).click()
      await expect(summary(page)).toBeFocused()
      await expectLayoutHolds(page, testInfo, 'report a problem, errors')
    })

    test('report a problem about an institution, with errors', async ({ page }, testInfo) => {
      await page.setExtraHTTPHeaders({ 'X-Forwarded-For': clientAddress() })
      await page.goto(`/en/report/?item=institution:${INSTITUTION_ID}`)
      await page.getByRole('button', { name: 'Send report' }).click()
      await expect(summary(page)).toBeFocused()
      await expectLayoutHolds(page, testInfo, 'report a problem about an institution, errors')
    })

    test('data request, with errors', async ({ page }, testInfo) => {
      needsMailpit()
      await page.setExtraHTTPHeaders({ 'X-Forwarded-For': clientAddress() })
      await page.goto('/en/legal/data-requests/')
      await page.getByLabel('Your email address').fill('not an address')
      await page.getByRole('radio', { name: 'Correct my data', exact: true }).check()
      await page.getByRole('button', { name: 'Send request' }).click()
      await expect(summary(page)).toBeFocused()
      await expectLayoutHolds(page, testInfo, 'data request, errors')
    })

    test('sign in, with errors', async ({ page }, testInfo) => {
      needsMailpit()
      await page.setExtraHTTPHeaders({ 'X-Forwarded-For': clientAddress() })
      await page.goto('/en/sign-in/')
      await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
      await expect(summary(page)).toBeFocused()
      await expectLayoutHolds(page, testInfo, 'sign in, errors')
    })

    test('a sign-in link opened in another browser', async ({ browser }, testInfo) => {
      needsMailpit()
      const asking = await ownContext(browser)
      const address = newAddress()
      await askForLink(await asking.newPage(), address)
      const other = await browser.newContext({ viewport })
      const page = await other.newPage()
      await page.goto(await signInLinkTo(address))
      await expect(page.getByRole('note')).toBeVisible()
      await expectLayoutHolds(page, testInfo, 'sign-in link, another browser')
      await asking.close()
      await other.close()
    })

    test('create your account, after Google and after ORCID', async ({ browser }, testInfo) => {
      needsFakeProviders()
      const context = await browser.newContext({
        viewport,
        extraHTTPHeaders: { 'X-Forwarded-For': clientAddress() },
      })
      const page = await context.newPage()
      // With the note about an address Google does not manage, and the hint for existing accounts.
      await startAt(page, 'google', {
        fields: { sub: newGoogleSub(), email: newAddress(), hd: '' },
      })
      await expect(page.getByRole('note')).toBeVisible()
      await expectLayoutHolds(page, testInfo, 'create your account, Google')
      // With the box that keeps the name on the ORCID record.
      await startAt(page, 'orcid', { fields: { sub: newOrcidId() } })
      await expect(page.getByRole('checkbox')).toBeVisible()
      await expectLayoutHolds(page, testInfo, 'create your account, ORCID')
      await context.close()
    })

    test('jobs list and saved positions, signed in', async ({ page, baseURL }, testInfo) => {
      await signInAs(page.context(), 'email', baseURL!)
      await page.goto(FILTERED_LIST)
      await expect(page.locator('#job-results form[data-save]').first()).toBeVisible()
      await expectLayoutHolds(page, testInfo, 'jobs list, signed in')
      await page.goto('/en/account/saved/')
      await expect(page.getByRole('region', { name: 'No longer open' })).toBeVisible()
      await expectLayoutHolds(page, testInfo, 'saved positions')
    })

    test('account, signed in', async ({ page, baseURL }, testInfo) => {
      await signInAs(page.context(), 'email', baseURL!)
      await page.goto('/en/account/')
      await expect(page.getByRole('navigation', { name: 'Your account' })).toBeVisible()
      await expectLayoutHolds(page, testInfo, 'account')
    })

    // The account's forms (M4b): Glia Notes, the preferred subfields, the address (with the
    // errors of the add-an-address form) and the display name; and an account without an address.
    test('account forms, with errors', async ({ page, baseURL }, testInfo) => {
      needsMailpit()
      await signInAs(page.context(), 'email', baseURL!)
      await page.setExtraHTTPHeaders({ 'X-Forwarded-For': clientAddress() })
      await page.goto('/en/account/')
      await page.getByRole('button', { name: 'Email me a confirmation link' }).click()
      await expect(summary(page)).toBeFocused()
      await expectLayoutHolds(page, testInfo, 'account forms, errors')
    })

    test('account without an email address', async ({ page, baseURL }, testInfo) => {
      await signInAs(page.context(), 'orcid', baseURL!)
      await page.goto('/en/account/')
      await expect(page.getByRole('heading', { name: 'Add an email address' })).toBeVisible()
      await expectLayoutHolds(page, testInfo, 'account without an address')
    })

    // Privacy and your data (M4b), and the confirmation page of a deletion (nothing is pressed).
    test('privacy and deleting the account', async ({ page, baseURL }, testInfo) => {
      await signInAs(page.context(), 'email', baseURL!)
      await page.goto('/en/account/privacy/')
      await expect(page.getByRole('button', { name: 'Sign out everywhere' })).toBeVisible()
      await expectLayoutHolds(page, testInfo, 'privacy')
      await page.goto('/en/account/privacy/delete/')
      await expect(page.getByRole('button', { name: 'Delete my account' })).toBeVisible()
      await expectLayoutHolds(page, testInfo, 'delete your account?')
    })

    test('jobs list with the preferred subfields applied', async ({ page, baseURL }, testInfo) => {
      await signInAs(page.context(), 'email', baseURL!)
      await page.goto('/en/jobs/')
      await expect(page.locator('[data-preferred]')).toBeVisible()
      await expectLayoutHolds(page, testInfo, 'jobs list, preferred subfields')
    })

    test('search results', async ({ page }, testInfo) => {
      await page.goto('/en/search/?q=neuro')
      await expect(page.locator('.result-list').first()).toBeVisible()
      await expectLayoutHolds(page, testInfo, 'search results')
    })

    test('institution page', async ({ page }, testInfo) => {
      await page.goto(INSTITUTION)
      await expect(page.locator('.job-list')).toBeVisible()
      await expectLayoutHolds(page, testInfo, 'institution page')
    })
  })
}
