import { randomBytes } from 'node:crypto'

import { type Browser, type Page, expect, test } from '@playwright/test'

import { FAKE_QUEUE_NOTE } from '../../src/scripts/fake-queue-data'
import { TEXT_SPACING, clientAddress, expectNoSeriousAxeIssues, summary } from './forms'

// "Suggest a listing" in the browser (PLAN §3.2, §7.5, §18.2). The page itself, the sent page and
// their size budgets are covered for every template in accessibility.spec.ts and budgets.spec.ts
// (tests/e2e/pages.ts). Suggestions sent here are fake data: their notes start with the fake-data
// marker, so `pnpm fake:jobs` removes them with the other fake suggestions.
//
// Sending runs on the desktop project only, each test from its own client address (forms.ts).

const FORM = '/en/suggest/'
const SENT = '/en/suggest/sent/'

const uniqueUrl = () => `https://careers.example.org/e2e/${randomBytes(6).toString('hex')}`

async function openForm(browser: Browser, { javaScript = true } = {}) {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'X-Forwarded-For': clientAddress() },
    javaScriptEnabled: javaScript,
  })
  const page = await context.newPage()
  await page.goto(FORM)
  return page
}

async function fillValid(page: Page, url = uniqueUrl()) {
  await page.getByLabel('Address of the original page').fill(url)
  await page.getByLabel('A position').check()
  await page.getByLabel('Note (optional)').fill(`${FAKE_QUEUE_NOTE} Sent by the e2e tests.`)
}

test.describe('suggest a listing', () => {
  test.skip(({ isMobile }) => isMobile, 'suggestions are sent from the desktop project only')

  test('is indexed; the sent page is not', async ({ request }) => {
    const form = await (await request.get(FORM)).text()
    expect(form).not.toContain('<meta name="robots" content="noindex"')
    expect(form).toContain('<link rel="canonical" href="https://gliagora.com/en/suggest/"/>')
    const sent = await (await request.get(SENT)).text()
    expect(sent).toContain('<meta name="robots" content="noindex"')
  })

  test('sends a suggestion once the spam check has run, and explains what happens next', async ({
    browser,
  }) => {
    const page = await openForm(browser)
    await fillValid(page)
    await page.getByLabel('Your email address (optional)').fill('someone@example.org')
    await page.getByLabel('Email me the outcome of this suggestion').check()
    await page.getByRole('button', { name: 'Send suggestion' }).click()

    await page.waitForURL(SENT)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Thank you for your suggestion',
    )
    await expect(page.getByText('Nothing is published automatically.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Suggest another listing' })).toHaveAttribute(
      'href',
      FORM,
    )
    await expect(page.getByRole('link', { name: 'Browse positions' })).toHaveAttribute(
      'href',
      '/en/jobs/',
    )
    await page.context().close()
  })

  test('shows the server’s messages in a summary and at the fields, keeping what was typed', async ({
    browser,
  }) => {
    const page = await openForm(browser)
    const url = page.getByLabel('Address of the original page')
    await url.fill('javascript:alert(1)')
    await page.getByLabel('Your email address (optional)').fill('someone@example.org')
    await page.getByLabel('Note (optional)').fill(`${FAKE_QUEUE_NOTE} Kept after an error.`)
    await page.getByRole('button', { name: 'Send suggestion' }).click()

    const errors = summary(page)
    await expect(errors).toBeFocused()
    await expect(errors.getByRole('link')).toHaveText([
      'Enter an address that starts with https:// or http://.',
      'Choose what you are suggesting.',
      'Tick the box if you want us to email you the outcome, or leave the email field empty.',
    ])
    await expect(url).toHaveAttribute('aria-invalid', 'true')
    await expect(url).toHaveAccessibleDescription(
      /starting with https:\/\/ or http:\/\/\..*Error: Enter an address that starts with https:\/\/ or http:\/\//,
    )
    await expect(
      page.getByRole('group', { name: 'What are you suggesting?' }),
    ).toHaveAccessibleDescription('Error: Choose what you are suggesting.')
    await expect(url).toHaveValue('javascript:alert(1)')
    await expect(page.getByLabel('Your email address (optional)')).toHaveValue(
      'someone@example.org',
    )
    await expect(page.getByLabel('Note (optional)')).toHaveValue(
      `${FAKE_QUEUE_NOTE} Kept after an error.`,
    )
    await expectNoSeriousAxeIssues(page)

    // A link in the summary moves focus to its field.
    await errors.getByRole('link', { name: /^Enter an address/ }).click()
    await expect(url).toBeFocused()

    // Corrected, the same form goes through (with a new spam check).
    await fillValid(page)
    await page.getByLabel('Email me the outcome of this suggestion').check()
    await page.getByRole('button', { name: 'Send suggestion' }).click()
    await page.waitForURL(SENT)
    await page.context().close()
  })

  test('sends another suggestion after going Back from the sent page', async ({ browser }) => {
    const page = await openForm(browser)
    await fillValid(page)
    await page.getByRole('button', { name: 'Send suggestion' }).click()
    await page.waitForURL(SENT)
    // Back shows the form with a new spam check, not the one just used.
    await page.goBack()
    await page.waitForURL(FORM)
    await fillValid(page)
    await page.getByRole('button', { name: 'Send suggestion' }).click()
    await expect(page).toHaveURL(SENT)
    await expect(summary(page)).toHaveCount(0)
    await page.context().close()
  })

  for (const javaScript of [true, false]) {
    test(`fits its error messages into 320px, also with text spacing${javaScript ? '' : ', without JavaScript'}`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width: 320, height: 640 },
        javaScriptEnabled: javaScript,
      })
      const page = await context.newPage()
      await page.goto(FORM)
      // The likeliest mistake: an address without https://, whose message has a long example.
      await page.getByLabel('Address of the original page').fill('www.example.org/jobs/1')
      await page.getByLabel('A position').check()
      await page.getByRole('button', { name: 'Send suggestion' }).click()
      await expect(summary(page)).toContainText('https://www.example.org/jobs/123')
      const overflow = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
      expect(await overflow()).toBeLessThanOrEqual(0)
      // page.addStyleTag waits for a script to run, which never happens without JavaScript.
      await page.evaluate((css) => {
        const style = document.createElement('style')
        style.textContent = css
        document.head.append(style)
      }, TEXT_SPACING)
      expect(await overflow()).toBeLessThanOrEqual(0)
      await context.close()
    })
  }

  test('answers a filled-in hidden field as if it worked', async ({ browser }) => {
    // What is stored (nothing, not even a rate-limit entry) cannot be seen from the browser; the
    // unit tests check it (src/lib/forms/suggest.test.ts).
    const page = await openForm(browser)
    await fillValid(page)
    const honeypot = page.locator('input[name="reference_code"]')
    // People and assistive technology never reach it.
    await expect(honeypot).toHaveAttribute('tabindex', '-1')
    await expect(page.getByRole('textbox', { name: 'Leave this field empty' })).toHaveCount(0)
    await honeypot.fill('https://spam.example.com', { force: true })
    await page.getByRole('button', { name: 'Send suggestion' }).click()
    await page.waitForURL(SENT)
    await page.context().close()
  })

  test('refuses the 6th suggestion within an hour from the same address', async ({ browser }) => {
    test.slow()
    const context = await browser.newContext({
      extraHTTPHeaders: { 'X-Forwarded-For': clientAddress() },
    })
    const page = await context.newPage()
    for (let i = 0; i < 5; i++) {
      await page.goto(FORM)
      await fillValid(page)
      await page.getByRole('button', { name: 'Send suggestion' }).click()
      await page.waitForURL(SENT)
    }
    await page.goto(FORM)
    await fillValid(page)
    await page.getByRole('button', { name: 'Send suggestion' }).click()
    await expect(summary(page)).toContainText(
      'You have sent several suggestions in the last hour. Please try again later.',
    )
    await expect(page).toHaveURL(FORM)
    await context.close()
  })

  test('counts the note’s characters, reading them out only near the limit', async ({
    browser,
  }) => {
    const page = await openForm(browser)
    const note = page.getByLabel('Note (optional)')
    await expect(page.getByText('Characters left: 500')).toBeVisible()
    await note.fill('x'.repeat(100))
    await expect(page.getByText('Characters left: 400')).toBeVisible()
    const spoken = page.locator('form p[aria-live="polite"]')
    await expect(spoken).toHaveText('')
    await note.fill('x'.repeat(480))
    await expect(spoken).toHaveText('Characters left: 20')
    await note.fill('x'.repeat(503))
    await expect(page.getByText('Characters over the limit: 3')).toBeVisible()
    await page.context().close()
  })

  test('keeps the page responsive while the spam check runs, also on a slow phone', async ({
    browser,
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    // Every task over 50 ms, as the browser reports them.
    await page.addInitScript(() => {
      const tasks: { start: number; duration: number }[] = []
      Object.assign(window, { longTasks: tasks })
      new PerformanceObserver((list) => {
        for (const { startTime, duration } of list.getEntries()) {
          tasks.push({ start: startTime, duration })
        }
      }).observe({ type: 'longtask', buffered: true })
    })
    // A processor four times slower, like a mid-range phone.
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.goto(FORM)
    const url = page.getByLabel('Address of the original page')
    // Hydrated: React has attached its handlers, so focus starts the spam check.
    await expect
      .poll(() => url.evaluate((input) => Object.keys(input).some((k) => k.startsWith('__react'))))
      .toBe(true)
    const since = await page.evaluate(() => performance.now())
    await url.click()
    await expect(page.locator('input[name="altcha"]')).toHaveValue(/.+/, { timeout: 30_000 })
    const longest = await page.evaluate(
      (from) =>
        Math.max(
          0,
          ...(window as unknown as { longTasks: { start: number; duration: number }[] }).longTasks
            .filter(({ start }) => start >= from)
            .map(({ duration }) => duration),
        ),
      since,
    )
    // Without a turn for the browser between batches, the whole search is one task (0.1–2 s here).
    expect(longest, 'longest task while solving, ms').toBeLessThan(150)
    await context.close()
  })

  test('a send before the scripts have loaded asks to wait, not only to turn JavaScript on', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { 'X-Forwarded-For': clientAddress() },
    })
    const page = await context.newPage()
    // Routing also turns off the browser's cache, so every load waits for the scripts.
    await page.route('**/_next/static/**/*.js', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4_000))
      await route.continue()
    })
    await page.goto(FORM, { waitUntil: 'domcontentloaded' })
    await fillValid(page)
    await page.getByRole('button', { name: 'Send suggestion' }).click()
    await expect(summary(page)).toContainText('the page had not finished loading')
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await context.close()
  })

  test('without JavaScript, says the spam check needs it and offers email instead', async ({
    browser,
  }) => {
    const page = await openForm(browser, { javaScript: false })
    // The note's count is in the server's HTML, so nothing moves when the scripts arrive.
    await expect(page.getByText('Characters left: 500')).toBeVisible()
    // Playwright's text and role queries skip <noscript>, so find the note by its place.
    const note = page.locator('noscript > .notice')
    await expect(note).toBeVisible()
    await expect(note).toContainText('The spam check on this form needs JavaScript.')
    await expect(note.locator('a[href="mailto:hello@gliagora.com"]')).toBeVisible()
    await fillValid(page)
    await page.getByRole('button', { name: 'Send suggestion' }).click()
    // The browser posts the form; the server answers with the page and its message.
    await expect(summary(page)).toContainText('The spam check did not run')
    await expect(summary(page)).toBeFocused()
    await expect(page.getByLabel('A position')).toBeChecked()
    await expect(page).toHaveURL(FORM)
    await page.context().close()
  })
})
