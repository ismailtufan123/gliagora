import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test'

import { FIXED_JOBS, jobPath } from '../../src/scripts/fake-jobs-fixed'
import { signInLinkTo } from './mailpit'
import {
  answerAtProvider,
  freshMember,
  needsFakeProviders,
  needsMailpit,
  newAddress,
  newGoogleSub,
  ownContext,
  signInAs,
} from './member'

// Saving positions (M4b, D49; the M4b design §3). Needs the fake jobs (pnpm fake:jobs) and the
// test members (pnpm e2e:member, after the fake jobs): the email member has saved three of the
// fixed jobs (open, closed recently, withdrawn), and so has the member whose saved positions one
// test below removes. Tests that save make members of their own (through an emailed link or the
// fake Google), so they never meet.

const OPEN = FIXED_JOBS.open
const CLOSED = FIXED_JOBS.expiredRecently
const WITHDRAWN = FIXED_JOBS.withdrawn
/** A short list with the open fixed job in it: the positions at its institution. */
const LIST = `/en/jobs/?institution=${OPEN.institutionRorId}`
/** The sign-in page a Save link leads to from LIST. */
const SIGN_IN_TO_SAVE = `/en/sign-in/?next=${encodeURIComponent(LIST)}&save=job%3A${OPEN.shortId}`

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The address `path` at the end of the page's URL. */
const endsWith = (path: string) => new RegExp(`${escape(path)}$`)

const row = (page: Page, job: { shortId: string }) => page.locator(`#job-${job.shortId}`)
/**
 * A Save control's name: "Save", then the hidden ": {title}". Chromium puts a space between the
 * visible word and the hidden part (it is taken out of the flow), so it reads "Save : …".
 */
const saveName = (title: string) => new RegExp(`^Save ?: ${escape(title)}$`)
const saveButton = (page: Page, job: { shortId: string; title: string }) =>
  row(page, job).getByRole('button', { name: saveName(job.title) })
const pageSave = (page: Page) => page.locator('#save').getByRole('button')
const status = (page: Page) => page.locator('#save-status')

/** The URLs of the scripts the page asks for from now on. */
function scriptsOf(page: Page) {
  const urls = new Set<string>()
  page.on('request', (request) => {
    if (request.resourceType() === 'script') urls.add(request.url())
  })
  return urls
}

/** A context without JavaScript, signed in as the member of `from`. */
async function withoutJavaScript(browser: Browser, from: BrowserContext) {
  const context = await browser.newContext({ javaScriptEnabled: false })
  await context.addCookies(await from.cookies())
  return context
}

test.describe('with JavaScript', () => {
  test('Save changes in place: focus stays, the state and the live region change', async ({
    browser,
  }) => {
    const { context, page } = await freshMember(browser)
    const scripts = scriptsOf(page)
    await page.goto(LIST, { waitUntil: 'networkidle' })
    const before = new Set(scripts)
    const button = saveButton(page, OPEN)
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await expect(status(page)).toBeEmpty()

    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(status(page)).toHaveText(`Saved: ${OPEN.title}`)
    await expect(button).toBeFocused()
    await expect(page).toHaveURL(endsWith(LIST))
    // Its code came only now (PLAN §17.3): one script the page had not loaded before.
    expect([...scripts].filter((url) => !before.has(url))).toHaveLength(1)

    // By keyboard: pressed again, it removes the position; focus stays.
    await page.keyboard.press('Enter')
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await expect(status(page)).toHaveText(`Removed from your saved positions: ${OPEN.title}`)
    await expect(button).toBeFocused()
    await page.keyboard.press('Space')
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(status(page)).toHaveText(`Saved: ${OPEN.title}`)

    // Stored: drawn again, the row shows it saved, and so does the saved page.
    await page.reload()
    await expect(saveButton(page, OPEN)).toHaveAttribute('aria-pressed', 'true')
    await page.goto('/en/account/saved/')
    await expect(page.getByRole('link', { name: 'Saved (1)' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(row(page, OPEN).getByRole('link', { name: OPEN.title, exact: true })).toBeVisible()
    await context.close()
  })

  test('signed out meanwhile: Save leads to signing in, which will save it', async ({
    browser,
  }) => {
    const { context, page } = await freshMember(browser)
    await page.goto(LIST)
    await context.clearCookies()
    await saveButton(page, OPEN).click()
    await expect(page).toHaveURL(endsWith(SIGN_IN_TO_SAVE))
    await expect(page.getByText('After you sign in, we save this position for you')).toBeVisible()
    await context.close()
  })
})

test.describe('without JavaScript', () => {
  test.skip(({ isMobile }) => isMobile, 'the same on every device')

  test('Save loads the page again at the row, pressed', async ({ browser }) => {
    const member = await freshMember(browser)
    const context = await withoutJavaScript(browser, member.context)
    const page = await context.newPage()
    await page.goto(LIST)
    await saveButton(page, OPEN).click()
    await expect(page).toHaveURL(endsWith(`${LIST}#job-${OPEN.shortId}`))
    await expect(saveButton(page, OPEN)).toHaveAttribute('aria-pressed', 'true')
    // The row is where the next Tab starts: its title first.
    await page.keyboard.press('Tab')
    await expect(row(page, OPEN).getByRole('link', { name: OPEN.title, exact: true })).toBeFocused()

    // On the job's own page: back at its Save control, which now removes it.
    await page.goto(jobPath(OPEN))
    await expect(pageSave(page)).toHaveAttribute('aria-pressed', 'true')
    await pageSave(page).click()
    await expect(page).toHaveURL(endsWith(`${jobPath(OPEN)}#save`))
    await expect(pageSave(page)).toHaveAttribute('aria-pressed', 'false')
    await context.close()
    await member.context.close()
  })
})

test.describe('signed out', () => {
  test('Save is a link to signing in, described as such', async ({ page }) => {
    // Shown once a way of signing in is on: here the emailed link (SMTP_HOST, as in CI).
    needsMailpit()
    await page.goto(LIST)
    const link = row(page, OPEN).getByRole('link', { name: saveName(OPEN.title) })
    await expect(link).toHaveAttribute('href', SIGN_IN_TO_SAVE)
    await expect(link).toHaveAttribute('rel', 'nofollow')
    await expect(link).toHaveAccessibleDescription('You need to sign in to save positions.')
    await expect(status(page)).toHaveCount(0)
  })

  test('through an emailed link: signed in, saved, back at the row', async ({ browser }) => {
    needsMailpit()
    const context = await ownContext(browser)
    const page = await context.newPage()
    await page.goto(LIST)
    await row(page, OPEN)
      .getByRole('link', { name: saveName(OPEN.title) })
      .click()
    await expect(page).toHaveURL(endsWith(SIGN_IN_TO_SAVE))
    await expect(page.getByText('After you sign in, we save this position for you')).toContainText(
      OPEN.title,
    )
    const address = newAddress()
    await page.getByRole('textbox', { name: 'Email address' }).fill(address)
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
    await expect(page).toHaveURL(/\/en\/sign-in\/sent\/$/)
    await page.goto(await signInLinkTo(address))
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(endsWith(`${LIST}#job-${OPEN.shortId}`))
    await expect(saveButton(page, OPEN)).toHaveAttribute('aria-pressed', 'true')
    await context.close()
  })

  test('through Google: signed in, saved, back at the job page’s Save', async ({ browser }) => {
    needsFakeProviders()
    const context = await ownContext(browser)
    const page = await context.newPage()
    await page.goto(jobPath(OPEN))
    await page.locator('#save').click()
    await expect(page.getByText('After you sign in, we save this position for you')).toBeVisible()
    await page.getByRole('link', { name: 'Continue with Google' }).click()
    await answerAtProvider(page, 'google', {
      fields: { sub: newGoogleSub(), email: newAddress(), hd: 'example.org' },
    })
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(endsWith(`${jobPath(OPEN)}#save`))
    await expect(pageSave(page)).toHaveAttribute('aria-pressed', 'true')
    await context.close()
  })

  test('a link to save a position that is no longer public saves nothing', async ({ page }) => {
    await page.goto(`/en/sign-in/?next=%2Fen%2Fjobs%2F&save=job%3A${WITHDRAWN.shortId}`)
    await expect(page.getByText('After you sign in, we save')).toHaveCount(0)
    await expect(page.locator('input[name="save"]')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Continue with Google' })).not.toHaveAttribute(
      'href',
      /save=/,
    )
  })

  test('the toggle refuses a POST from another site, and a GET shows the list', async ({
    request,
  }) => {
    const refused = await request.post('/en/account/saved/toggle/', {
      headers: { Origin: 'https://evil.example.org' },
      form: { item: `job:${OPEN.shortId}`, saved: '1', back: '/en/jobs/' },
      maxRedirects: 0,
    })
    expect(refused.status()).toBe(403)
    const get = await request.get('/en/account/saved/toggle/', { maxRedirects: 0 })
    expect(get.status()).toBe(303)
    expect(get.headers().location).toBe('/en/account/saved/')
  })
})

test.describe('as the test member', () => {
  test('the job page has one Save control, and no ID twice', async ({ page, baseURL }) => {
    await signInAs(page.context(), 'email', baseURL!)
    await page.goto(jobPath(OPEN))
    await expect(pageSave(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(status(page)).toHaveCount(1)
    // The lists of other positions have no Save control and no row IDs.
    await expect(page.locator('form[data-save]')).toHaveCount(1)
    const ids = await page.evaluate(() =>
      [...document.querySelectorAll('[id]')].map((element) => element.id),
    )
    expect(ids.filter((id) => /^job-[0-9a-z]{5}$/.test(id))).toEqual([])
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([])
  })

  test('the jobs list: a Save in every row, pressed for the saved ones', async ({
    page,
    baseURL,
  }) => {
    await signInAs(page.context(), 'email', baseURL!)
    await page.goto(LIST)
    const rows = page.locator('#job-results .job-list > li')
    await expect(rows.first()).toBeVisible()
    for (const item of await rows.all()) {
      await expect(item.locator('form[data-save] button[aria-pressed]')).toHaveCount(1)
    }
    await expect(saveButton(page, OPEN)).toHaveAttribute('aria-pressed', 'true')
    await expect(status(page)).toHaveCount(1)
  })

  test('a link to save, opened while signed in, offers that Save button', async ({
    page,
    baseURL,
  }) => {
    await signInAs(page.context(), 'email', baseURL!)
    const job = FIXED_JOBS.closingSoon
    await page.goto(`/en/sign-in/?next=%2Fen%2Fjobs%2F&save=job%3A${job.shortId}`)
    await expect(page.getByText('You opened a link to save this position')).toContainText(job.title)
    await expect(page.getByRole('button', { name: saveName(job.title) })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    // It returns to where the link would have led.
    await expect(page.locator('form[data-save] input[name="back"]')).toHaveValue('/en/jobs/')
  })

  test('the saved page: open positions first, then those no longer open', async ({
    page,
    baseURL,
  }) => {
    await signInAs(page.context(), 'email', baseURL!)
    await page.goto('/en/account/saved/')
    await expect(page.getByRole('link', { name: 'Saved (3)' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    const open = page.getByRole('region', { name: 'Open positions' })
    const closed = page.getByRole('region', { name: 'No longer open' })
    await expect(open.getByRole('link', { name: OPEN.title, exact: true })).toBeVisible()
    await expect(saveButton(page, OPEN)).toHaveAttribute('aria-pressed', 'true')
    // No longer open: the title as text, and a pressed Save that removes it.
    for (const job of [CLOSED, WITHDRAWN]) {
      await expect(closed.getByRole('heading', { name: job.title })).toBeVisible()
      await expect(closed.getByRole('link', { name: job.title, exact: true })).toHaveCount(0)
      await expect(saveButton(page, job)).toHaveAttribute('aria-pressed', 'true')
    }
    // The last saved first: the closed job was saved after the withdrawn one.
    expect(
      await closed.locator('.job-list > li').evaluateAll((items) => items.map((item) => item.id)),
    ).toEqual([`job-${CLOSED.shortId}`, `job-${WITHDRAWN.shortId}`])
  })

  for (const [code, text] of [
    ['saved-full', 'You have saved 500 positions, the most there can be.'],
    ['not-public', 'This position can no longer be saved'],
  ] as const) {
    test(`a refused Save (${code}) is explained on the saved page, focused`, async ({
      page,
      baseURL,
    }) => {
      await signInAs(page.context(), 'email', baseURL!)
      await page.goto(`/en/account/saved/?error=${code}#outcome`)
      const message = page.locator('#outcome')
      await expect(message).toContainText(text)
      await expect(message).toHaveAttribute('role', 'alert')
      await expect(message).toBeFocused()
    })
  }

  test('the saved page removes a closed and a withdrawn position', async ({
    browser,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "once: it changes the test member's saved positions")
    const context = await browser.newContext()
    await signInAs(context, 'saver', baseURL!)
    const page = await context.newPage()
    await page.goto('/en/account/saved/')
    await expect(
      page.getByRole('link', { name: 'Saved (3)' }),
      'three saved positions: run pnpm e2e:member before the tests',
    ).toBeVisible()

    // With JavaScript: the withdrawn one, in place.
    await saveButton(page, WITHDRAWN).click()
    await expect(saveButton(page, WITHDRAWN)).toHaveAttribute('aria-pressed', 'false')
    await expect(status(page)).toHaveText(`Removed from your saved positions: ${WITHDRAWN.title}`)
    await expect(saveButton(page, WITHDRAWN)).toBeFocused()

    // Without JavaScript: the closed one. Its row is gone, and the page says what happened.
    const plainContext = await withoutJavaScript(browser, context)
    const plain = await plainContext.newPage()
    await plain.goto('/en/account/saved/')
    await expect(row(plain, WITHDRAWN)).toHaveCount(0)
    await saveButton(plain, CLOSED).click()
    await expect(plain).toHaveURL(/\/en\/account\/saved\/\?done=removed#outcome$/)
    const message = plain.locator('#outcome')
    await expect(message).toHaveText('The position has been removed from your saved positions.')
    await expect(message).toBeFocused()
    await expect(row(plain, CLOSED)).toHaveCount(0)
    await expect(plain.getByRole('region', { name: 'No longer open' })).toHaveCount(0)
    await expect(plain.getByRole('link', { name: 'Saved (1)' })).toBeVisible()
    await plainContext.close()
    await context.close()
  })
})
