import { randomBytes } from 'node:crypto'

import { type Browser, type Page, type TestInfo, expect, test } from '@playwright/test'

import { clientAddress, expectNoSeriousAxeIssues, summary } from './forms'
import { TEXT_200, TEXT_SPACING, sidewaysScroll } from './layout'
import { needsListmonk, subscribersWith } from './listmonk'
import { emailHeaders, latestEmailTo } from './mailpit'
import { needsMailpit } from './member'
import { expectLayoutHolds } from './pseudo-locale'

// The Glia Notes signup (M2, D50; PLAN §9.10, §13) through the browser, against an app with a mail
// server (Mailpit) and listmonk (CI's, or one started locally with the same LISTMONK_URL and
// LISTMONK_API_TOKEN for the app and these tests): the form's messages, the double opt-in (listmonk
// holds nothing until the emailed link is confirmed), the welcome email with its one-click headers,
// unsubscribing from the page and with a mail program's one-click POST (another site, no Origin;
// the links name listmonk's subscriber ID and UUID), and the routes' refusals. Each test uses addresses and a client address of its own; four emails
// in all. The pages a live link or the cookie opens are checked here for reflow at 320px (with text
// spacing and at 200%) and in the pseudo-locale at 320 and 1280px, as layout.spec.ts and
// pseudo-locale.spec.ts check the fixed pages of pages.ts.

test.skip(({ isMobile }) => isMobile, 'the flows run on the desktop project')

const FORM = '/en/newsletter/'
const INBOX = '/en/newsletter/check-your-inbox/'
const CONFIRM_LINK = /https?:\/\/\S+\/en\/newsletter\/confirm\/\?token=[A-Za-z0-9_-]{43}/
const UNSUBSCRIBE_LINK =
  /https?:\/\/\S+\/en\/newsletter\/unsubscribe\/\?id=([0-9]+)&s=([0-9a-f-]{36})/
/** What the one-click route answers, for every link that is not incomplete. */
const ONE_CLICK_DONE =
  'Unsubscribed from Glia Notes. If this address was on the list, it is deleted.'

const newAddress = () => `nl-${randomBytes(6).toString('hex')}@example.org`

async function openForm(browser: Browser) {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'X-Forwarded-For': clientAddress() },
  })
  const page = await context.newPage()
  await page.goto(FORM)
  return page
}

const send = (page: Page) => page.getByRole('button', { name: 'Get the monthly digest' }).click()

/** Signs `address` up through the form, as a person does, and lands on "Check your inbox". */
async function signUp(page: Page, address: string) {
  await page.getByLabel('Your email address').fill(address)
  await page.getByLabel('I agree to receive Glia Notes by email.').check()
  await send(page)
  await page.waitForURL(INBOX)
  // The Server Action's redirect renders the page in place; its title follows the content.
  await expect(page).toHaveTitle(/^Check your inbox/)
}

/** The confirmation link in the newest email to `address`. */
async function confirmationLink(address: string) {
  const { subject, text } = await latestEmailTo(address)
  expect(subject).toBe('Confirm your subscription to Glia Notes')
  const link = CONFIRM_LINK.exec(text)?.[0]
  expect(link, `a confirmation link in the email to ${address}`).toBeTruthy()
  return link!
}

/** Signs up and confirms: the welcome email's unsubscribe page and the subscriber's ID and UUID. */
async function subscribe(page: Page, address: string) {
  await signUp(page, address)
  await page.goto(await confirmationLink(address))
  await page.getByRole('button', { name: 'Confirm my subscription' }).click()
  await page.waitForURL('/en/newsletter/confirmed/')
  const welcome = await latestEmailTo(address, { count: 2 })
  expect(welcome.subject).toBe('You are subscribed to Glia Notes')
  const [unsubscribePage, id, uuid] = UNSUBSCRIBE_LINK.exec(welcome.text) ?? []
  expect(unsubscribePage, 'an unsubscribe link in the welcome email').toBeTruthy()
  return { welcome, unsubscribePage: unsubscribePage!, id: id!, uuid: uuid! }
}

/**
 * The page open in `page` reflows at 320px, also with text spacing and with text at 200%, and holds
 * in the pseudo-locale at 320 and 1280px. In the page's own context (it may need its cookie); only
 * reloads the page, which changes nothing.
 */
async function pageHolds(page: Page, testInfo: TestInfo, state: string) {
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport)
    await page.reload()
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
    await page.reload()
  }
}

test('shows the server’s messages in a summary that takes focus, at the fields', async ({
  browser,
}) => {
  needsMailpit()
  needsListmonk()
  const page = await openForm(browser)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Glia Notes')
  // The box is never ticked for the person.
  await expect(page.getByLabel('I agree to receive Glia Notes by email.')).not.toBeChecked()
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Glia Notes consent text (in Turkish)' }),
  ).toHaveAttribute('href', '/tr/legal/acik-riza-metni/')
  await send(page)
  const errors = summary(page)
  await expect(errors).toBeFocused()
  await expect(errors.getByRole('link')).toHaveText([
    'Enter your email address: we send the confirmation link there.',
    'Tick the box to agree to receive Glia Notes by email.',
  ])
  await expect(page.getByLabel('Your email address')).toHaveAttribute('aria-invalid', 'true')
  await expectNoSeriousAxeIssues(page)

  // What was typed is kept; the box still has to be ticked.
  await page.getByLabel('Your email address').fill('someone@example.org')
  await send(page)
  await expect(errors).toBeFocused()
  await expect(errors.getByRole('link')).toHaveText([
    'Tick the box to agree to receive Glia Notes by email.',
  ])
  await expect(page.getByLabel('Your email address')).toHaveValue('someone@example.org')
  await errors.getByRole('link').click()
  await expect(page.getByLabel('I agree to receive Glia Notes by email.')).toBeFocused()
  await page.context().close()
})

test('subscribes only once the emailed link is confirmed, and unsubscribes at once', async ({
  browser,
}, testInfo) => {
  needsMailpit()
  needsListmonk()
  const page = await openForm(browser)
  const address = newAddress()
  await signUp(page, address)

  // "Check your inbox" names the address, masked, from the sealed cookie.
  const main = page.getByRole('main')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your inbox')
  await expect(main).toContainText(`We sent a confirmation link to n•••@example.org.`)
  await expect(main).toContainText('It expires in 7 days.')
  await expect(main).not.toContainText(address)
  await expectNoSeriousAxeIssues(page)
  // "Send it again" waits a minute, also without JavaScript: the server says so.
  await page.getByRole('button', { name: 'Send it again' }).click()
  await page.waitForURL(`${INBOX}?error=wait#outcome`)
  await expect(page.locator('#outcome')).toHaveText(
    'We sent the last link less than a minute ago. Please wait a minute before asking again.',
  )
  await pageHolds(page, testInfo, 'newsletter: check your inbox')

  // Until it is confirmed, listmonk has never seen the address.
  expect(await subscribersWith(address)).toEqual([])
  const link = await confirmationLink(address)
  await page.goto(link)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Confirm your subscription')
  await expect(main).toContainText(`Subscribe ${address} to Glia Notes.`)
  await expectNoSeriousAxeIssues(page)
  await pageHolds(page, testInfo, 'newsletter link')
  // Opening the link changed nothing.
  expect(await subscribersWith(address)).toEqual([])
  await page.getByRole('button', { name: 'Confirm my subscription' }).click()
  await page.waitForURL('/en/newsletter/confirmed/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You are subscribed')

  const [subscriber, ...others] = await subscribersWith(address)
  expect(others).toEqual([])
  expect(subscriber?.lists).toEqual([
    expect.objectContaining({ name: 'Glia Notes', subscription_status: 'confirmed' }),
  ])

  // The welcome email: the first issue with the launch, and the way out, also as one click.
  const welcome = await latestEmailTo(address, { count: 2 })
  expect(welcome.subject).toBe('You are subscribed to Glia Notes')
  expect(welcome.text).toContain('The first issue arrives with the public launch of Gliagora.')
  const [unsubscribePage, id, uuid] = UNSUBSCRIBE_LINK.exec(welcome.text) ?? []
  expect(Number(id)).toBe(subscriber?.id)
  expect(uuid).toBe(subscriber?.uuid)
  const headers = await emailHeaders(welcome.id)
  expect(headers['List-Unsubscribe']?.map((value) => value.trim())).toEqual([
    expect.stringMatching(
      new RegExp(`^<https?://\\S+/en/newsletter/unsubscribe/use/\\?id=${id}&s=${uuid}>$`),
    ),
  ])
  expect(headers['List-Unsubscribe-Post']).toEqual(['List-Unsubscribe=One-Click'])

  // The link worked once.
  await page.goto(link)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This link has expired')

  // The unsubscribe page asks first; its button deletes the address at once.
  await page.goto(unsubscribePage!)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Unsubscribe from Glia Notes')
  await expectNoSeriousAxeIssues(page)
  await pageHolds(page, testInfo, 'newsletter: unsubscribe')
  expect(await subscribersWith(address)).toHaveLength(1)
  await page.getByRole('button', { name: 'Unsubscribe' }).click()
  await page.waitForURL('/en/newsletter/unsubscribed/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You are unsubscribed')
  await expect(main).toContainText('If this address was on the list, we have deleted it.')
  expect(await subscribersWith(address)).toEqual([])
  await page.context().close()
})

test('unsubscribes with a mail program’s one-click POST, from another site and without Origin', async ({
  browser,
  request,
}) => {
  needsMailpit()
  needsListmonk()
  const page = await openForm(browser)
  const address = newAddress()
  const { welcome, id, uuid } = await subscribe(page, address)
  const header = (await emailHeaders(welcome.id))['List-Unsubscribe']![0]!.trim()
  const oneClick = new URL(header.slice(1, -1))
  expect(oneClick.pathname).toBe('/en/newsletter/unsubscribe/use/')
  expect(oneClick.searchParams.get('id')).toBe(id)
  expect(oneClick.searchParams.get('s')).toBe(uuid)

  // As RFC 8058 says a mail program posts it: the address from the header, the body below, no
  // cookie, no Origin, no Sec-Fetch-Site.
  const response = await request.post(`${oneClick.pathname}${oneClick.search}`, {
    form: { 'List-Unsubscribe': 'One-Click' },
    maxRedirects: 0,
  })
  expect(response.status()).toBe(200)
  expect(await response.text()).toBe(ONE_CLICK_DONE)
  expect(await subscribersWith(address)).toEqual([])
  // Again, for an ID nobody has, for another UUID than the subscriber's, or listmonk's preview
  // UUID: the same answer, which says the address is deleted only if it was on the list.
  for (const query of [
    `id=${id}&s=${uuid}`,
    `id=2147483646&s=${uuid}`,
    `id=${id}&s=0b2c6f8e-3f0a-4c1e-9d55-6f1d2a7b8c9d`,
    'id=0&s=00000000-0000-0000-0000-000000000000',
  ]) {
    const again = await request.post(`/en/newsletter/unsubscribe/use/?${query}`, {
      form: { 'List-Unsubscribe': 'One-Click' },
      maxRedirects: 0,
    })
    expect(again.status(), query).toBe(200)
    expect(await again.text(), query).toBe(ONE_CLICK_DONE)
  }
  // An incomplete link (the UUID alone) is not taken for an unsubscribe.
  const incomplete = await request.post(`/en/newsletter/unsubscribe/use/?s=${uuid}`, {
    form: { 'List-Unsubscribe': 'One-Click' },
    maxRedirects: 0,
  })
  expect(incomplete.status()).toBe(400)
  await page.context().close()
})

test('the routes refuse another site’s POST where they must, and GET only shows a page', async ({
  request,
}) => {
  const evil = { Origin: 'https://evil.example' }
  for (const path of ['/en/newsletter/confirm/use/', '/en/newsletter/resend/']) {
    const response = await request.post(path, {
      form: { token: 'a'.repeat(43) },
      headers: evil,
      maxRedirects: 0,
    })
    expect(response.status(), path).toBe(403)
  }
  const uuid = '0b2c6f8e-3f0a-4c1e-9d55-6f1d2a7b8c9d'
  for (const [path, location] of [
    [
      `/en/newsletter/unsubscribe/use/?id=7&s=${uuid}`,
      `/en/newsletter/unsubscribe/?id=7&s=${uuid}`,
    ],
    [`/en/newsletter/unsubscribe/use/?s=${uuid}`, '/en/newsletter/unsubscribe/'],
    ['/en/newsletter/unsubscribe/use/?id=7&s=<script>', '/en/newsletter/unsubscribe/'],
    ['/en/newsletter/confirm/use/', '/en/newsletter/confirm/'],
    ['/en/newsletter/resend/', INBOX],
  ] as const) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status(), path).toBe(303)
    expect(response.headers()['location'], path).toBe(location)
  }
})

test('leads an unknown confirmation link to its page, which says it has expired', async ({
  request,
  baseURL,
}) => {
  needsListmonk()
  // From the site's own pages: not refused, and not a failure either (no `error=` in the address).
  const unknown = await request.post('/en/newsletter/confirm/use/', {
    form: { token: 'a'.repeat(43) },
    headers: { Origin: new URL(baseURL!).origin },
    maxRedirects: 0,
  })
  expect(unknown.status()).toBe(303)
  expect(unknown.headers()['location']).toBe('/en/newsletter/confirm/')
})

test('an incomplete unsubscribe link says so, and shows no button', async ({ page }) => {
  const uuid = '0b2c6f8e-3f0a-4c1e-9d55-6f1d2a7b8c9d'
  for (const query of ['?s=not-a-uuid', `?s=${uuid}`, '?id=7', '']) {
    await page.goto(`/en/newsletter/unsubscribe/${query}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Unsubscribe from Glia Notes')
    await expect(page.getByRole('main')).toContainText('This unsubscribe link is incomplete.')
    await expect(page.getByRole('button', { name: 'Unsubscribe' })).toHaveCount(0)
  }
  // A complete link shows the button; opening it asks listmonk nothing and changes nothing.
  await page.goto(`/en/newsletter/unsubscribe/?id=7&s=${uuid}`)
  await expect(page.getByRole('button', { name: 'Unsubscribe' })).toBeVisible()
  await expect(page.getByRole('main')).not.toContainText('incomplete')
})
