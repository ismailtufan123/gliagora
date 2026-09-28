import { type Browser, type Page, expect, test } from '@playwright/test'

import { FIXED_JOBS, jobPath } from '../../src/scripts/fake-jobs-fixed'
import { FAKE_QUEUE_NOTE } from '../../src/scripts/fake-queue-data'
import { TEXT_SPACING, clientAddress, expectNoSeriousAxeIssues, summary } from './forms'

// "Report a problem" in the browser (PLAN §3.2, §7.5, §15.4). The form without an item, the sent
// page and their size budgets are covered for every template in accessibility.spec.ts and
// budgets.spec.ts (tests/e2e/pages.ts). Needs the fake jobs (pnpm fake:jobs). Reports sent here
// are fake data: their details start with the fake-data marker, so `pnpm fake:jobs` removes them.
//
// Sending runs on the desktop project only, each test from its own client address (forms.ts).

const FORM = '/en/report/'
const SENT = '/en/report/sent/'
const { open } = FIXED_JOBS
const formFor = (shortId: string) => `${FORM}?item=job:${shortId}`

async function openForm(
  browser: Browser,
  path = formFor(open.shortId),
  { javaScript = true } = {},
) {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'X-Forwarded-For': clientAddress() },
    javaScriptEnabled: javaScript,
  })
  const page = await context.newPage()
  await page.goto(path)
  return page
}

const details = (page: Page) => page.getByLabel('Details', { exact: true })
const email = (page: Page) => page.getByLabel('Your email address')
const send = (page: Page) => page.getByRole('button', { name: 'Send report' }).click()
/** The line that names the item the report is about. */
const about = (page: Page) => page.locator('main p').filter({ hasText: /^About:/ })

test.describe('report a problem', () => {
  test('is not indexed, nor is its sent page, and neither is in the sitemap', async ({
    request,
    isMobile,
  }) => {
    test.skip(isMobile, 'the answers do not depend on the device')
    for (const path of [FORM, formFor(open.shortId), SENT]) {
      const html = await (await request.get(path)).text()
      expect(html, path).toContain('<meta name="robots" content="noindex"')
    }
    // /sitemap.xml, and the files it lists if it is an index (M4.8).
    let sitemaps = await (await request.get('/sitemap.xml')).text()
    for (const [, file] of sitemaps.matchAll(
      /<loc>https:\/\/gliagora\.com(\/sitemaps\/[^<]+)<\/loc>/g,
    )) {
      sitemaps += await (await request.get(file!)).text()
    }
    expect(sitemaps).not.toContain('/en/report/')
  })

  test('opens from a job page with the job filled in', async ({ page }) => {
    await page.goto(jobPath(open))
    await page.getByRole('link', { name: 'Report a problem' }).click()
    await expect(page).toHaveURL(formFor(open.shortId))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Report a problem')
    await expect(about(page)).toHaveText(`About: ${open.title}`)
    await expect(about(page).getByRole('link', { name: open.title })).toHaveAttribute(
      'href',
      jobPath(open),
    )
    await expect(page.locator('input[name="item"]')).toHaveValue(`job:${open.shortId}`)
  })

  test('names a closed job too, but never one that is gone, unknown or malformed', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the form does not depend on the device')
    const closed = FIXED_JOBS.expiredRecently
    await page.goto(jobPath(closed))
    await expect(page.getByRole('link', { name: 'Report a problem' })).toHaveAttribute(
      'href',
      formFor(closed.shortId),
    )
    await page.goto(formFor(closed.shortId))
    await expect(about(page)).toHaveText(`About: ${closed.title}`)
    for (const path of [
      formFor(FIXED_JOBS.withdrawn.shortId),
      formFor(FIXED_JOBS.expiredLongAgo.shortId),
      formFor('zzzzz'),
      `${FORM}?item=job:<script>`,
      `${FORM}?item=nonsense`,
    ]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 }), path).toHaveText('Report a problem')
      await expect(about(page), path).toHaveCount(0)
      await expect(page.locator('input[name="item"]'), path).toHaveCount(0)
    }
  })

  test('sends a report about a wrong fact, and explains what happens next', async ({
    browser,
    isMobile,
  }) => {
    test.skip(isMobile, 'reports are sent from the desktop project only')
    const page = await openForm(browser)
    await page.getByLabel('A fact is wrong').check()
    await details(page).fill(`${FAKE_QUEUE_NOTE} The deadline on the original posting is later.`)
    await send(page)

    await page.waitForURL(SENT)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Thank you for your report')
    await expect(
      page.getByRole('heading', { name: 'A request about your personal rights' }),
    ).toBeVisible()
    await expect(page.getByText('We confirm within 24 hours')).toBeVisible()
    await expect(page.getByText('We reply only if you gave us your email address.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Report another problem' })).toHaveAttribute(
      'href',
      FORM,
    )
    await expect(page.getByRole('link', { name: 'notice and takedown page' })).toHaveAttribute(
      'href',
      '/en/legal/takedown/',
    )
    await page.context().close()
  })

  test('asks for an email address for a personal-rights request, at the field', async ({
    browser,
    isMobile,
  }) => {
    test.skip(isMobile, 'reports are sent from the desktop project only')
    const page = await openForm(browser)
    await page.getByLabel('It is about you and harms your rights').check()
    const text = `${FAKE_QUEUE_NOTE} My name is listed, but I have left the lab.`
    await details(page).fill(text)
    await send(page)

    const errors = summary(page)
    await expect(errors).toBeFocused()
    const message =
      'Enter your email address: we need it to answer a request about your personal rights.'
    await expect(errors.getByRole('link')).toHaveText([message])
    await expect(email(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(email(page)).toHaveAccessibleDescription(
      new RegExp(`^Needed for a request about your personal rights.*Error: ${message}$`),
    )
    // What was typed, and the item, are kept.
    await expect(page.getByLabel('It is about you and harms your rights')).toBeChecked()
    await expect(details(page)).toHaveValue(text)
    await expect(about(page)).toHaveText(`About: ${open.title}`)
    await expectNoSeriousAxeIssues(page)

    // The summary's link moves focus to the field; with an address the request goes through.
    await errors.getByRole('link').click()
    await expect(email(page)).toBeFocused()
    await email(page).fill('someone@example.org')
    await send(page)
    await page.waitForURL(SENT)
    await page.context().close()
  })

  test('works without an item, also when the address names none that exists', async ({
    browser,
    isMobile,
  }) => {
    test.skip(isMobile, 'reports are sent from the desktop project only')
    const page = await openForm(browser, formFor('zzzzz'))
    await expect(about(page)).toHaveCount(0)
    await page.getByLabel('Something else').check()
    await details(page).fill(`${FAKE_QUEUE_NOTE} The page /en/jobs/ loads slowly.`)
    await send(page)
    await page.waitForURL(SENT)
    await page.context().close()
  })

  test('has no serious accessibility issues with a job filled in', async ({ page }) => {
    await page.goto(formFor(open.shortId))
    await expectNoSeriousAxeIssues(page)
  })

  test('fits its error messages and a long job title into 320px, also with text spacing', async ({
    browser,
    isMobile,
  }) => {
    test.skip(isMobile, 'the width is set explicitly')
    const context = await browser.newContext({
      viewport: { width: 320, height: 640 },
      extraHTTPHeaders: { 'X-Forwarded-For': clientAddress() },
    })
    const page = await context.newPage()
    await page.goto(formFor(open.shortId))
    await page.getByLabel('It is about you and harms your rights').check()
    await email(page).fill('someone@')
    await send(page)
    await expect(summary(page)).toContainText('Tell us what is wrong.')
    // A title as employers write them (Jobs allow 300 characters), long with nowhere to break.
    await about(page)
      .getByRole('link')
      .evaluate((link) => {
        link.textContent = 'Research engineer (neuroimaging/electrophysiology/optogenetics)'
      })
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
    expect(await overflow()).toBeLessThanOrEqual(0)
    await page.addStyleTag({ content: TEXT_SPACING })
    expect(await overflow()).toBeLessThanOrEqual(0)
    await context.close()
  })

  test('without JavaScript, says the spam check needs it and keeps the item', async ({
    browser,
    isMobile,
  }) => {
    test.skip(isMobile, 'reports are sent from the desktop project only')
    const page = await openForm(browser, formFor(open.shortId), { javaScript: false })
    // The details' count is in the server's HTML, so nothing moves when the scripts arrive.
    await expect(page.getByText('Characters left: 2000')).toBeVisible()
    // Playwright's text and role queries skip <noscript>, so find the note by its place.
    const note = page.locator('noscript > .notice')
    await expect(note).toContainText('The spam check on this form needs JavaScript.')
    await expect(note.locator('a[href="mailto:hello@gliagora.com"]')).toBeVisible()
    await page.getByLabel('The position has closed').check()
    await details(page).fill(`${FAKE_QUEUE_NOTE} Filled last week.`)
    await send(page)
    // The browser posts the form; the server answers with the page and its message.
    await expect(summary(page)).toContainText('The spam check did not run')
    await expect(summary(page)).toBeFocused()
    await expect(page.getByLabel('The position has closed')).toBeChecked()
    await expect(about(page)).toHaveText(`About: ${open.title}`)
    await expect(page.locator('input[name="item"]')).toHaveValue(`job:${open.shortId}`)
    await page.context().close()
  })
})
