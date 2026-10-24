import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingHttpHeaders } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { tmpdir } from 'node:os'
import path from 'node:path'

import AxeBuilder from '@axe-core/playwright'
import {
  type APIRequestContext,
  type Page,
  expect,
  request as requests,
  test,
} from '@playwright/test'

import { NEWSLETTER_PATHS } from '../../src/lib/newsletter/paths'
import {
  type IsDraft,
  PUBLIC_MARK,
  indexedPublicPages,
  isPublicAddress,
  publicGetPaths,
  publicMachineFiles,
  publicPages,
  publicPostPaths,
} from '../../src/lib/public-pages'
import { isDisallowed, robotsRules } from '../../src/lib/seo/robots'
import { heroFiles } from '../../src/scripts/caddy-public-file'
import { siteStageSetting } from '../../src/lib/site-stage'
import { NOT_STAGES, TEST_AUTH, adaptedFiles, testCaddies } from '../caddy/serve'
import { TEXT_200, TEXT_SPACING, sidewaysScroll } from './layout'
import { needsListmonk, subscribersWith } from './listmonk'
import { emailHeaders, latestEmailTo } from './mailpit'
import { needsMailpit } from './member'
import { expectLayoutHolds, layoutProblems } from './pseudo-locale'

// The M2 state (D41, D50) as visitors meet it: the production Caddyfile (tests/caddy/serve.ts) in
// front of an app started with SITE_STAGE=m2, and, for the private stage, in front of the app
// under test (playwright.config.ts, project `m2`). Without the test password every public page
// answers in its M2 version, with the reduced header and footer, and loads and links only public
// addresses; everything else asks for the password, also another spelling of a public address. A
// third Caddy opens every text, as a copy of the list that is ahead of the running image would
// (a rollback past an approval): what the image does not hold public answers a plain 404. The
// pages come from src/lib/public-pages.ts with the approvals of src/lib/content.ts, so a text the
// operator approves is tested here too once its draft flag changes. The reduced shell's templates
// and states (its phone menu, longer texts, text at 200%) are tested here, the only project that
// sees them; they load the same scripts as the full site's pages, whose sizes budgets.spec.ts
// measures.

const caddies = testCaddies(process.env, process.env.BASE_URL ?? 'http://localhost:3000')

test.skip(
  !caddies && !process.env.CI,
  'needs CADDY_BIN and M2_APP_URL (an app with SITE_STAGE=m2): see playwright.config.ts',
)
test.beforeAll(async () => {
  expect(caddies, 'CADDY_BIN and M2_APP_URL').toBeTruthy()
  // The Caddies start without it (playwright.config.ts): say clearly what is missing.
  const health = await fetch(new URL('/health/', process.env.M2_APP_URL)).catch(() => null)
  expect(
    health?.ok,
    `start the second app with SITE_STAGE=m2 at M2_APP_URL (${process.env.M2_APP_URL})`,
  ).toBe(true)
})

type RawResponse = { status: number; headers: IncomingHttpHeaders; body: string }

/**
 * A request to a Caddy of the tests with its path exactly as written: a URL parser would clean
 * `..` and `//`, which Caddy's own path matcher also does, but the app does not.
 */
function raw(
  base: string,
  pathname: string,
  { method = 'GET', headers = {} }: { method?: string; headers?: Record<string, string> } = {},
): Promise<RawResponse> {
  const url = new URL(base)
  return new Promise((resolve, reject) => {
    const sent = httpsRequest(
      {
        host: '127.0.0.1',
        servername: url.hostname,
        port: url.port,
        path: pathname,
        method,
        headers: { host: url.host, ...headers },
        // Caddy's own local certificate authority.
        rejectUnauthorized: false,
      },
      (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => (body += chunk))
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, headers: response.headers, body }),
        )
      },
    )
    sent.on('error', reject)
    sent.end()
  })
}

/** Caddy's answer to an app's 404 or 410, and to an answer the app did not mark as public. */
const PLAIN_NOT_FOUND = 'Not Found'

/** The public pages with an M2 version (not the redirect of `/` or a route behind a button). */
const PAGES = publicPages()
  .filter((page) => page.kind === 'page')
  .map((page) => page.path)

/**
 * The Glia Notes signup, which the reduced header and the coming-soon page offer only while it is
 * public: with the açık rıza metni, whose consent it records (src/lib/m2-links.ts, D50).
 */
const SIGNUP_PUBLIC = isPublicAddress(NEWSLETTER_PATHS.signup)

/** Addresses that stay behind the password in the M2 state, of every kind. */
const ALL_APPROVED: IsDraft = () => false
const NOT_APPROVED = publicGetPaths(ALL_APPROVED).filter((path) => !isPublicAddress(path))
const PRIVATE = [
  '/en/jobs/',
  '/en/jobs/?type=phd',
  '/en/jobs/feed.xml',
  '/en/map/',
  '/en/suggest/',
  '/en/report/',
  '/en/search/?q=glia',
  '/en/account/',
  '/en/sign-in/',
  '/en/events/',
  '/en/learn/',
  '/en/subfields/',
  '/en/about/x/',
  '/en/gone-example/',
  '/this-page-does-not-exist/',
  '/sitemaps/jobs.xml',
  '/api/map/institutions/',
  '/api/users/me',
  '/admin',
  '/admin/',
  '/basemap/current.json',
  '/m2/en/',
  '/m2/en/about/',
  ...NOT_APPROVED,
]

/** A request context without the password, at a Caddy of the tests. */
const without = (baseURL: string) => requests.newContext({ baseURL, ignoreHTTPSErrors: true })

/**
 * Every response the page loads while it opens: they must all come from this site, be public
 * addresses and succeed (a 401 would ask the visitor for the password).
 */
function watchLoads(page: Page, origin: string) {
  const loads: { url: string; status: number }[] = []
  const errors: string[] = []
  page.on('response', (response) => loads.push({ url: response.url(), status: response.status() }))
  page.on('requestfailed', (request) => loads.push({ url: request.url(), status: 0 }))
  // A hydration mismatch, among others: React reports it as an error in the console.
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  return {
    errors,
    problems: () =>
      loads.flatMap(({ url, status }) => {
        const address = new URL(url)
        if (address.protocol === 'data:') return []
        if (address.origin !== origin) return [`${url}: another origin`]
        if (!isPublicAddress(address.pathname)) return [`${url}: not a public address`]
        // The first page's own 308 (no slash) is fine; anything else must succeed.
        return status >= 200 && status < 400 ? [] : [`${url}: ${status}`]
      }),
  }
}

test.describe('the M2 state through Caddy, without the password', () => {
  for (const path of PAGES) {
    test(`${path}: answers in the reduced shell, loading public addresses only`, async ({
      page,
      baseURL,
    }) => {
      const watch = watchLoads(page, new URL(baseURL!).origin)
      const response = await page.goto(path, { waitUntil: 'networkidle' })
      expect(response?.status()).toBe(200)
      await expect(page.locator('html[data-js]')).toBeAttached()
      // The reduced header and footer (D41 (4)): no windows, search or Account.
      const header = page.locator('header.site-header')
      await expect(header).toHaveClass(/\bsite-header-m2\b/)
      await expect(header.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
      await expect(page.locator('[data-search-open], #search-dialog, .account-link')).toHaveCount(0)
      const columns = await page.locator('footer h2').allTextContents()
      expect(columns).not.toContain('Windows')
      expect(columns).not.toContain('Learn')
      expect(watch.problems()).toEqual([])
      expect(watch.errors, 'console errors (a hydration mismatch, say)').toEqual([])
    })

    test(`${path}: every link leads to a public page, or to email or another site`, async ({
      page,
      request,
    }) => {
      await page.goto(path)
      const hrefs = await page
        .locator('a[href]')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
      expect(hrefs.length).toBeGreaterThan(3)
      for (const href of new Set(hrefs)) {
        if (href.startsWith('/') && !href.startsWith('//')) {
          expect(isPublicAddress(href), `${path}: ${href}`).toBe(true)
          const status = (await request.get(href, { maxRedirects: 0 })).status()
          expect(status, `${path}: ${href}`).toBe(200)
        } else {
          expect(href, path).toMatch(/^(?:#|mailto:|https:\/\/)/)
          // This site's own pages only by their paths (src/lib/markdown.ts).
          if (href.startsWith('https://')) {
            expect(new URL(href).hostname, `${path}: ${href}`).not.toMatch(/(?:^|\.)gliagora\.com$/)
          }
        }
      }
    })

    for (const colorScheme of ['light', 'dark'] as const) {
      test(`${path}: no serious axe issue (${colorScheme} mode)`, async ({ page }) => {
        await page.emulateMedia({ colorScheme })
        await page.goto(path, { waitUntil: 'networkidle' })
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
        const serious = results.violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical',
        )
        expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([])
      })
    }

    test(`${path}: reflows at 320px, with text spacing and with text at 200%`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 })
      await page.goto(path)
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
      await page.addStyleTag({ content: TEXT_SPACING })
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
      await page.reload()
      await page.addStyleTag({ content: TEXT_200 })
      expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)
    })
  }

  test('/ leads to the coming-soon page, which reads nothing from the database', async ({
    page,
    request,
  }) => {
    const redirect = await request.get('/', { maxRedirects: 0 })
    expect(redirect.status()).toBe(308)
    expect(new URL(redirect.headers()['location']!, 'https://localhost').pathname).toBe('/en/')
    await page.goto('/en/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Where neuroscience meets')
    await expect(page.getByText(/^Coming soon: a curated, English-first hub/)).toBeVisible()
    await expect(
      page.locator('main').getByRole('link', { name: 'hello@gliagora.com' }),
    ).toHaveAttribute('href', 'mailto:hello@gliagora.com')
    // Glia Notes, only while its signup is public.
    const digest = page.locator('main').getByRole('link', { name: 'Get the monthly digest' })
    if (SIGNUP_PUBLIC) {
      await expect(digest).toHaveAttribute('href', NEWSLETTER_PATHS.signup)
    } else {
      await expect(digest).toHaveCount(0)
      await expect(page.locator('main')).not.toContainText('Glia Notes')
    }
    // No figures or lists of positions (the home page's), which stay private (D39).
    await expect(page.locator('main a[href^="/en/jobs/"]')).toHaveCount(0)
  })

  test('the coming-soon page has the hero, without the windows’ links, its files all public (D60)', async ({
    page,
  }) => {
    const points: number[] = []
    page.on('response', (response) => {
      if (new URL(response.url()).pathname.startsWith('/hero/')) points.push(response.status())
    })
    await page.goto('/en/')
    await expect(page.locator('svg.poster-art')).toBeVisible()
    await expect(page.locator('.home-poster-links')).toHaveCount(0)
    const box = page.locator('.home-poster')
    // No journey on scroll here: too little lies below the hero to scroll it through.
    await expect(box).toHaveAttribute('data-hero-journey', 'off')
    await expect(box).toHaveAttribute('data-hero', /^(live|poster|off)$/, { timeout: 20_000 })
    if ((await box.getAttribute('data-hero')) !== 'off') expect(points).toEqual([200])
  })

  test('on a phone, the menu holds About, Glia Notes while public, and nothing private', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 700 })
    await page.goto('/en/')
    await expect(page.locator('html[data-js]')).toBeAttached()
    const button = page.locator('header summary.button')
    await expect(button).toHaveAccessibleName('Menu')
    await button.click()
    const panel = page.locator('header .mobile-panel')
    await expect(panel.getByRole('link', { name: 'About' })).toBeFocused()
    const digest = panel.getByRole('link', { name: 'Get the monthly digest' })
    if (SIGNUP_PUBLIC) await expect(digest).toHaveAttribute('href', NEWSLETTER_PATHS.signup)
    else await expect(digest).toHaveCount(0)
    expect(await panel.locator('a').evaluateAll((links) => links.length)).toBe(
      SIGNUP_PUBLIC ? 2 : 1,
    )
    await expect(page.locator('main')).toHaveJSProperty('inert', true)
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(button).toBeFocused()
    // From 768px the menu gives way to the header's own Glia Notes button (while it is public).
    await page.setViewportSize({ width: 800, height: 700 })
    await expect(button).toBeHidden()
    const headerDigest = page
      .locator('header')
      .getByRole('link', { name: 'Get the monthly digest' })
    if (SIGNUP_PUBLIC) await expect(headerDigest).toBeVisible()
    else await expect(headerDigest).toHaveCount(0)
  })

  test('Ctrl+K and ⌘K stay the browser’s, with no search on the page', async ({ page }) => {
    await page.goto('/en/about/')
    await expect(page.locator('html[data-js]')).toBeAttached()
    const prevented = await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        metaKey: true,
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(prevented).toBe(false)
  })

  test('everything else asks for the password, also a POST to a public page', async ({
    request,
  }) => {
    for (const path of PRIVATE) {
      expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(401)
    }
    // Only the forms' pages and the routes behind their buttons take POSTs (the data-request form,
    // once its text is approved).
    const posts = publicPostPaths()
    for (const path of [...PAGES, '/en/legal/data-requests/', '/api/users/login/']) {
      if (posts.includes(path)) continue
      expect((await request.post(path, { maxRedirects: 0 })).status(), `POST ${path}`).toBe(401)
    }
    // HEAD is a GET without the body.
    expect((await request.head('/en/about/')).status()).toBe(200)
  })

  test('with the password, the private site is still there, as before', async ({ baseURL }) => {
    const signedIn = await requests.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
      httpCredentials: { ...TEST_AUTH, send: 'always' },
    })
    expect((await signedIn.get('/en/jobs/', { maxRedirects: 0 })).status()).toBe(200)
    // A visitor's copy of the public mark is removed: only Caddy's public handles send it.
    const spoofed = await signedIn.get('/en/jobs/', {
      maxRedirects: 0,
      headers: { [PUBLIC_MARK.name]: PUBLIC_MARK.value },
    })
    expect(spoofed.status()).toBe(200)
    // The public pages are their M2 versions for everyone, with the password too.
    expect(await (await signedIn.get('/en/')).text()).toContain('Coming soon:')
    await signedIn.dispose()
  })

  test('the M2 versions’ own addresses are no pages, even at the app', async () => {
    const app = await requests.newContext({ baseURL: process.env.M2_APP_URL })
    for (const path of ['/m2/en/', '/m2/en/about/']) {
      expect((await app.get(path, { maxRedirects: 0 })).status(), path).toBe(404)
    }
    await app.dispose()
  })
})

test.describe('robots.txt and the sitemaps in the M2 state', () => {
  const ORIGIN = 'https://gliagora.com'
  const locs = (xml: string) =>
    [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!.slice(ORIGIN.length))

  async function xml(request: APIRequestContext, path: string) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status(), path).toBe(200)
    return response.text()
  }

  test('list and allow exactly the public pages that are indexed', async ({ request }) => {
    const rules = robotsRules(await xml(request, '/robots.txt'))
    expect(rules.disallow).toEqual(['/'])
    const files = locs(await xml(request, '/sitemap.xml'))
    expect(files).toEqual(publicMachineFiles().filter((file) => file.startsWith('/sitemaps/')))
    const listed = []
    for (const file of files) listed.push(...locs(await xml(request, file)))
    // One file per locale (PLAN §12), so in another order than the list.
    expect([...listed].sort()).toEqual(
      indexedPublicPages()
        .map((page) => page.path)
        .sort(),
    )
    for (const path of listed) {
      expect(isDisallowed(path, rules), path).toBe(false)
      const html = await xml(request, path)
      expect(html, path).not.toMatch(/<meta name="robots" content="[^"]*noindex/)
      expect(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1], path).toBe(`${ORIGIN}${path}`)
    }
    // Private pages, and public pages that are not indexed (or not exactly these addresses).
    for (const path of [
      '/en/jobs/',
      '/en/suggest/',
      NEWSLETTER_PATHS.checkInbox,
      '/en/legal/data-requests/sent/',
      '/en/?x=1',
    ]) {
      expect(isDisallowed(path, rules), path).toBe(true)
    }
  })
})

test.describe('Glia Notes through Caddy, without the password', () => {
  test.skip(!SIGNUP_PUBLIC, 'public once the açık rıza metni is approved (src/lib/public-pages.ts)')

  /** What the one-click route answers a mail program (src/lib/newsletter/unsubscribe.ts). */
  const ONE_CLICK_DONE =
    'Unsubscribed from Glia Notes. If this address was on the list, it is deleted.'

  /** The path and query of the site's own link in an email (the app names its own origin). */
  function linkIn(text: string, pattern: RegExp): string {
    const link = pattern.exec(text)?.[0]
    expect(link, `${pattern}`).toBeTruthy()
    const url = new URL(link!)
    return `${url.pathname}${url.search}`
  }

  test('signs up, confirms and unsubscribes, also by a mail program’s one-click POST', async ({
    page,
    baseURL,
  }) => {
    needsMailpit()
    needsListmonk()
    const reduced = page.locator('header.site-header')
    const heading = page.getByRole('heading', { level: 1 })
    const form = await page.goto(NEWSLETTER_PATHS.signup)
    expect(form?.status()).toBe(200)
    await expect(reduced).toHaveClass(/\bsite-header-m2\b/)
    const email = page.getByLabel('Your email address')
    test.skip(
      (await email.count()) === 0 && !process.env.CI,
      'the M2 app needs listmonk’s and the mail server’s settings (LISTMONK_URL, LISTMONK_API_TOKEN, SMTP_HOST), as the app under test',
    )
    const address = `m2-nl-${randomBytes(6).toString('hex')}@example.org`
    await email.fill(address)
    await page.getByLabel('I agree to receive Glia Notes by email.').check()
    await page.getByRole('button', { name: 'Get the monthly digest' }).click()
    await page.waitForURL(`**${NEWSLETTER_PATHS.checkInbox}`)
    await expect(heading).toHaveText('Check your inbox')
    await expect(page.getByRole('main')).toContainText('We sent a confirmation link to m•••@')
    await expect(reduced).toHaveClass(/\bsite-header-m2\b/)

    // The emailed link, through Caddy: its page only reads, its button confirms.
    const confirmation = await latestEmailTo(address)
    await page.goto(
      linkIn(
        confirmation.text,
        /https?:\/\/\S+\/en\/newsletter\/confirm\/\?token=[A-Za-z0-9_-]{43}/,
      ),
    )
    await expect(heading).toHaveText('Confirm your subscription')
    expect(await subscribersWith(address)).toEqual([])
    await page.getByRole('button', { name: 'Confirm my subscription' }).click()
    await page.waitForURL(`**${NEWSLETTER_PATHS.confirmed}`)
    await expect(heading).toHaveText('You are subscribed')
    await expect(reduced).toHaveClass(/\bsite-header-m2\b/)
    const [subscriber] = await subscribersWith(address)
    expect(subscriber?.lists).toEqual([
      expect.objectContaining({ name: 'Glia Notes', subscription_status: 'confirmed' }),
    ])

    // The welcome email's unsubscribe page, and its one-click address, which a mail program posts
    // from another site: no cookie, no Origin, no password.
    const welcome = await latestEmailTo(address, { count: 2 })
    const unsubscribePage = linkIn(
      welcome.text,
      /https?:\/\/\S+\/en\/newsletter\/unsubscribe\/\?id=[0-9]+&s=[0-9a-f-]{36}/,
    )
    await page.goto(unsubscribePage)
    await expect(heading).toHaveText('Unsubscribe from Glia Notes')
    await expect(reduced).toHaveClass(/\bsite-header-m2\b/)
    const header = (await emailHeaders(welcome.id))['List-Unsubscribe']![0]!.trim()
    const oneClick = new URL(header.slice(1, -1))
    expect(oneClick.pathname).toBe(NEWSLETTER_PATHS.unsubscribeUse)
    const mailProgram = await without(baseURL!)
    const done = await mailProgram.post(`${oneClick.pathname}${oneClick.search}`, {
      form: { 'List-Unsubscribe': 'One-Click' },
      maxRedirects: 0,
    })
    // The route's own answer, which Caddy passes with the app's mark (then removed).
    expect(done.status()).toBe(200)
    expect(done.headers()['content-type']).toMatch(/^text\/plain/)
    expect(await done.text()).toBe(ONE_CLICK_DONE)
    expect(done.headers()[PUBLIC_MARK.name.toLowerCase()]).toBeUndefined()
    expect(await subscribersWith(address)).toEqual([])
    // An incomplete link: the route's 400, not Caddy's.
    const incomplete = await mailProgram.post(
      `${NEWSLETTER_PATHS.unsubscribeUse}?s=${oneClick.searchParams.get('s')}`,
      { form: { 'List-Unsubscribe': 'One-Click' }, maxRedirects: 0 },
    )
    expect(incomplete.status()).toBe(400)
    expect(await incomplete.text()).toBe('This unsubscribe link is incomplete.')
    // A GET of a route leads to its page.
    const get = await mailProgram.get(`${oneClick.pathname}${oneClick.search}`, { maxRedirects: 0 })
    expect(get.status()).toBe(303)
    expect(get.headers()['location']).toBe(unsubscribePage)
    await mailProgram.dispose()

    // The page's button, pressed afterwards: the same end, in the reduced shell.
    await page.getByRole('button', { name: 'Unsubscribe' }).click()
    await page.waitForURL(`**${NEWSLETTER_PATHS.unsubscribed}`)
    await expect(heading).toHaveText('You are unsubscribed')
    await expect(reduced).toHaveClass(/\bsite-header-m2\b/)
  })
})

test.describe('the private stage through Caddy', () => {
  test('asks for the password everywhere but the health check', async () => {
    const request = await without(caddies!.private.url)
    for (const path of [...publicGetPaths(ALL_APPROVED), ...PRIVATE, '/_next/static/x.js']) {
      expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(401)
    }
    expect((await request.post('/en/legal/data-requests/', { maxRedirects: 0 })).status()).toBe(401)
    expect((await request.get('/health/')).status()).toBe(200)
    await request.dispose()
  })
})

test.describe('only the exact spelling of a public address opens', () => {
  // Caddy's path matcher ignores case, decodes and cleans the path; the app does neither, so these
  // reached its 404 page, with the full navigation, without the password.
  const OTHER_SPELLINGS = [
    '/EN/',
    '/En/',
    '/En/About/',
    '/en/About/',
    '/EN/ABOUT/',
    '/en/%61bout/',
    '/en/about%2F',
    '/en/x/../about/',
    '/en/./about/',
    '/en//about/',
    '/en/about/.',
    '//en/about/',
    '/SITEMAP.XML',
    '/Robots.txt',
    '/SITEMAPS/PAGES.XML',
    '/brand/x.svg',
    '/brand/x/',
    '/brand/',
    '/BRAND/favicon.svg',
    '/hero/x.bin',
    '/hero/',
    '/_NEXT/static/x',
    '/_NEXT/STATIC/x/',
    '/_next/static/%2e%2e/x',
    '/_next/static/../x',
    '/_next/static/x/../../../en/jobs/',
  ]

  test('other spellings ask for the password, or get a plain 404, never a page', async () => {
    for (const pathname of OTHER_SPELLINGS) {
      const response = await raw(caddies!.m2.url, pathname)
      expect([401, 404], pathname).toContain(response.status)
      if (response.status === 404) expect(response.body, pathname).toBe(PLAIN_NOT_FOUND)
      expect(response.body, pathname).not.toContain('site-header')
    }
    // The exact spellings still open.
    expect((await raw(caddies!.m2.url, '/en/about/')).status).toBe(200)
    expect((await raw(caddies!.m2.url, '/brand/favicon.svg')).status).toBe(200)
    expect((await raw(caddies!.m2.url, heroFiles()[0]!)).status).toBe(200)
  })

  test('a missing file of Next.js gets a plain 404, not the app’s page', async () => {
    const response = await raw(caddies!.m2.url, '/_next/static/chunks/missing-e2e.js')
    expect(response.status).toBe(404)
    expect(response.body).toBe(PLAIN_NOT_FOUND)
  })
})

test.describe('a list of public addresses wider than the app’s (a rollback past an approval)', () => {
  test('what the app does not hold public answers a plain 404, also its form', async () => {
    const wide = caddies!.wide.url
    const closed = publicPages(ALL_APPROVED).filter(
      (page) => page.path !== '/' && !publicPages().some((one) => one.path === page.path),
    )
    for (const page of closed) {
      const methods = [
        ...(page.kind === 'page' ? ['GET', 'HEAD'] : []),
        ...(page.post ? ['POST'] : []),
      ]
      for (const method of methods) {
        const response = await raw(wide, page.path, { method })
        expect(response.status, `${method} ${page.path}`).toBe(404)
        if (method !== 'HEAD') expect(response.body, `${method} ${page.path}`).toBe(PLAIN_NOT_FOUND)
      }
    }
    for (const file of publicMachineFiles(ALL_APPROVED)) {
      if (publicMachineFiles().includes(file)) continue
      const response = await raw(wide, file)
      expect(response.status, file).toBe(404)
      expect(response.body, file).toBe(PLAIN_NOT_FOUND)
    }
    // What the app holds public opens as through the repository's list, without the app's mark.
    for (const pathname of PAGES) {
      const response = await raw(wide, pathname)
      expect(response.status, pathname).toBe(200)
      expect(response.body, pathname).toContain('site-header-m2')
      expect(response.headers[PUBLIC_MARK.name.toLowerCase()], pathname).toBeUndefined()
    }
  })

  test('the app itself refuses a marked request for what it does not hold public', async () => {
    const app = await requests.newContext({ baseURL: process.env.M2_APP_URL })
    const mark = { [PUBLIC_MARK.name]: PUBLIC_MARK.value }
    const routes = publicPages(ALL_APPROVED)
      .filter((page) => page.kind === 'route')
      .map((page) => page.path)
    for (const pathname of ['/en/jobs/', ...NOT_APPROVED.filter((one) => one.endsWith('/'))]) {
      const refused = await app.get(pathname, { headers: mark, maxRedirects: 0 })
      expect(refused.status(), pathname).toBe(404)
      expect(await refused.text(), pathname).toBe(PLAIN_NOT_FOUND)
      // Without the mark (the password's handle), the full site's page (the routes behind the
      // forms' buttons lead a GET to their pages).
      const status = (await app.get(pathname, { maxRedirects: 0 })).status()
      expect(status, pathname).toBe(routes.includes(pathname) ? 303 : 200)
    }
    // A public page: its M2 version, with the mark on the answer for Caddy.
    const about = await app.get('/en/about/', { headers: mark, maxRedirects: 0 })
    expect(about.status()).toBe(200)
    expect(about.headers()[PUBLIC_MARK.name.toLowerCase()]).toBe(PUBLIC_MARK.value)
    await app.dispose()
  })
})

test.describe('the query of a public address', () => {
  test('is in no header of the answer, and in no answer header of the access log', async () => {
    const secret = `e2e${Date.now()}`
    // These requests, among the others in the log, by their own browser name.
    const agent = `m2-query-test-${secret}`
    for (const pathname of PAGES) {
      const response = await raw(caddies!.m2.url, `${pathname}?token=${secret}`, {
        headers: { 'User-Agent': agent },
      })
      expect(response.status, pathname).toBe(200)
      for (const [name, value] of Object.entries(response.headers)) {
        expect(String(value), `${pathname}: ${name}`).not.toContain('token=')
      }
      // The browser's own navigation (RSC): its answer names the query for the browser, but the
      // log does not keep it.
      await raw(caddies!.m2.url, `${pathname}?token=${secret}`, {
        headers: { 'User-Agent': agent, RSC: '1' },
      })
    }
    type Entry = {
      request: { uri: string; headers: Record<string, string[]> }
      resp_headers?: Record<string, string[]>
    }
    const entries = async () =>
      readFileSync(caddies!.m2.accessLog, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Entry)
        .filter((entry) => entry.request.headers['User-Agent']?.[0] === agent)
    await expect.poll(async () => (await entries()).length).toBe(PAGES.length * 2)
    for (const entry of await entries()) {
      // The query stays in the logged address only where it names no token (D49: the sign-in,
      // account and data-request addresses lose theirs, D50: the newsletter's), never in the
      // answer's headers.
      const logged = JSON.stringify(entry.resp_headers ?? {})
      expect(logged, entry.request.uri).not.toContain('token=')
      expect(logged, entry.request.uri).not.toContain(secret)
      if (/^\/en\/(?:legal\/data-requests|newsletter)\//.test(entry.request.uri)) {
        expect(entry.request.uri, entry.request.uri).toMatch(/\?\[removed\]$/)
      }
    }
  })
})

test.describe('the site’s stage, read alike by Caddy and the app', () => {
  test('Caddy refuses to start with a value that is no stage, which the app shows as private', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gliagora-caddy-adapt-'))
    try {
      const files = adaptedFiles({ dir, app: '127.0.0.1:1', httpPort: 1 })
      writeFileSync(path.join(dir, 'Caddyfile'), files.caddyfile)
      writeFileSync(path.join(dir, 'm2-public.caddy'), files.publicCaddy)
      writeFileSync(path.join(dir, 'admin-auth.caddy'), files.adminAuth)
      mkdirSync(path.join(dir, 'basemap'))
      const adapt = (stage: string) =>
        spawnSync(
          process.env.CADDY_BIN!,
          ['adapt', '--config', path.join(dir, 'Caddyfile'), '--adapter', 'caddyfile'],
          {
            encoding: 'utf8',
            env: {
              NODE_ENV: 'test',
              PATH: process.env.PATH ?? '',
              HOME: dir,
              XDG_DATA_HOME: dir,
              XDG_CONFIG_HOME: dir,
              SITE_DOMAIN: 'localhost:1',
              SITE_STAGE: stage,
            },
          },
        )
      // The stages: only m2 opens the public handles (their raw-address check).
      expect(adapt('private').status).toBe(0)
      expect(adapt('private').stdout).not.toContain('vars_regexp')
      expect(adapt('m2').status).toBe(0)
      expect(adapt('m2').stdout).toContain('vars_regexp')
      for (const value of NOT_STAGES) {
        expect(siteStageSetting({ SITE_STAGE: value }).stage, JSON.stringify(value)).toBe('private')
        const result = adapt(value)
        expect(result.status, JSON.stringify(value)).not.toBe(0)
        expect(result.stderr, JSON.stringify(value)).toContain('File to import not found')
      }
      // A value Caddy reads as a pattern of files matches none: it starts with nothing open.
      for (const value of ['*', 'm2*', 'm2?']) {
        expect(siteStageSetting({ SITE_STAGE: value }).stage, value).toBe('private')
        const result = adapt(value)
        if (result.status === 0) expect(result.stdout, value).not.toContain('vars_regexp')
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

test.describe('the reduced header and footer with longer texts, on phones and at 200%', () => {
  // As pseudo-locale.spec.ts and layout.spec.ts check the full site's templates (PLAN §12, §17.1).
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 1280, height: 800 },
  ]) {
    test(`pseudo-locale at ${viewport.width}px: every public page`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport)
      for (const pathname of PAGES) {
        await page.goto(pathname)
        await expectLayoutHolds(page, testInfo, `${pathname} (M2)`)
      }
    })
  }

  test('pseudo-locale at 800px, the header’s buttons beside the lockup', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 800, height: 700 })
    // The coming-soon page, and a page with its translation where one is public (the language
    // button then joins them).
    const translated = PAGES.find((pathname) => pathname.startsWith('/tr/'))
    for (const pathname of ['/en/', ...(translated ? [translated] : [])]) {
      await page.goto(pathname)
      await expectLayoutHolds(page, testInfo, `${pathname} (M2, 800px)`)
    }
  })

  /** The coming-soon page with the phone menu open. */
  async function openMenu(page: Page, style?: string) {
    await page.goto('/en/')
    if (style) await page.addStyleTag({ content: style })
    await expect(page.locator('html[data-js]')).toBeAttached()
    await page.locator('.site-header details[data-modal] > summary').click()
    await expect(page.locator('header .mobile-panel')).toBeVisible()
  }

  test('the phone menu open at 320px: longer texts, text spacing and text at 200%', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await openMenu(page)
    await expectLayoutHolds(page, testInfo, 'M2 menu open', { modal: true })
    for (const [name, style] of [
      ['text spacing', TEXT_SPACING],
      ['text at 200%', TEXT_200],
    ] as const) {
      await openMenu(page, style)
      expect(await sidewaysScroll(page), name).toBeLessThanOrEqual(0)
      expect(await layoutProblems(page), name).toEqual([])
    }
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`the phone menu open: no serious axe issue (${colorScheme} mode)`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 700 })
      await page.emulateMedia({ colorScheme })
      await openMenu(page)
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      )
      expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([])
    })
  }
})
