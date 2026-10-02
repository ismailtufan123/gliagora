import { randomBytes } from 'node:crypto'

import { type Browser, type Page, type TestInfo, expect, test } from '@playwright/test'

import { FAKE_QUEUE_NOTE } from '../../src/scripts/fake-queue-data'
import { editorHeaders, editorPassword } from './editor'
import { clientAddress, expectNoSeriousAxeIssues, summary } from './forms'
import { TEXT_200, TEXT_SPACING, sidewaysScroll } from './layout'
import { latestEmailTo } from './mailpit'
import { isSignedIn, needsMailpit, providerMember } from './member'
import { expectLayoutHolds } from './pseudo-locale'

// The data-request form and its confirmation (M4b, D49; the M4b design §7.8). In the `destructive`
// project, which runs after every other test (playwright.config.ts): a confirmed deletion deletes
// suggestions and accounts and clears report addresses, which access.spec.ts must not see change
// while it samples them. Each test sends from its own client address, with addresses of its own,
// and reads what was stored through the editors' API (E2E_EDITOR_PASSWORD). The confirmation
// links arrive in Mailpit; the final email after a deletion is sent by a task the app under test
// never runs (tests/integration/data-requests.db.test.ts covers it). Three emails in all, against
// the site-wide cap (50 an hour by default; CI's app has a higher one, EMAIL_CAP_HOUR).
//
// The link's page with a valid link (a deletion, another request) and after a failure cannot be a
// fixed address in pages.ts, as each needs a link of its own: the flows below check them for
// reflow at 320px (with text spacing and at 200%) and in the pseudo-locale at 320 and 1280px, with
// the links they already have (opening one changes nothing).

const PAGE = '/en/legal/data-requests/'
const SENT = '/en/legal/data-requests/sent/'

type DataRequest = {
  kind: string
  source: string
  status: string
  action: string | null
  email: string | null
  name: string | null
  details: string | null
  emailHash: string | null
  outcome: Record<string, number> | null
  receivedAt: string
  respondBy: string | null
  closedAt: string | null
  purgeAt: string | null
}

test.skip(
  !editorPassword && !process.env.CI,
  'needs the test editor (E2E_EDITOR_PASSWORD, pnpm e2e:editor)',
)

const DAY = 86_400_000
const newAddress = () => `dr-${randomBytes(6).toString('hex')}@example.org`
/** A marker that finds this test's own suggestions and reports. */
const marker = () => `${FAKE_QUEUE_NOTE} e2e-${randomBytes(6).toString('hex')}`

async function openForm(browser: Browser) {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'X-Forwarded-For': clientAddress() },
  })
  const page = await context.newPage()
  await page.goto(PAGE)
  return page
}

const send = (page: Page) => page.getByRole('button', { name: 'Send request' }).click()
const kind = (page: Page, name: string) => page.getByRole('radio', { name, exact: true })

/** Sends the form as a person does, and lands on "Check your inbox". */
async function sendRequest(
  page: Page,
  fields: { email: string; kind: string; name?: string; details?: string },
) {
  await page.getByLabel('Your email address').fill(fields.email)
  await kind(page, fields.kind).check()
  if (fields.name) await page.getByLabel('Your name (optional)').fill(fields.name)
  if (fields.details) await page.getByLabel('Details', { exact: true }).fill(fields.details)
  await send(page)
  await page.waitForURL(SENT)
}

/** The confirmation link in the newest email to `address`. */
async function confirmationLink(address: string) {
  const { subject, text } = await latestEmailTo(address)
  expect(subject).toBe('Confirm your request to Gliagora')
  const link = /https?:\/\/\S+\/en\/legal\/data-requests\/confirm\/\?token=[A-Za-z0-9_-]{43}/.exec(
    text,
  )?.[0]
  expect(link, `a confirmation link in the email to ${address}`).toBeTruthy()
  return { link: link!, text }
}

/**
 * The link's page at `url` (in the `state` it shows) reflows at 320px, also with text spacing and
 * with text at 200%, and holds in the pseudo-locale at 320 and 1280px (layout.spec.ts and
 * pseudo-locale.spec.ts check the fixed pages so). Only opens the link, which changes nothing.
 */
async function linkPageHolds(browser: Browser, testInfo: TestInfo, url: string, state: string) {
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 1280, height: 800 },
  ]) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    await page.goto(url)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    if (viewport.width === 320) {
      expect(await sidewaysScroll(page), state).toBeLessThanOrEqual(0)
      await page.addStyleTag({ content: TEXT_SPACING })
      expect(await sidewaysScroll(page), `${state}, text spacing`).toBeLessThanOrEqual(0)
      await page.reload()
      await page.addStyleTag({ content: TEXT_200 })
      expect(await sidewaysScroll(page), `${state}, text at 200%`).toBeLessThanOrEqual(0)
      await page.reload()
    }
    await expectLayoutHolds(page, testInfo, state)
    await context.close()
  }
}

/** Documents of a collection, read through the editors' API. */
async function read<T>(page: Page, collection: string, where: Record<string, string>) {
  const query = new URLSearchParams({ depth: '0', limit: '20', ...where })
  const response = await page.request.get(`/api/${collection}/?${query}`, {
    headers: editorHeaders(),
  })
  expect(response.ok(), `${collection}: ${response.status()}`).toBe(true)
  return ((await response.json()) as { docs: T[] }).docs
}

test('shows the server’s messages in a summary that takes focus, at the fields', async ({
  browser,
}) => {
  const page = await openForm(browser)
  await send(page)
  const errors = summary(page)
  await expect(errors).toBeFocused()
  await expect(errors.getByRole('link')).toHaveText([
    'Enter your email address: we send the confirmation link there.',
    'Choose what you are asking for.',
  ])
  await expect(page.getByLabel('Your email address')).toHaveAttribute('aria-invalid', 'true')
  await expectNoSeriousAxeIssues(page)

  // Any request but a deletion says what it asks for; what was typed is kept.
  await page.getByLabel('Your email address').fill('someone@example.org')
  await kind(page, 'A copy of my data').check()
  await page.getByLabel('Your name (optional)').fill('Ada Example')
  await send(page)
  await expect(errors).toBeFocused()
  await expect(errors.getByRole('link')).toHaveText(['Tell us what you are asking for.'])
  await expect(page.getByLabel('Details', { exact: true })).toHaveAccessibleDescription(
    /^Needed for every request except a deletion.*Error: Tell us what you are asking for\.$/,
  )
  await expect(kind(page, 'A copy of my data')).toBeChecked()
  await expect(page.getByLabel('Your name (optional)')).toHaveValue('Ada Example')

  // The summary's link moves focus to the field.
  await errors.getByRole('link').click()
  await expect(page.getByLabel('Details', { exact: true })).toBeFocused()
  await page.context().close()
})

test('an unconfirmed request leaves a record with only its kind, date and address code', async ({
  browser,
}, testInfo) => {
  needsMailpit()
  const start = new Date(Date.now() - 1000).toISOString()
  const page = await openForm(browser)
  const address = newAddress()
  const details = `${marker()} Please stop using my data while you check it.`
  await sendRequest(page, {
    email: address,
    kind: 'Restrict how we use my data (EU)',
    name: 'Ada Example',
    details,
  })
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your inbox')
  await expect(page.getByRole('main')).toContainText('The link works for 24 hours and only once.')

  // The email acknowledges the request and repeats nothing the person wrote.
  const { link, text } = await confirmationLink(address)
  expect(text).toContain('to restrict how Gliagora | Neuroscience uses data about you')
  expect(text).not.toContain('Ada Example')
  expect(text).not.toContain(details)

  const [request, ...others] = await read<DataRequest>(page, 'data-requests', {
    'where[status][equals]': 'unconfirmed',
    'where[kind][equals]': 'restriction',
    'where[receivedAt][greater_than]': start,
  })
  expect(others).toEqual([])
  expect(request).toMatchObject({
    source: 'form',
    email: null,
    name: null,
    details: null,
    action: null,
    respondBy: null,
    outcome: null,
  })
  expect(request!.emailHash).toMatch(/^[0-9a-f]{64}$/)
  const days = (Date.parse(request!.purgeAt!) - Date.parse(request!.receivedAt)) / DAY
  expect(days).toBe(60)

  // The link's page names the address and the request, and changes nothing by being opened.
  await page.goto(link)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Confirm your request')
  await expect(page.getByRole('main')).toContainText(`Request from ${address}`)
  await expect(page.getByRole('main')).toContainText(
    'You asked for: Restrict how we use my data (EU)',
  )
  await page.goto(link)
  await expect(page.getByRole('button', { name: 'Confirm my request' })).toBeVisible()
  await linkPageHolds(browser, testInfo, link, 'data request link (other request)')
  await page.context().close()
})

test('a confirmed deletion deletes suggestions, the account and report addresses, but not personal-rights requests', async ({
  browser,
}, testInfo) => {
  needsMailpit()
  const address = newAddress()
  // The forms keep the address as typed; the deletion finds it whatever its case.
  const typed = address.replace(/^dr-/, 'DR-').replace('example.org', 'Example.ORG')
  const note = marker()

  // A suggestion with the address, sent to be told the outcome.
  const suggesting = await openForm(browser)
  await suggesting.goto('/en/suggest/')
  await suggesting
    .getByLabel('Address of the original page')
    .fill(`https://careers.example.org/e2e/${randomBytes(6).toString('hex')}`)
  await suggesting.getByLabel('A position').check()
  await suggesting.getByLabel('Note (optional)').fill(`${note} Suggested before a deletion.`)
  await suggesting.getByLabel('Your email address (optional)').fill(typed)
  await suggesting.getByLabel('Email me the outcome of this suggestion').check()
  await suggesting.getByRole('button', { name: 'Send suggestion' }).click()
  await suggesting.waitForURL('/en/suggest/sent/')

  // A report about a wrong fact and a request about personal rights, both with the address.
  for (const [what, details] of [
    ['A fact is wrong', `${note} A wrong fact.`],
    ['It is about you and harms your rights', `${note} My name should not be there.`],
  ] as const) {
    await suggesting.goto('/en/report/')
    await suggesting.getByLabel(what).check()
    await suggesting.getByLabel('Details', { exact: true }).fill(details)
    await suggesting.getByLabel('Your email address').fill(typed)
    await suggesting.getByRole('button', { name: 'Send report' }).click()
    await suggesting.waitForURL('/en/report/sent/')
  }

  // A member account with the address (Google manages it, so it is stored).
  const member = await providerMember(browser, 'google', { email: address })
  expect(await isSignedIn(member.page)).toBe(true)

  const page = await openForm(browser)
  await sendRequest(page, { email: address, kind: 'Delete my data' })
  const { link } = await confirmationLink(address)

  await page.goto(link)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Delete your data?')
  const main = page.getByRole('main')
  await expect(main).toContainText(`Request from ${address}`)
  await expect(main.getByRole('heading', { name: 'What is deleted' })).toBeVisible()
  await expect(main).toContainText('A Gliagora account with this address, if there is one')
  await expect(main).toContainText('Your address on the problem reports and corrections you sent')
  await expect(main.getByRole('heading', { name: 'What stays' })).toBeVisible()
  await expectNoSeriousAxeIssues(page)
  await linkPageHolds(browser, testInfo, link, 'data request link (deletion)')
  // After a failure: the same page, with the message and its reference, and the link still works.
  const failed = `${link}&error=failed&ref=0123456789`
  await page.goto(failed)
  const outcome = page.locator('#outcome')
  await expect(outcome).toHaveAttribute('role', 'alert')
  await expect(outcome).toContainText('mention reference 0123456789')
  await expect(page.getByRole('button', { name: 'Delete my data' })).toBeVisible()
  await linkPageHolds(browser, testInfo, failed, 'data request link (failed)')
  await page.goto(link)
  await page.getByRole('button', { name: 'Delete my data' }).click()
  await page.waitForURL('/en/legal/data-requests/done/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your data has been deleted')

  // The suggestion is gone, the account too, and the problem report has lost its address; the
  // request about personal rights keeps it.
  expect(await read(page, 'submissions', { 'where[note][contains]': note })).toEqual([])
  const reports = await read<{ kind: string; email: string | null }>(page, 'reports', {
    'where[details][contains]': note,
  })
  expect(reports.map(({ kind, email }) => [kind, email]).sort()).toEqual([
    ['personal-rights', typed],
    ['wrong-fact', null],
  ])
  expect(await isSignedIn(member.page)).toBe(false)

  const [request, ...others] = await read<DataRequest>(page, 'data-requests', {
    'where[email][equals]': address,
  })
  expect(others).toEqual([])
  expect(request).toMatchObject({
    kind: 'deletion',
    source: 'form',
    status: 'closed',
    action: 'deleted-automatically',
    email: address,
    name: null,
    details: null,
    outcome: {
      suggestionsDeleted: 1,
      accountDeleted: 1,
      newsletterRemoved: 0,
      reportAddressesCleared: 1,
      personalRightsReportsKept: 1,
    },
  })

  // The link worked once.
  await page.goto(link)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This link has expired')
  await page.context().close()
  await suggesting.context().close()
  await member.context.close()
})

test('another request is confirmed and recorded as New, with the name and details', async ({
  browser,
}) => {
  needsMailpit()
  const address = newAddress()
  const details = `${marker()} My city is listed as Bonn; it is Berlin.`
  const page = await openForm(browser)
  await sendRequest(page, { email: address, kind: 'Correct my data', name: 'Ada Example', details })
  const { link } = await confirmationLink(address)

  await page.goto(link)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Confirm your request')
  await expect(page.getByRole('main')).toContainText('You asked for: Correct my data')
  await expectNoSeriousAxeIssues(page)
  await page.getByRole('button', { name: 'Confirm my request' }).click()
  await page.waitForURL('/en/legal/data-requests/received/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Your request has been confirmed',
  )

  const [request, ...others] = await read<DataRequest>(page, 'data-requests', {
    'where[email][equals]': address,
  })
  expect(others).toEqual([])
  expect(request).toMatchObject({
    kind: 'correction',
    source: 'form',
    status: 'new',
    action: null,
    email: address,
    name: 'Ada Example',
    details,
    closedAt: null,
    purgeAt: null,
  })
  const days = (Date.parse(request!.respondBy!) - Date.parse(request!.receivedAt)) / DAY
  expect(days).toBe(30)
  await page.context().close()
})

test('a confirmation from another site, or with a used link, changes nothing', async ({
  request,
  baseURL,
}) => {
  const token = 'a'.repeat(43)
  const foreign = await request.post('/en/legal/data-requests/confirm/use/', {
    form: { token },
    headers: { Origin: 'https://evil.example' },
    maxRedirects: 0,
  })
  expect(foreign.status()).toBe(403)
  const unknown = await request.post('/en/legal/data-requests/confirm/use/', {
    form: { token },
    headers: { Origin: new URL(baseURL!).origin },
    maxRedirects: 0,
  })
  expect(unknown.status()).toBe(303)
  expect(unknown.headers()['location']).toBe('/en/legal/data-requests/confirm/')
})
