import { type BrowserContext, type Page, expect, test } from '@playwright/test'

import { e2eMemberToken } from '../../src/scripts/e2e-member-account'
import { expectNoSeriousAxeIssues, summary } from './forms'
import { emailCount, latestEmailTo, signInLinkTo } from './mailpit'
import {
  SESSION_COOKIE,
  SIGN_IN_COOKIE,
  askForLink,
  freshMember,
  memberToken,
  needsMailpit,
  needsMemberToken,
  newAddress,
  ownContext,
  signInByLink,
} from './member'

// Signing in with an emailed link, and signing out (M4b, D49; the M4b design §7.1, §8). The pages
// themselves are in tests/e2e/pages.ts (axe, layout, pseudo-locale, budgets); these follow the
// flows. They need an app that sends email to Mailpit (SMTP_HOST, MAILPIT_URL), as CI's does, and
// each test uses addresses and a client address of its own, so they never share a limit. Desktop
// only: the flows do not depend on the device, and every email counts against the site-wide cap.

const LINK_USE = '/en/sign-in/link/use/'

test.skip(({ isMobile }) => isMobile, 'sign-in flows run on the desktop project')

/** The cookies of a context, by name. */
async function cookiesOf(context: BrowserContext) {
  return Object.fromEntries((await context.cookies()).map((cookie) => [cookie.name, cookie]))
}

/** The token at the end of a sign-in link. */
const tokenOf = (link: string) => new URL(link).searchParams.get('token')!

/** The account page's state: signed in (its heading) or the sign-in panel. */
async function signedIn(page: Page) {
  await page.goto('/en/account/')
  return (await page.getByRole('heading', { level: 1 }).textContent()) === 'Your account'
}

test.describe('sign-in form', () => {
  test.beforeEach(() => needsMailpit())

  test('says what is wrong, and the summary takes focus', async ({ browser }) => {
    const context = await ownContext(browser)
    const page = await context.newPage()
    await page.goto('/en/sign-in/')
    const send = page.getByRole('button', { name: 'Email me a sign-in link' })
    await send.click()
    await expect(summary(page)).toBeFocused()
    await expect(summary(page)).toContainText('Enter your email address.')
    const field = page.getByRole('textbox', { name: 'Email address' })
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await field.fill('not an address')
    await send.click()
    await expect(summary(page)).toContainText(
      'Enter an email address in the correct format, such as name@example.org.',
    )
    await expect(field).toHaveValue('not an address')
    await expectNoSeriousAxeIssues(page)
    await context.close()
  })

  test('shares one budget among the variants of an address: 3 links an hour', async ({
    browser,
  }) => {
    const context = await ownContext(browser)
    const page = await context.newPage()
    const [local, domain] = newAddress().split('@')
    for (const tag of ['a', 'b', 'c']) await askForLink(page, `${local}+${tag}@${domain}`)
    await page.goto('/en/sign-in/')
    await page
      .getByRole('textbox', { name: 'Email address' })
      .fill(`${local!.toUpperCase()}@${domain}`)
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
    await expect(summary(page)).toBeFocused()
    await expect(summary(page)).toContainText('Too many sign-in links have been asked for')
    expect(await emailCount(`${local}@${domain}`)).toBe(0)
    await context.close()
  })
})

test.describe('emailed sign-in links', () => {
  test.beforeEach(() => needsMailpit())

  test('by keyboard: opening the link changes nothing, the button creates the account', async ({
    browser,
    baseURL,
  }) => {
    const context = await ownContext(browser)
    const page = await context.newPage()
    const address = newAddress()

    await test.step('ask for a link, by keyboard', async () => {
      await page.goto('/en/sign-in/')
      await page.getByRole('textbox', { name: 'Email address' }).focus()
      await page.keyboard.type(address)
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/en\/sign-in\/sent\/$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your inbox')
    })

    // The browser that asked holds the link's binding in the sealed sign-in cookie.
    const asked = await cookiesOf(context)
    expect(asked[SIGN_IN_COOKIE]).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      domain: new URL(baseURL!).hostname,
    })
    expect(asked[SESSION_COOKIE]).toBeUndefined()

    const email = await latestEmailTo(address)
    expect(email.subject).toBe('Your link to sign in to Gliagora')
    expect(email.text).toContain('The link works for 15 minutes and only once.')
    const link = await signInLinkTo(address)

    await test.step('opening the link twice uses nothing and changes no cookie', async () => {
      for (let i = 0; i < 2; i++) {
        await page.goto(link)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(
          'Create your Gliagora account',
        )
      }
      await expect(page.getByRole('main')).toContainText(
        `Create your Gliagora account for ${address}.`,
      )
      await expect(page.getByRole('main')).toContainText('confirm that you are 16 or older')
      // Opened in the browser that asked: no warning.
      await expect(page.getByRole('note')).toHaveCount(0)
      expect(await cookiesOf(context)).toEqual(asked)
      await expectNoSeriousAxeIssues(page)
    })

    await test.step('the button, by keyboard, signs in with a new session', async () => {
      const button = page.getByRole('button', { name: 'Create account' })
      await button.focus()
      const posted = page.waitForResponse(
        (response) => response.url().endsWith(LINK_USE) && response.request().method() === 'POST',
      )
      await page.keyboard.press('Enter')
      const response = await posted
      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toBe('/en/account/?done=created#outcome')
      const setCookies = await response.headersArray()
      const session = setCookies.find(
        (header) =>
          header.name.toLowerCase() === 'set-cookie' &&
          header.value.startsWith(`${SESSION_COOKIE}=`),
      )!.value
      expect(session).toMatch(
        new RegExp(
          `^${SESSION_COOKIE}=[A-Za-z0-9_-]{43}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$`,
        ),
      )
      await expect(page).toHaveURL(/\/en\/account\/\?done=created#outcome$/)
      // The message is focused through the address's fragment.
      await expect(page.locator('#outcome')).toBeFocused()
      await expect(page.locator('#outcome')).toHaveText(
        'Your account has been created, and you are signed in.',
      )
      await expect(page.getByRole('main')).toContainText(`You are signed in as ${address}.`)
      const after = await cookiesOf(context)
      expect(after[SESSION_COOKIE]).toMatchObject({
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
        domain: new URL(baseURL!).hostname,
      })
      expect(after[SIGN_IN_COOKIE]).toBeUndefined()
      await expectNoSeriousAxeIssues(page)
    })

    await test.step('the link works once', async () => {
      const again = await page.request.post(LINK_USE, {
        form: { token: tokenOf(link) },
        headers: { Origin: new URL(baseURL!).origin },
        maxRedirects: 0,
      })
      expect(again.status()).toBe(303)
      expect(again.headers()['location']).toBe('/en/sign-in/?error=link-expired#outcome')
      await page.goto(link)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('This link has expired')
    })

    await test.step('signed out, a new link for the address says "Sign in as"', async () => {
      await page.goto('/en/account/')
      const nav = page.getByRole('navigation', { name: 'Your account' })
      await expect(nav.getByRole('link', { name: 'Account' })).toHaveAttribute(
        'aria-current',
        'page',
      )
      await nav.getByRole('button', { name: 'Sign out' }).click()
      await expect(page).toHaveURL(/\/en\/sign-in\/signed-out\/$/)
      expect((await cookiesOf(context))[SESSION_COOKIE]).toBeUndefined()
      expect(await signedIn(page)).toBe(false)
      await askForLink(page, address)
      await page.goto(await signInLinkTo(address, { count: 2 }))
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to Gliagora')
      await expect(page.getByRole('main')).toContainText(`Sign in as ${address}.`)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page).toHaveURL(/\/en\/account\/\?done=signed-in#outcome$/)
      await expect(page.locator('#outcome')).toHaveText('You are signed in.')
    })
    await context.close()
  })

  test('a link opened in another browser warns first; the browser that asked does not', async ({
    browser,
  }) => {
    const asking = await ownContext(browser)
    const other = await ownContext(browser)
    const address = newAddress()
    const page = await asking.newPage()
    await askForLink(page, address)
    const link = await signInLinkTo(address)

    const elsewhere = await other.newPage()
    await elsewhere.goto(link)
    const warning = elsewhere.getByRole('note')
    await expect(warning).toHaveText(
      `This link was opened in a different browser from the one where it was requested. Continue only if you asked for a sign-in link for ${address} just now.`,
    )
    // It still works there: opening an email on another device is common.
    await expect(elsewhere.getByRole('button', { name: 'Create account' })).toBeVisible()
    await expectNoSeriousAxeIssues(elsewhere)

    await page.goto(link)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create your Gliagora account')
    await expect(page.getByRole('note')).toHaveCount(0)
    await asking.close()
    await other.close()
  })

  for (const [next, landing] of [
    ['/en/jobs/?type=phd', /\/en\/jobs\/\?type=phd$/],
    // Never off the site: another site's address leads to the account instead.
    ['//example.org/en/jobs/', /\/en\/account\/\?done=created#outcome$/],
  ] as const) {
    test(`leads back to where sign-in started (next=${next})`, async ({ browser }) => {
      const context = await ownContext(browser)
      const page = await context.newPage()
      const address = newAddress()
      await page.goto(`/en/sign-in/?next=${encodeURIComponent(next)}`)
      await page.getByRole('textbox', { name: 'Email address' }).fill(address)
      await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
      await expect(page).toHaveURL(/\/en\/sign-in\/sent\/$/)
      await page.goto(await signInLinkTo(address))
      await page.getByRole('button', { name: 'Create account' }).click()
      await expect(page).toHaveURL(landing)
      await context.close()
    })
  }

  test('every address gets the same answer and the same email', async ({ browser }) => {
    const { context, page, address: existing } = await freshMember(browser)
    // Signed out, as a stranger would be.
    await context.clearCookies()
    const unknown = newAddress()
    const texts: string[] = []
    for (const address of [existing, unknown]) {
      await askForLink(page, address)
      const html = await page.getByRole('main').innerHTML()
      texts.push(html)
    }
    expect(texts[0]).toBe(texts[1])
    const neutral = async (address: string, count: number) => {
      const { subject, text } = await latestEmailTo(address, { count })
      return `${subject}\n${text}`.replace(/token=[A-Za-z0-9_-]{43}/, 'token=…')
    }
    expect(await neutral(existing, 2)).toBe(await neutral(unknown, 1))
    await context.close()
  })
})

test.describe('signing out', () => {
  test.beforeEach(() => needsMailpit())

  test('everywhere ends every session of the account', async ({ browser }) => {
    const first = await freshMember(browser)
    // A second browser signed in to the same account.
    const second = await ownContext(browser)
    const page = await second.newPage()
    await signInByLink(page, first.address)
    expect(await signedIn(first.page)).toBe(true)

    await page.goto('/en/account/')
    await page.getByRole('button', { name: 'Sign out everywhere' }).click()
    await expect(page).toHaveURL(/\/en\/sign-in\/signed-out\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('You are signed out')
    expect((await cookiesOf(second))[SESSION_COOKIE]).toBeUndefined()
    expect(await signedIn(first.page)).toBe(false)
    await expect(first.page.getByRole('heading', { level: 1 })).toHaveText(
      'Sign in to see your account',
    )
    await first.context.close()
    await second.close()
  })
})

test.describe('member routes', () => {
  test('refuse posts from other sites, and answer a plain visit with the right page', async ({
    request,
    baseURL,
  }) => {
    const own = new URL(baseURL!).origin
    for (const path of [LINK_USE, '/en/sign-out/']) {
      for (const headers of <Record<string, string>[]>[
        { Origin: 'https://example.org' },
        { Origin: 'null' },
        { Origin: own, 'Sec-Fetch-Site': 'cross-site' },
        {},
      ]) {
        const response = await request.post(path, {
          form: { token: 'x', scope: 'everywhere' },
          headers,
          maxRedirects: 0,
        })
        expect(response.status(), `${path} ${JSON.stringify(headers)}`).toBe(403)
      }
    }
    for (const [path, location] of [
      [LINK_USE, '/en/sign-in/'],
      ['/en/sign-out/', '/en/account/'],
    ]) {
      const response = await request.get(path!, { maxRedirects: 0 })
      expect(response.status(), path).toBe(303)
      expect(response.headers()['location'], path).toBe(location)
    }
  })

  test('a signed-out sign-out leads to "You are signed out" and clears the cookies', async ({
    request,
    baseURL,
  }) => {
    const response = await request.post('/en/sign-out/', {
      form: { scope: 'this' },
      headers: { Origin: new URL(baseURL!).origin },
      maxRedirects: 0,
    })
    expect(response.status()).toBe(303)
    expect(response.headers()['location']).toBe('/en/sign-in/signed-out/')
    const cleared = (await response.headersArray())
      .filter((header) => header.name.toLowerCase() === 'set-cookie')
      .map((header) => header.value)
    expect(cleared).toEqual([
      `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      `${SIGN_IN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    ])
  })

  test('are never indexed', async ({ request }) => {
    for (const path of [
      '/en/sign-in/',
      '/en/sign-in/sent/',
      '/en/sign-in/link/?token=expired',
      '/en/sign-in/signed-out/',
      '/en/account/',
    ]) {
      const html = await (await request.get(path)).text()
      expect(html, path).toContain('<meta name="robots" content="noindex"')
    }
  })

  test('a member session is no editor session: the API and the admin do not know it', async ({
    page,
    request,
    baseURL,
  }) => {
    needsMemberToken()
    const cookie = `${SESSION_COOKIE}=${e2eMemberToken(memberToken!, 'email')}`
    const me = await request.get('/api/users/me/', { headers: { Cookie: cookie } })
    expect(me.status()).toBe(200)
    expect(await me.json()).toMatchObject({ user: null })
    await page.context().addCookies([
      {
        name: SESSION_COOKIE,
        value: e2eMemberToken(memberToken!, 'email'),
        domain: new URL(baseURL!).hostname,
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ])
    await page.goto('/admin/')
    await expect(page).toHaveURL(/\/admin\/login/)
  })
})
