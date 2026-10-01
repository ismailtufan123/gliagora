import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test'

import { E2E_MEMBER_EMAIL } from '../../src/scripts/e2e-member-account'
import { expectNoSeriousAxeIssues, summary } from './forms'
import { latestEmailTo, signInLinkTo } from './mailpit'
import {
  SESSION_COOKIE,
  freshMember,
  isSignedIn,
  needsMailpit,
  newAddress,
  ownContext,
  providerMember,
  signInAs,
  signInByLink,
} from './member'

// The account's settings (M4b, D49; the M4b design §4, §7.3, §7.4): Glia Notes, the preferred
// subfields and their effect on the jobs list (D35), adding or changing the email address through
// an emailed link, and the display name. Needs the fake jobs (pnpm fake:jobs), the test members
// (pnpm e2e:member: the email member prefers Glial biology and Cognitive), the fake providers and
// Mailpit: tests that change an account make members of their own, in contexts of their own, so
// parallel tests never meet; through the fake Google where no email is needed, which keeps the
// run's emails below the site-wide cap. Desktop only: the flows do not depend on the device.

test.skip(({ isMobile }) => isMobile, 'account flows run on the desktop project')

/** The outcome message, which the redirect's `#outcome` focuses. */
const outcome = (page: Page) => page.locator('#outcome')
/** The D35 notice on the jobs list. */
const notice = (page: Page) => page.locator('[data-preferred]')
/** The jobs list's count of matching positions. */
const matches = (page: Page) => page.locator('#job-results-count')
/** A filter chip by its label. */
const chip = (page: Page, label: string) =>
  page.getByRole('link', { name: `Remove filter: ${label}`, exact: true })
/** A box of the filter form, by its value. */
const filterBox = (page: Page, name: string, value: string) =>
  page.locator(`#job-filters input[name="${name}"][value="${value}"]`)
/** A box of the account's preferred subfields, by its label. */
const subfieldBox = (page: Page, label: string) =>
  page.locator('#subfields').getByRole('checkbox', { name: label, exact: true })

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The address `path` at the end of the page's URL. */
const endsWith = (path: string) => new RegExp(`${escape(path)}$`)

/** The visible titles of the job rows and the count above them. */
async function listed(page: Page) {
  return {
    count: await matches(page).innerText(),
    titles: await page.locator('#job-results .job-list > li h3').allInnerTexts(),
  }
}

/** A context without JavaScript, signed in as the member of `from`. */
async function withoutJavaScript(browser: Browser, from: BrowserContext) {
  const context = await browser.newContext({ javaScriptEnabled: false })
  await context.addCookies(await from.cookies())
  return context
}

test.describe('Glia Notes', () => {
  test('on needs the consent box, which is never ticked; off takes one press', async ({
    browser,
  }) => {
    // A Google member with an address Google manages: no email needed to make it.
    const { context, page, email } = await providerMember(browser, 'google')
    const address = email!
    const section = page.locator('#digest')
    const box = section.getByRole('checkbox', { name: 'I agree to receive Glia Notes by email.' })
    await expect(box).not.toBeChecked()
    await expect(
      section.getByRole('link', { name: 'Glia Notes consent text (in Turkish)' }),
    ).toHaveAttribute('href', '/tr/legal/acik-riza-metni/')
    await expect(section).toContainText(`When you switch it on, it goes to ${address}.`)

    // Without the box: refused, and the message says why.
    await section.getByRole('button', { name: 'Get Glia Notes' }).click()
    await expect(page).toHaveURL(endsWith('/en/account/?error=digest-consent#outcome'))
    await expect(outcome(page)).toBeFocused()
    await expect(outcome(page)).toHaveText(
      'Glia Notes is not on: tick the box to agree to receive it, then press Get Glia Notes again.',
    )
    await expect(box).not.toBeChecked()

    // With it: on.
    await box.check()
    await section.getByRole('button', { name: 'Get Glia Notes' }).click()
    await expect(page).toHaveURL(endsWith('/en/account/?done=digest-on#outcome'))
    await expect(outcome(page)).toHaveText('You have chosen to receive Glia Notes.')
    await expect(section).toContainText(`You have chosen to receive Glia Notes at ${address}.`)
    await expect(section.getByRole('checkbox')).toHaveCount(0)
    await expectNoSeriousAxeIssues(page)

    // Off: one press, no box.
    await section.getByRole('button', { name: 'Stop Glia Notes' }).click()
    await expect(page).toHaveURL(endsWith('/en/account/?done=digest-off#outcome'))
    await expect(outcome(page)).toHaveText('Glia Notes is stopped: you will not receive it.')
    await expect(box).not.toBeChecked()
    await context.close()
  })

  test('an account without an email address must add one first', async ({ page, baseURL }) => {
    await signInAs(page.context(), 'orcid', baseURL!)
    await page.goto('/en/account/')
    const section = page.locator('#digest')
    await expect(section).toContainText(
      'Glia Notes goes to the email address of your account, which has none yet. Add an email address first.',
    )
    await expect(section.getByRole('checkbox')).toHaveCount(0)
    await expect(section.getByRole('button')).toHaveCount(0)
    await expect(section.getByRole('link', { name: 'Add an email address first' })).toHaveAttribute(
      'href',
      '#email',
    )
    await expect(page.locator('#email')).toContainText('Your account has no email address.')
    // Asked for anyway (an old page, another tab): refused, nothing stored.
    const response = await page.request.post('/en/account/settings/', {
      form: { intent: 'digest', digest: 'on', consent: 'yes' },
      headers: { Origin: new URL(baseURL!).origin },
      maxRedirects: 0,
    })
    expect(response.status()).toBe(303)
    expect(response.headers()['location']).toBe('/en/account/?error=digest-needs-email#outcome')
  })
})

test.describe('preferred subfields (D35)', () => {
  test('apply to the jobs list without filters, with a notice, chips and ticked boxes', async ({
    page,
    browser,
    baseURL,
  }) => {
    // Signed out first: all positions.
    const visitor = await browser.newContext()
    const visitorPage = await visitor.newPage()
    await visitorPage.goto('/en/jobs/')
    const all = await listed(visitorPage)

    await signInAs(page.context(), 'email', baseURL!)
    await page.goto('/en/account/')
    await expect(subfieldBox(page, 'Glial biology')).toBeChecked()
    await expect(subfieldBox(page, 'Cognitive')).toBeChecked()
    await expect(subfieldBox(page, 'Motor systems')).not.toBeChecked()

    await page.goto('/en/jobs/')
    await expect(page).toHaveURL(endsWith('/en/jobs/'))
    await expect(notice(page)).toContainText(
      'Showing positions in your preferred subfields: Cognitive and Glial biology.',
    )
    await expect(notice(page).getByRole('link', { name: 'Show all positions' })).toHaveAttribute(
      'href',
      '/en/jobs/?prefs=off',
    )
    await expect(
      notice(page).getByRole('link', { name: 'Change preferred subfields' }),
    ).toHaveAttribute('href', '/en/account/#subfields')
    await expect(chip(page, 'Cognitive')).toBeVisible()
    await expect(chip(page, 'Glial biology')).toBeVisible()
    await expect(filterBox(page, 'subfield', 'glia')).toBeChecked()
    await expect(filterBox(page, 'subfield', 'cognitive')).toBeChecked()
    await expect(page.locator('.filter-sheet > summary')).toHaveText('Filters (2)')
    const preferred = await listed(page)
    expect(preferred.count).not.toBe(all.count)
    // The same list as the explicit filter.
    await visitorPage.goto('/en/jobs/?subfield=cognitive,glia')
    expect(await listed(visitorPage)).toEqual(preferred)
    // Its canonical page stays the list itself.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/en\/jobs\/$/)
    await expectNoSeriousAxeIssues(page)

    // "Show all positions": the address says so, and nothing is filtered.
    await notice(page).getByRole('link', { name: 'Show all positions' }).click()
    await expect(page).toHaveURL(endsWith('/en/jobs/?prefs=off'))
    await expect(notice(page)).toHaveCount(0)
    await expect(matches(page)).toHaveText(all.count)
    await expect(page.getByRole('link', { name: /^Remove filter/ })).toHaveCount(0)
    await expect(filterBox(page, 'subfield', 'glia')).not.toBeChecked()
    expect(await listed(page)).toEqual(all)
    await visitor.close()
  })

  test('"Clear all" and removing the last chip lead to all positions', async ({
    page,
    baseURL,
  }) => {
    await signInAs(page.context(), 'email', baseURL!)
    await page.goto('/en/jobs/')
    await expect(
      page.locator('.filter-status').getByRole('link', { name: 'Clear all' }),
    ).toHaveAttribute('href', '/en/jobs/?prefs=off')
    // The sheet's Clear all too.
    await expect(
      // Hidden from 1280px, where the filters are a bar: read from the markup.
      page.locator('.sheet-foot a[data-soft]'),
    ).toHaveAttribute('href', '/en/jobs/?prefs=off')
    await page.locator('.filter-status').getByRole('link', { name: 'Clear all' }).click()
    await expect(page).toHaveURL(endsWith('/en/jobs/?prefs=off'))
    await expect(notice(page)).toHaveCount(0)

    // The chips: one, then the other; the last one leads to all positions, not the default again.
    await page.goto('/en/jobs/')
    await chip(page, 'Cognitive').click()
    await expect(page).toHaveURL(endsWith('/en/jobs/?subfield=glia'))
    await expect(notice(page)).toHaveCount(0)
    await chip(page, 'Glial biology').click()
    await expect(page).toHaveURL(endsWith('/en/jobs/?prefs=off'))
    await expect(page.getByRole('link', { name: /^Remove filter/ })).toHaveCount(0)
  })

  test('unticking every box shows all positions, with and without JavaScript', async ({
    page,
    browser,
    baseURL,
  }) => {
    await signInAs(page.context(), 'email', baseURL!)
    await page.goto('/en/jobs/')
    await page.locator('summary.filter-button', { hasText: 'Subfield' }).click()
    await filterBox(page, 'subfield', 'cognitive').uncheck()
    await expect(page).toHaveURL(endsWith('/en/jobs/?subfield=glia'))
    await filterBox(page, 'subfield', 'glia').uncheck()
    await expect(page).toHaveURL(endsWith('/en/jobs/?prefs=off'))
    await expect(notice(page)).toHaveCount(0)

    const plain = await withoutJavaScript(browser, page.context())
    const noScript = await plain.newPage()
    await noScript.goto('/en/jobs/')
    await expect(notice(noScript)).toBeVisible()
    await noScript.locator('summary.filter-button', { hasText: 'Subfield' }).click()
    await filterBox(noScript, 'subfield', 'cognitive').uncheck()
    await filterBox(noScript, 'subfield', 'glia').uncheck()
    await noScript
      .locator('details[open] .filter-panel')
      .getByRole('button', { name: 'Apply' })
      .click()
    await expect(noScript).toHaveURL(endsWith('/en/jobs/?prefs=off'))
    await expect(notice(noScript)).toHaveCount(0)
    await plain.close()
  })

  test('leave shared links, the home page, the map, search and hubs as they are', async ({
    page,
    browser,
    baseURL,
  }) => {
    const visitor = await browser.newContext()
    const visitorPage = await visitor.newPage()
    await signInAs(page.context(), 'email', baseURL!)

    // A shared filtered list: the same positions, no notice.
    await visitorPage.goto('/en/jobs/?type=phd')
    await page.goto('/en/jobs/?type=phd')
    await expect(page).toHaveURL(endsWith('/en/jobs/?type=phd'))
    await expect(notice(page)).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^Remove filter/ })).toHaveCount(1)
    expect(await listed(page)).toEqual(await listed(visitorPage))
    // The home page's figures and lists, search and a subfield hub.
    for (const path of ['/en/', '/en/search/?q=neuro', '/en/subfields/motor/']) {
      await visitorPage.goto(path)
      await page.goto(path)
      expect(await page.locator('main').innerText(), path).toBe(
        await visitorPage.locator('main').innerText(),
      )
    }
    // The map's data on the map page: no subfield.
    const data = page.waitForRequest((request) => request.url().includes('/api/map/institutions'))
    await page.goto('/en/map/')
    expect(new URL((await data).url()).searchParams.has('subfield')).toBe(false)
    await visitor.close()
  })

  test('are chosen in the account, at most 12, and none shows all positions', async ({
    browser,
  }) => {
    const { context, page } = await providerMember(browser, 'google')
    await page.goto('/en/jobs/')
    await expect(notice(page)).toHaveCount(0)

    await page.goto('/en/account/')
    await subfieldBox(page, 'Motor systems').check()
    await subfieldBox(page, 'Sensory systems').check()
    await page.getByRole('button', { name: 'Save preferred subfields' }).click()
    await expect(page).toHaveURL(endsWith('/en/account/?done=subfields-saved#outcome'))
    await expect(outcome(page)).toBeFocused()
    await expect(subfieldBox(page, 'Motor systems')).toBeChecked()
    await page.goto('/en/jobs/')
    await expect(notice(page)).toContainText(
      'Showing positions in your preferred subfields: Motor systems and Sensory systems.',
    )

    // More than 12 ticked (possible without a script that stops it): refused, nothing changes.
    await page.goto('/en/account/')
    const boxes = page.locator('#subfields').getByRole('checkbox')
    for (let i = 0; i < 13; i++) await boxes.nth(i).check()
    await page.getByRole('button', { name: 'Save preferred subfields' }).click()
    await expect(page).toHaveURL(endsWith('/en/account/?error=subfields-too-many#outcome'))
    await expect(outcome(page)).toHaveText(
      'Choose at most 12 subfields. Your preferred subfields have not changed.',
    )
    await expect(page.locator('#subfields').getByRole('checkbox', { checked: true })).toHaveCount(2)

    // None: all positions again.
    for (const label of ['Motor systems', 'Sensory systems']) {
      await subfieldBox(page, label).uncheck()
    }
    await page.getByRole('button', { name: 'Save preferred subfields' }).click()
    await expect(page).toHaveURL(endsWith('/en/account/?done=subfields-removed#outcome'))
    await page.goto('/en/jobs/')
    await expect(notice(page)).toHaveCount(0)
    await context.close()
  })
})

test.describe('adding or changing the email address', () => {
  test('a link to the new address, used by the member who asked; other sessions end', async ({
    browser,
    baseURL,
  }) => {
    const member = await freshMember(browser)
    const page = member.page
    // A second browser of the same member.
    const second = await ownContext(browser)
    await signInByLink(await second.newPage(), member.address)

    // The account's own address needs no link.
    await page.goto('/en/account/')
    const field = page.getByRole('textbox', { name: 'New email address' })
    await field.fill(member.address.toUpperCase())
    await page.getByRole('button', { name: 'Email me a confirmation link' }).click()
    await expect(summary(page)).toBeFocused()
    await expect(summary(page)).toContainText('This is already the email address of your account.')

    const address = newAddress()
    await field.fill(address)
    await page.getByRole('button', { name: 'Email me a confirmation link' }).click()
    await expect(page).toHaveURL(endsWith('/en/account/email/sent/'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your inbox')
    const email = await latestEmailTo(address)
    expect(email.subject).toBe('Add this email address to a Gliagora account?')
    expect(email.text).toContain(
      'Someone signed in to a Gliagora account asked to add this address to that account.',
    )
    expect(email.text).not.toContain(member.address)
    const link = await signInLinkTo(address)

    // Opened by someone else: signed out, or as another member. Refused; the link stays usable.
    const stranger = await browser.newContext()
    const strangerPage = await stranger.newPage()
    await strangerPage.goto(link)
    await expect(strangerPage.getByRole('heading', { level: 1 })).toHaveText(
      'Sign in to the account that asked for this address',
    )
    // The document's title is the page's heading, in each state (WCAG 2.4.2).
    await expect(strangerPage).toHaveTitle(/^Sign in to the account that asked for this address/)
    await expect(strangerPage.getByRole('main')).not.toContainText(address)
    await expect(strangerPage.getByRole('button', { name: 'Add this address' })).toHaveCount(0)
    await expectNoSeriousAxeIssues(strangerPage)
    await signInAs(stranger, 'email', baseURL!)
    await strangerPage.goto(link)
    await expect(strangerPage.getByRole('main')).toContainText(
      'You are signed in to another account. Sign out first.',
    )
    await expect(strangerPage.getByRole('button', { name: 'Add this address' })).toHaveCount(0)
    // Posted anyway, with the link's token: nothing changes, and the link still works below.
    const token = new URL(link).searchParams.get('token')!
    const refused = await strangerPage.request.post('/en/sign-in/link/use/', {
      form: { token },
      headers: { Origin: new URL(baseURL!).origin },
      maxRedirects: 0,
    })
    expect(refused.headers()['location']).toBe('/en/account/?error=verify-expired#outcome')
    // Signed out, the button's route sends the browser back to the link's page.
    const signedOut = await browser.newContext()
    const outResponse = await signedOut.request.post('/en/sign-in/link/use/', {
      form: { token },
      headers: { Origin: new URL(baseURL!).origin },
      maxRedirects: 0,
    })
    expect(outResponse.headers()['location']).toBe(`/en/sign-in/link/?token=${token}`)
    await signedOut.close()
    await stranger.close()

    // The member who asked: the address, what it replaces, and the button.
    await page.goto(link)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Add this email address to your account',
    )
    await expect(page).toHaveTitle(/^Add this email address to your account/)
    await expect(page.getByRole('main')).toContainText(`Add ${address} to your Gliagora account.`)
    await expect(page.getByRole('main')).toContainText(`It replaces ${member.address}`)
    await expectNoSeriousAxeIssues(page)
    await page.getByRole('button', { name: 'Add this address' }).click()
    await expect(page).toHaveURL(endsWith('/en/account/?done=email-verified&others=ended#outcome'))
    await expect(outcome(page)).toBeFocused()
    await expect(outcome(page)).toHaveText(
      'The email address has been confirmed: it is now the address of your account. Other browsers where you were signed in have been signed out.',
    )
    await expect(page.getByRole('main')).toContainText(`You are signed in as ${address}.`)
    // The other browser was signed out; this one has a new session.
    expect(await isSignedIn(await second.newPage())).toBe(false)
    expect((await member.context.cookies()).some((c) => c.name === SESSION_COOKIE)).toBe(true)
    // Used once.
    await page.goto(link)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This link has expired')
    await expect(page).toHaveTitle(/^This link has expired/)
    await second.close()
    await member.context.close()
  })

  test('an address of another account is refused when the link is used, with the same email', async ({
    browser,
  }) => {
    const holder = await providerMember(browser, 'google')
    const member = await freshMember(browser)
    const page = member.page
    await page.goto('/en/account/')
    await page.getByRole('textbox', { name: 'New email address' }).fill(holder.email!)
    await page.getByRole('button', { name: 'Email me a confirmation link' }).click()
    await expect(page).toHaveURL(endsWith('/en/account/email/sent/'))
    // The same email as for a free address: nothing is told before the link is used.
    const email = await latestEmailTo(holder.email!)
    expect(email.subject).toBe('Add this email address to a Gliagora account?')
    await page.goto(await signInLinkTo(holder.email!))
    await page.getByRole('button', { name: 'Add this address' }).click()
    await expect(page).toHaveURL(endsWith('/en/account/?error=email-taken#outcome'))
    await expect(outcome(page)).toHaveText(
      'This address belongs to another Gliagora account, so it was not added. Sign in with it and delete that account first, if you want to add the address here.',
    )
    await expect(page.getByRole('main')).toContainText(`You are signed in as ${member.address}.`)
    expect(await isSignedIn(holder.page)).toBe(true)
    await holder.context.close()
    await member.context.close()
  })

  test('signed out meanwhile: the form says so, and sends nothing', async ({ browser }) => {
    needsMailpit()
    const { context, page } = await freshMember(browser)
    await page.goto('/en/account/')
    const address = newAddress()
    await page.getByRole('textbox', { name: 'New email address' }).fill(address)
    await context.clearCookies({ name: SESSION_COOKIE })
    await page.getByRole('button', { name: 'Email me a confirmation link' }).click()
    await expect(page).toHaveURL(endsWith('/en/sign-in/signed-out/'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('You are signed out')
    await context.close()
  })
})

test.describe('display name', () => {
  test('is saved, shown, and removed with an empty field', async ({ browser }) => {
    const { context, page } = await providerMember(browser, 'google')
    const field = page.getByRole('textbox', { name: 'Display name' })
    await field.fill('  Josiah   Carberry ')
    // By keyboard: the outcome message has focus after the redirect.
    await page.getByRole('button', { name: 'Save display name' }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(endsWith('/en/account/?done=name-saved#outcome'))
    await expect(outcome(page)).toBeFocused()
    await expect(page.getByRole('main')).toContainText('Your display name: Josiah Carberry')
    await expect(field).toHaveValue('Josiah Carberry')
    await field.fill('')
    await page.getByRole('button', { name: 'Save display name' }).click()
    await expect(page).toHaveURL(endsWith('/en/account/?done=name-removed#outcome'))
    await expect(page.getByRole('main')).not.toContainText('Your display name:')
    await context.close()
  })
})

test('the test member keeps its preferences: no test above changes them', async ({
  page,
  baseURL,
}) => {
  await signInAs(page.context(), 'email', baseURL!)
  await page.goto('/en/account/')
  await expect(page.getByRole('main')).toContainText(`You are signed in as ${E2E_MEMBER_EMAIL}.`)
  await expect(page.locator('#subfields').getByRole('checkbox', { checked: true })).toHaveCount(2)
})
