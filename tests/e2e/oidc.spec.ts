import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test'

import { expectNoSeriousAxeIssues } from './forms'
import {
  SESSION_COOKIE,
  SIGN_IN_COOKIE,
  answerAtProvider,
  freshMember,
  isSignedIn,
  needsFakeProviders,
  newAddress,
  newGoogleSub,
  newOrcidId,
  ownContext,
  providerMember,
  startAt,
  testIssuer,
} from './member'

// Signing in with Google and ORCID, linking and removing them (M4b, D49; the M4b design §7.2,
// §7.3), through the fake providers (tests/fake-oidc/server.ts), which the app uses where
// AUTH_TEST_ISSUER is set. Every row of the account rules is reached through the routes, with
// members of each test's own (a Google account ID or ORCID iD of its own, an example.org address)
// in contexts with their own client address. Desktop only: the flows do not depend on the device.
// The faults of the ID token are tested one by one in src/lib/members/oidc.test.ts; here each one
// ends on the sign-in page without a session.

test.skip(({ isMobile }) => isMobile, 'sign-in flows run on the desktop project')
test.beforeEach(() => needsFakeProviders())

/** The cookies of a context, by name. */
async function cookiesOf(context: BrowserContext) {
  return Object.fromEntries((await context.cookies()).map((cookie) => [cookie.name, cookie]))
}

/** The outcome message, which the redirect's `#outcome` focuses. */
const outcome = (page: Page) => page.locator('#outcome')

/** The outcome after a flow that took too long, or came back to the wrong tab or browser. */
const EXPIRED =
  'Signing in or linking took more than 15 minutes, or came back to another browser or an older tab, so nothing has changed. Please try again.'

/** Whether a session cookie's token still signs a browser in, tried in a new context. */
async function tokenSignsIn(browser: Browser, token: string, baseURL: string) {
  const context = await ownContext(browser)
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: token,
      domain: new URL(baseURL).hostname,
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  const signedIn = await isSignedIn(await context.newPage())
  await context.close()
  return signedIn
}

/** Navigates by a click on a link in the page, as the account page's links are followed. */
async function followLink(page: Page, href: string) {
  await page.evaluate((target) => {
    const link = document.createElement('a')
    link.href = target
    link.id = 'test-link'
    link.textContent = 'test'
    document.querySelector('main')!.append(link)
  }, href)
  await page.locator('#test-link').click()
}

test.describe('signing in with Google', () => {
  test('a new identity: nothing is made until "Create account", then it signs straight in', async ({
    browser,
    baseURL,
  }) => {
    const context = await ownContext(browser)
    const page = await context.newPage()
    const sub = newGoogleSub()
    const email = newAddress()

    await test.step('the start sets only the sealed sign-in cookie', async () => {
      await page.goto('/en/sign-in/')
      await page.getByRole('link', { name: 'Continue with Google' }).click()
      const cookies = await cookiesOf(context)
      expect(cookies[SIGN_IN_COOKIE]).toMatchObject({
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
        domain: new URL(baseURL!).hostname,
      })
      expect(cookies[SIGN_IN_COOKIE]!.value).toMatch(/^v1\./)
      expect(cookies[SESSION_COOKIE]).toBeUndefined()
    })

    await test.step('confirm page: the address Google manages, the terms and age line', async () => {
      await answerAtProvider(page, 'google', { fields: { sub, email, hd: 'example.org' } })
      await expect(page).toHaveURL(/\/en\/sign-in\/confirm\/$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Create your Gliagora account',
      )
      const main = page.getByRole('main')
      await expect(main).toContainText(
        `Your new account will use your Google account to sign in, with the address ${email}.`,
      )
      await expect(main).toContainText('confirm that you are 16 or older')
      // An address comes with this account: no hint about existing accounts, no note.
      await expect(main).not.toContainText('Already have a Gliagora account?')
      await expect(page.getByRole('note')).toHaveCount(0)
      await expect(page.getByRole('checkbox')).toHaveCount(0)
      expect((await cookiesOf(context))[SESSION_COOKIE]).toBeUndefined()
      await expectNoSeriousAxeIssues(page)
    })

    await test.step('Create account, by keyboard', async () => {
      await page.getByRole('button', { name: 'Create account' }).focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/en\/account\/\?done=created#outcome$/)
      await expect(outcome(page)).toBeFocused()
      await expect(outcome(page)).toHaveText(
        'Your account has been created, and you are signed in.',
      )
      await expect(page.getByRole('main')).toContainText(`You are signed in as ${email}.`)
      const cookies = await cookiesOf(context)
      expect(cookies[SIGN_IN_COOKIE]).toBeUndefined()
      expect(cookies[SESSION_COOKIE]).toMatchObject({ secure: true, httpOnly: true })
      // Google is linked; it can go, since the address is another way in.
      await expect(page.getByRole('button', { name: 'Remove Google' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Link your ORCID iD' })).toBeVisible()
      await expectNoSeriousAxeIssues(page)
    })

    await test.step('signed out, the same Google account signs straight in', async () => {
      await page
        .getByRole('navigation', { name: 'Your account' })
        .getByRole('button', { name: 'Sign out' })
        .click()
      await expect(page).toHaveURL(/\/en\/sign-in\/signed-out\/$/)
      await startAt(page, 'google', { fields: { sub, email: newAddress(), hd: 'example.org' } })
      // Signed in by the Google account ID: its address never changes on later sign-ins.
      await expect(page).toHaveURL(/\/en\/account\/\?done=signed-in#outcome$/)
      await expect(outcome(page)).toBeFocused()
      await expect(page.getByRole('main')).toContainText(`You are signed in as ${email}.`)
    })
    await context.close()
  })

  test('leads back to where sign-in started, and Cancel on the confirm page makes nothing', async ({
    browser,
  }) => {
    const context = await ownContext(browser)
    const page = await context.newPage()
    const sub = newGoogleSub()
    const fields = { sub, email: newAddress(), hd: 'example.org' }
    const next = '/en/jobs/?type=phd'
    await startAt(page, 'google', { fields }, `/en/sign-in/?next=${encodeURIComponent(next)}`)
    await expect(page).toHaveURL(/\/en\/sign-in\/confirm\/$/)
    await page.getByRole('link', { name: 'Cancel' }).click()
    await expect(page).toHaveURL(/\/en\/sign-in\/$/)
    expect(await isSignedIn(page)).toBe(false)

    // Nothing was made: the same identity is new again, and the account leads to `next`.
    await startAt(page, 'google', { fields }, `/en/sign-in/?next=${encodeURIComponent(next)}`)
    await expect(page).toHaveURL(/\/en\/sign-in\/confirm\/$/)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/en\/jobs\/\?type=phd$/)
    // And so does a later sign-in.
    await page.context().clearCookies({ name: SESSION_COOKIE })
    await startAt(page, 'google', { fields }, `/en/sign-in/?next=${encodeURIComponent(next)}`)
    await expect(page).toHaveURL(/\/en\/jobs\/\?type=phd$/)
    await context.close()
  })

  test('an address Google does not manage is neither stored nor matched', async ({ browser }) => {
    // An account made with an emailed link to this address.
    const owner = await freshMember(browser)
    const context = await ownContext(browser)
    const page = await context.newPage()
    await startAt(page, 'google', {
      fields: { sub: newGoogleSub(), email: owner.address, hd: '' },
    })
    // A new account, not the owner's: Google is not authoritative for an example.org address
    // without a Workspace domain.
    await expect(page).toHaveURL(/\/en\/sign-in\/confirm\/$/)
    await expect(page.getByRole('note')).toHaveText(
      `Google does not manage ${owner.address}, so it is not added to your account. You can add it in your account with a confirmation link.`,
    )
    const main = page.getByRole('main')
    await expect(main).toContainText(
      'Your new account will use your Google account to sign in. It will have no email address for now.',
    )
    await expect(main).toContainText(
      'Already have a Gliagora account? Sign in with it and link Google in your account instead.',
    )
    await expectNoSeriousAxeIssues(page)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/en\/account\/\?done=created#outcome$/)
    await expect(main).toContainText('You are signed in with your Google account.')
    await expect(main).toContainText('No email address')
    // The only way in: it cannot be removed.
    await expect(main).toContainText(
      'This is the only way into your account, so it cannot be removed.',
    )
    await expect(page.getByRole('button', { name: 'Remove Google' })).toHaveCount(0)
    // The owner's account did not change and is still signed in.
    expect(await isSignedIn(owner.page)).toBe(true)
    await expect(owner.page.getByRole('main')).toContainText('Google')
    await expect(owner.page.getByRole('link', { name: 'Link your Google account' })).toBeVisible()
    await owner.context.close()
    await context.close()
  })

  test('an address Google has not verified is not taken either', async ({ browser }) => {
    const context = await ownContext(browser)
    const page = await context.newPage()
    const email = newAddress()
    await startAt(page, 'google', {
      fields: { sub: newGoogleSub(), email, hd: 'example.org' },
      fault: 'unverified-email',
    })
    await expect(page).toHaveURL(/\/en\/sign-in\/confirm\/$/)
    await expect(page.getByRole('note')).toHaveText(
      `Google has not verified ${email}, so it is not added to your account. You can add it in your account with a confirmation link.`,
    )
    await context.close()
  })

  test("the authoritative address of an email-link account signs in to it, links Google and ends the account's other sessions", async ({
    browser,
  }) => {
    const owner = await freshMember(browser)
    const context = await ownContext(browser)
    const page = await context.newPage()
    await startAt(page, 'google', {
      fields: { sub: newGoogleSub(), email: owner.address, hd: 'example.org' },
    })
    // No "Create account": the account with this address is signed in to, and it says that Google
    // is now a way in (which is why the other browsers were signed out).
    await expect(page).toHaveURL(
      /\/en\/account\/\?done=signed-in-linked-google&others=ended#outcome$/,
    )
    await expect(outcome(page)).toBeFocused()
    await expect(outcome(page)).toHaveText(
      'You are signed in. Your Google account has been linked to your account, which has the same email address, so you can now sign in with it. Other browsers where you were signed in have been signed out.',
    )
    await expect(page.getByRole('main')).toContainText(`You are signed in as ${owner.address}.`)
    await expect(page.getByRole('button', { name: 'Remove Google' })).toBeVisible()
    // The session made with the emailed link ended.
    expect(await isSignedIn(owner.page)).toBe(false)
    await owner.context.close()
    await context.close()
  })

  test('an address whose account has another Google account is refused', async ({ browser }) => {
    const first = await providerMember(browser, 'google')
    const context = await ownContext(browser)
    const page = await context.newPage()
    await startAt(page, 'google', {
      fields: { sub: newGoogleSub(), email: first.email!, hd: 'example.org' },
    })
    await expect(page).toHaveURL(/\/en\/sign-in\/\?error=email-has-other-google#outcome$/)
    await expect(outcome(page)).toBeFocused()
    await expect(outcome(page)).toHaveAttribute('role', 'alert')
    await expect(outcome(page)).toHaveText(
      'This address belongs to a Gliagora account that is linked to another Google account. Sign in to that account with an email link, or with its own Google account.',
    )
    expect((await cookiesOf(context))[SESSION_COOKIE]).toBeUndefined()
    expect((await cookiesOf(context))[SIGN_IN_COOKIE]).toBeUndefined()
    await first.context.close()
    await context.close()
  })

  test('an account made with the address meanwhile gets Google at "Create account"', async ({
    browser,
  }) => {
    const context = await ownContext(browser)
    const page = await context.newPage()
    const address = newAddress()
    await startAt(page, 'google', {
      fields: { sub: newGoogleSub(), email: address, hd: 'example.org' },
    })
    await expect(page).toHaveURL(/\/en\/sign-in\/confirm\/$/)
    // Before the button is pressed, someone makes an account with an emailed link to the address.
    const owner = await freshMember(browser, address)
    await page.getByRole('button', { name: 'Create account' }).click()
    // The identity is checked again: that account is signed in to, with Google added.
    await expect(page).toHaveURL(
      /\/en\/account\/\?done=signed-in-linked-google&others=ended#outcome$/,
    )
    await expect(page.getByRole('main')).toContainText(`You are signed in as ${address}.`)
    await expect(page.getByRole('button', { name: 'Remove Google' })).toBeVisible()
    expect(await isSignedIn(owner.page)).toBe(false)
    await owner.context.close()
    await context.close()
  })
})

test.describe('signing in with ORCID', () => {
  test('the record name is kept only if the box is ticked', async ({ browser }) => {
    const context = await ownContext(browser)
    const page = await context.newPage()
    const orcid = newOrcidId()
    await startAt(page, 'orcid', {
      fields: { sub: orcid, given_name: 'Ayşe', family_name: 'Yılmaz', name: '' },
    })
    await expect(page).toHaveURL(/\/en\/sign-in\/confirm\/$/)
    const main = page.getByRole('main')
    await expect(main).toContainText(
      `Your new account will use your ORCID iD ${orcid} to sign in. It will have no email address for now.`,
    )
    await expect(main).toContainText(
      'Already have a Gliagora account? Sign in with it and link ORCID in your account instead.',
    )
    const box = page.getByRole('checkbox', {
      name: 'Use the name on my ORCID record, Ayşe Yılmaz, as my display name',
    })
    await expect(box).not.toBeChecked()
    await expectNoSeriousAxeIssues(page)
    // By keyboard: tick the box, then on to the button.
    await box.focus()
    await page.keyboard.press('Space')
    await expect(box).toBeChecked()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'terms of use', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Create account' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/en\/account\/\?done=created#outcome$/)
    await expect(main).toContainText(`You are signed in with the ORCID iD ${orcid}.`)
    await expect(main).toContainText('Your display name: Ayşe Yılmaz')
    await context.close()
  })

  test('without the box, no name; and the iD signs straight in later', async ({ browser }) => {
    const member = await providerMember(browser, 'orcid')
    const main = member.page.getByRole('main')
    await expect(main).toContainText(`You are signed in with the ORCID iD ${member.sub}.`)
    await expect(main).not.toContainText('Your display name')
    await member.context.clearCookies({ name: SESSION_COOKIE })
    await startAt(member.page, 'orcid', { fields: { sub: member.sub } })
    await expect(member.page).toHaveURL(/\/en\/account\/\?done=signed-in#outcome$/)
    await member.context.close()
  })
})

test.describe('answers that sign nobody in', () => {
  for (const provider of ['google', 'orcid'] as const) {
    test(`${provider}: every fault in the ID token ends on the sign-in page with a reference`, async ({
      browser,
    }) => {
      const context = await ownContext(browser)
      const page = await context.newPage()
      for (const fault of [
        'wrong-nonce',
        'no-nonce',
        'wrong-aud',
        'wrong-iss',
        'expired',
        'bad-signature',
      ]) {
        await startAt(page, provider, { fault })
        await expect(page, fault).toHaveURL(
          /\/en\/sign-in\/\?error=failed&ref=[0-9A-F]{10}#outcome$/,
        )
        await expect(outcome(page)).toBeFocused()
        await expect(outcome(page)).toContainText('mention reference')
        const cookies = await cookiesOf(context)
        expect(cookies[SESSION_COOKIE], fault).toBeUndefined()
        expect(cookies[SIGN_IN_COOKIE], fault).toBeUndefined()
      }
      await context.close()
    })

    test(`${provider}: Deny at the provider is "cancelled"`, async ({ browser }) => {
      const context = await ownContext(browser)
      const page = await context.newPage()
      await startAt(page, provider, { decision: 'deny' }, '/en/sign-in/?next=%2Fen%2Fjobs%2F')
      // Where the person was going is kept, for trying again.
      await expect(page).toHaveURL(
        new RegExp(`/en/sign-in/\\?next=%2Fen%2Fjobs%2F&error=cancelled-${provider}#outcome$`),
      )
      await expect(outcome(page)).toBeFocused()
      await expect(outcome(page)).toHaveText(
        `You cancelled on the ${provider === 'google' ? 'Google' : 'ORCID'} page, so nothing has changed.`,
      )
      expect((await cookiesOf(context))[SESSION_COOKIE]).toBeUndefined()
      expect((await cookiesOf(context))[SIGN_IN_COOKIE]).toBeUndefined()
      await context.close()
    })
  }

  test('a missing or changed sign-in cookie has expired', async ({ browser, baseURL }) => {
    const context = await ownContext(browser)
    const page = await context.newPage()
    const expired = EXPIRED

    await page.goto('/en/sign-in/')
    await page.getByRole('link', { name: 'Continue with Google' }).click()
    await context.clearCookies({ name: SIGN_IN_COOKIE })
    await answerAtProvider(page, 'google')
    await expect(page).toHaveURL(/\/en\/sign-in\/\?error=expired#outcome$/)
    await expect(outcome(page)).toHaveText(expired)

    await page.goto('/en/sign-in/')
    await page.getByRole('link', { name: 'Continue with ORCID' }).click()
    const sealed = (await cookiesOf(context))[SIGN_IN_COOKIE]!
    const chars = [...sealed.value]
    chars[10] = chars[10] === 'A' ? 'B' : 'A'
    await context.clearCookies({ name: SIGN_IN_COOKIE })
    await context.addCookies([
      {
        name: SIGN_IN_COOKIE,
        value: chars.join(''),
        domain: new URL(baseURL!).hostname,
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ])
    await answerAtProvider(page, 'orcid')
    await expect(page).toHaveURL(/\/en\/sign-in\/\?error=expired#outcome$/)
    await expect(outcome(page)).toHaveText(expired)
    expect((await cookiesOf(context))[SESSION_COOKIE]).toBeUndefined()

    // A callback address opened as it is: the cookie it needs is not there.
    await page.goto('/en/sign-in/google/callback/?code=x&state=y')
    await expect(page).toHaveURL(/\/en\/sign-in\/\?error=expired#outcome$/)
    await context.close()
  })
})

test.describe('linking and removing sign-in methods', () => {
  test('link ORCID, then remove it: each change ends the other sessions', async ({ browser }) => {
    const member = await providerMember(browser, 'google')
    // A second browser signed in to the same account.
    const second = await ownContext(browser)
    const other = await second.newPage()
    await startAt(other, 'google', { fields: { sub: member.sub!, email: member.email! } })
    await expect(other).toHaveURL(/\/en\/account\/\?done=signed-in#outcome$/)

    const page = member.page
    const orcid = newOrcidId()
    await page.goto('/en/account/')
    await page.getByRole('link', { name: 'Link your ORCID iD' }).click()
    await answerAtProvider(page, 'orcid', { fields: { sub: orcid } })
    await expect(page).toHaveURL(/\/en\/account\/\?done=linked-orcid&others=ended#outcome$/)
    await expect(outcome(page)).toBeFocused()
    await expect(outcome(page)).toHaveText(
      'Your ORCID iD has been linked: you can now sign in with it. Other browsers where you were signed in have been signed out.',
    )
    await expect(page.getByRole('main')).toContainText(orcid)
    expect(await isSignedIn(other)).toBe(false)
    await expectNoSeriousAxeIssues(page)

    // The new way in works, in the other browser too.
    await startAt(other, 'orcid', { fields: { sub: orcid } })
    await expect(other).toHaveURL(/\/en\/account\/\?done=signed-in#outcome$/)
    await expect(other.getByRole('main')).toContainText(`You are signed in as ${member.email}.`)

    await page.goto('/en/account/')
    await page.getByRole('button', { name: 'Remove ORCID' }).click()
    await expect(page).toHaveURL(/\/en\/account\/\?done=unlinked-orcid&others=ended#outcome$/)
    await expect(outcome(page)).toBeFocused()
    await expect(page.getByRole('link', { name: 'Link your ORCID iD' })).toBeVisible()
    // Still signed in here, with a new session; signed out there.
    expect(await isSignedIn(page)).toBe(true)
    expect(await isSignedIn(other)).toBe(false)
    // The iD signs nobody in any more: it is new again.
    await other.context().clearCookies()
    await startAt(other, 'orcid', { fields: { sub: orcid } })
    await expect(other).toHaveURL(/\/en\/sign-in\/confirm\/$/)
    await member.context.close()
    await second.close()
  })

  test('an ORCID-only account takes Google with its address, unless another account has it', async ({
    browser,
  }) => {
    const taken = await providerMember(browser, 'google')
    for (const [email, expected] of [
      [newAddress(), 'address'],
      [taken.email!, 'none'],
    ] as const) {
      const member = await providerMember(browser, 'orcid')
      const page = member.page
      await page.getByRole('link', { name: 'Link your Google account' }).click()
      await answerAtProvider(page, 'google', {
        fields: { sub: newGoogleSub(), email, hd: 'example.org' },
      })
      await expect(page).toHaveURL(/\/en\/account\/\?done=linked-google#outcome$/)
      await expect(outcome(page)).toHaveText(
        'Your Google account has been linked: you can now sign in with it.',
      )
      const main = page.getByRole('main')
      if (expected === 'address') {
        await expect(main).toContainText(`You are signed in as ${email}.`)
      } else {
        await expect(main).toContainText(`You are signed in with the ORCID iD ${member.sub}.`)
        await expect(main).toContainText('No email address')
      }
      // Two ways in now: either can go.
      await expect(page.getByRole('button', { name: 'Remove Google' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Remove ORCID' })).toBeVisible()
      await member.context.close()
    }
    await taken.context.close()
  })

  test('a method that belongs to another account, or a second one, is refused', async ({
    browser,
  }) => {
    const googleOwner = await providerMember(browser, 'google')
    const orcidOwner = await providerMember(browser, 'orcid')
    const member = await providerMember(browser, 'orcid')
    const page = member.page

    await test.step('another account has this Google account', async () => {
      await page.getByRole('link', { name: 'Link your Google account' }).click()
      await answerAtProvider(page, 'google', {
        fields: { sub: googleOwner.sub!, email: newAddress(), hd: 'example.org' },
      })
      await expect(page).toHaveURL(/\/en\/account\/\?error=google-elsewhere#outcome$/)
      await expect(outcome(page)).toBeFocused()
      await expect(outcome(page)).toHaveText(
        'This Google account is used by another Gliagora account. Sign in with it and delete that account first, if you want to link it here.',
      )
    })

    await test.step('the account has an iD already; another account has this one', async () => {
      // The page offers no Link while an iD is linked; the route refuses one anyway.
      await followLink(page, '/en/sign-in/orcid/?link=1')
      await answerAtProvider(page, 'orcid', { fields: { sub: orcidOwner.sub! } })
      await expect(page).toHaveURL(/\/en\/account\/\?error=orcid-already-linked#outcome$/)
      await expect(outcome(page)).toHaveText(
        'Your account already has another ORCID iD. Remove it first, then link this one.',
      )
    })

    await test.step('an account without an iD, and an iD on another account', async () => {
      const google = await providerMember(browser, 'google')
      await google.page.getByRole('link', { name: 'Link your ORCID iD' }).click()
      await answerAtProvider(google.page, 'orcid', { fields: { sub: orcidOwner.sub! } })
      await expect(google.page).toHaveURL(/\/en\/account\/\?error=orcid-elsewhere#outcome$/)
      await expect(outcome(google.page)).toHaveText(
        'This ORCID iD is used by another Gliagora account. Sign in with it and delete that account first, if you want to link it here.',
      )
      await google.context.close()
    })

    // Nothing moved: each account still signs in with its own.
    expect(await isSignedIn(googleOwner.page)).toBe(true)
    expect(await isSignedIn(orcidOwner.page)).toBe(true)
    await googleOwner.context.close()
    await orcidOwner.context.close()
    await member.context.close()
  })

  test('the last way in cannot be removed', async ({ browser, baseURL }) => {
    const member = await providerMember(browser, 'orcid')
    const page = member.page
    await expect(page.getByRole('main')).toContainText(
      'This is the only way into your account, so it cannot be removed.',
    )
    await expect(page.getByRole('button', { name: 'Remove ORCID' })).toHaveCount(0)
    // Posted anyway (another tab, an old page): refused in SQL too.
    const response = await page.request.post('/en/account/settings/', {
      form: { intent: 'unlink-orcid' },
      headers: { Origin: new URL(baseURL!).origin },
      maxRedirects: 0,
    })
    expect(response.status()).toBe(303)
    expect(response.headers()['location']).toBe('/en/account/?error=last-method#outcome')
    await page.goto('/en/account/?error=last-method#outcome')
    await expect(outcome(page)).toHaveText(
      'This is the only way into your account, so it cannot be removed. Add another way to sign in first.',
    )
    // Removing a method the account does not have changes nothing.
    const google = await page.request.post('/en/account/settings/', {
      form: { intent: 'unlink-google' },
      headers: { Origin: new URL(baseURL!).origin },
      maxRedirects: 0,
    })
    expect(google.headers()['location']).toBe('/en/account/?done=unlinked-google#outcome')
    expect(await isSignedIn(page)).toBe(true)
    await member.context.close()
  })

  test('linking starts only from the site, while signed in; a sign-out meanwhile ends it', async ({
    browser,
  }) => {
    const member = await providerMember(browser, 'google')
    const page = member.page

    // Typed into the address bar (or linked from another site, or in a browser that does not say
    // where a request comes from): not started, and the account page says so.
    await page.goto('/en/sign-in/orcid/?link=1')
    await expect(page).toHaveURL(/\/en\/account\/\?error=link-not-started#outcome$/)
    await expect(outcome(page)).toBeFocused()
    await expect(outcome(page)).toHaveText(
      'Linking could not start. Press the Link button on this page again. If this keeps happening, update your browser.',
    )
    expect((await cookiesOf(member.context))[SIGN_IN_COOKIE]).toBeUndefined()
    // The same without any Sec-Fetch-Site (Playwright's API requests send none), as such a
    // browser sends it.
    const bare = await page.request.get('/en/sign-in/google/?link=1', { maxRedirects: 0 })
    expect(bare.status()).toBe(303)
    expect(bare.headers()['location']).toBe('/en/account/?error=link-not-started#outcome')

    // Started here, then signed out before the provider answered: nothing is linked.
    await page.goto('/en/account/')
    await page.getByRole('link', { name: 'Link your ORCID iD' }).click()
    await member.context.clearCookies({ name: SESSION_COOKIE })
    const orcid = newOrcidId()
    await answerAtProvider(page, 'orcid', { fields: { sub: orcid } })
    await expect(page).toHaveURL(/\/en\/account\/\?error=link-interrupted#outcome$/)
    await expect(outcome(page)).toHaveText(
      'Nothing was linked: you were signed out, or signed in to another account, before linking finished. Please try again.',
    )
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to see your account')
    await member.context.close()
  })

  test('a link flow ends only in the session of the member who started it', async ({ browser }) => {
    const a = await providerMember(browser, 'google')
    const b = await providerMember(browser, 'google')
    await a.page.goto('/en/account/')
    await a.page.getByRole('link', { name: 'Link your ORCID iD' }).click()
    // Before the provider answers, this browser is signed in to another account.
    const bSession = (await cookiesOf(b.context))[SESSION_COOKIE]!
    await a.context.clearCookies({ name: SESSION_COOKIE })
    await a.context.addCookies([bSession])
    const orcid = newOrcidId()
    await answerAtProvider(a.page, 'orcid', { fields: { sub: orcid } })
    await expect(a.page).toHaveURL(/\/en\/account\/\?error=link-interrupted#outcome$/)
    await expect(outcome(a.page)).toBeFocused()

    // Nothing moved: B's session is as it was (nothing rotated or ended), and neither account
    // has the iD, which is still new.
    expect(await isSignedIn(b.page)).toBe(true)
    await expect(b.page.getByRole('link', { name: 'Link your ORCID iD' })).toBeVisible()
    const again = await ownContext(browser)
    const page = await again.newPage()
    await startAt(page, 'google', { fields: { sub: a.sub!, email: a.email!, hd: 'example.org' } })
    await expect(page).toHaveURL(/\/en\/account\/\?done=signed-in#outcome$/)
    await expect(page.getByRole('link', { name: 'Link your ORCID iD' })).toBeVisible()
    await page.context().clearCookies()
    await startAt(page, 'orcid', { fields: { sub: orcid } })
    await expect(page).toHaveURL(/\/en\/sign-in\/confirm\/$/)
    await again.close()
    await a.context.close()
    await b.context.close()
  })

  test('a link flow cancelled after "Sign out everywhere" says it was cancelled', async ({
    browser,
  }) => {
    const member = await providerMember(browser, 'google')
    const page = member.page
    await page.goto('/en/account/')
    await page.getByRole('link', { name: 'Link your ORCID iD' }).click()
    // In another browser, the member signs out everywhere: this one keeps its cookies.
    const second = await ownContext(browser)
    const other = await second.newPage()
    await startAt(other, 'google', {
      fields: { sub: member.sub!, email: member.email!, hd: 'example.org' },
    })
    await other.getByRole('button', { name: 'Sign out everywhere' }).click()
    await answerAtProvider(page, 'orcid', { decision: 'deny' })
    await expect(page).toHaveURL(/\/en\/account\/\?error=cancelled-orcid#outcome$/)
    await expect(outcome(page)).toBeFocused()
    await expect(outcome(page)).toHaveText(
      'You cancelled on the ORCID page, so nothing has changed.',
    )
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to see your account')
    await second.close()
    await member.context.close()
  })

  test('a link flow that outlived its cookie ends on the account page, unchanged', async ({
    browser,
  }) => {
    const member = await providerMember(browser, 'google')
    const page = member.page
    await page.goto('/en/account/')
    const session = (await cookiesOf(member.context))[SESSION_COOKIE]!.value
    await page.getByRole('link', { name: 'Link your ORCID iD' }).click()
    // More than 15 minutes at the provider, or another flow started in another tab.
    await member.context.clearCookies({ name: SIGN_IN_COOKIE })
    await answerAtProvider(page, 'orcid', { fields: { sub: newOrcidId() } })
    await expect(page).toHaveURL(/\/en\/account\/\?error=expired#outcome$/)
    await expect(outcome(page)).toBeFocused()
    await expect(outcome(page)).toHaveText(EXPIRED)
    await expect(page.getByRole('link', { name: 'Link your ORCID iD' })).toBeVisible()
    expect((await cookiesOf(member.context))[SESSION_COOKIE]!.value).toBe(session)
    await member.context.close()
  })

  test('signing in with another method while signed in switches accounts', async ({
    browser,
    baseURL,
  }) => {
    const first = await providerMember(browser, 'google')
    const second = await providerMember(browser, 'orcid')
    const page = first.page
    const firstToken = (await cookiesOf(first.context))[SESSION_COOKIE]!.value
    expect(await tokenSignsIn(browser, firstToken, baseURL!)).toBe(true)
    // Not offered on the pages (they say "You are signed in"), but the route allows it.
    await page.goto('/en/sign-in/orcid/')
    await answerAtProvider(page, 'orcid', { fields: { sub: second.sub! } })
    await expect(page).toHaveURL(/\/en\/account\/\?done=signed-in#outcome$/)
    await expect(page.getByRole('main')).toContainText(`ORCID iD ${second.sub}`)
    // The first account's session in this browser ended with the switch.
    expect(await tokenSignsIn(browser, firstToken, baseURL!)).toBe(false)
    await first.context.close()
    await second.context.close()
  })

  test('creating an account while signed in ends the session this browser had', async ({
    browser,
    baseURL,
  }) => {
    const first = await providerMember(browser, 'google')
    const page = first.page
    const firstToken = (await cookiesOf(first.context))[SESSION_COOKIE]!.value
    await page.goto('/en/sign-in/orcid/')
    await answerAtProvider(page, 'orcid', { fields: { sub: newOrcidId() } })
    await expect(page).toHaveURL(/\/en\/sign-in\/confirm\/$/)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/en\/account\/\?done=created#outcome$/)
    expect(await tokenSignsIn(browser, firstToken, baseURL!)).toBe(false)
    await first.context.close()
  })
})

test.describe('provider routes', () => {
  test('refuse posts from other sites, and answer a plain visit with the right page', async ({
    request,
    baseURL,
  }) => {
    const own = new URL(baseURL!).origin
    for (const path of ['/en/sign-in/create/', '/en/account/settings/']) {
      for (const headers of <Record<string, string>[]>[
        { Origin: 'https://example.org' },
        { Origin: 'null' },
        { Origin: own, 'Sec-Fetch-Site': 'cross-site' },
        {},
      ]) {
        const response = await request.post(path, {
          form: { intent: 'unlink-google', 'use-name': 'yes' },
          headers,
          maxRedirects: 0,
        })
        expect(response.status(), `${path} ${JSON.stringify(headers)}`).toBe(403)
      }
    }
    for (const [path, location] of [
      ['/en/sign-in/create/', '/en/sign-in/'],
      ['/en/account/settings/', '/en/account/'],
    ]) {
      const response = await request.get(path!, { maxRedirects: 0 })
      expect(response.status(), path).toBe(303)
      expect(response.headers()['location'], path).toBe(location)
    }
    // "Create account" without the sealed identity: expired.
    const create = await request.post('/en/sign-in/create/', {
      headers: { Origin: own },
      maxRedirects: 0,
    })
    expect(create.headers()['location']).toBe('/en/sign-in/?error=expired#outcome')
  })

  test('the start goes to the provider with state, nonce and, for Google only, PKCE', async ({
    request,
  }) => {
    for (const provider of ['google', 'orcid'] as const) {
      const response = await request.get(`/en/sign-in/${provider}/?next=%2Fen%2Fjobs%2F`, {
        maxRedirects: 0,
      })
      expect(response.status()).toBe(303)
      const target = new URL(response.headers()['location']!)
      expect(`${target.origin}${target.pathname}`).toBe(`${testIssuer}/${provider}/authorize`)
      const query = target.searchParams
      expect(query.get('redirect_uri')).toMatch(
        new RegExp(`^https?://[^/]+/en/sign-in/${provider}/callback/$`),
      )
      expect(query.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(query.get('nonce')).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(query.has('code_challenge')).toBe(provider === 'google')
      expect(query.has('login_hint')).toBe(false)
      // Nothing about where the person was going goes to the provider.
      expect(target.search).not.toContain('jobs')
      expect(response.headers()['cache-control']).toBe('no-store')
    }
  })

  test('the confirm page without a pending identity says it has expired', async ({ page }) => {
    await page.goto('/en/sign-in/confirm/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This sign-in has expired')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expectNoSeriousAxeIssues(page)
  })
})
