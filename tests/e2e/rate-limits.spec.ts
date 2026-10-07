import { readFileSync } from 'node:fs'

import {
  type APIRequestContext,
  expect,
  request as playwrightRequest,
  test,
} from '@playwright/test'

import { TOO_MANY, rateLimitZones, zone } from '../caddy/limits'
import { TEST_AUTH, testCaddies } from '../caddy/serve'

// The rate limits of the production Caddyfile (PLAN §18.2, D42), through a Caddy of its own in
// front of the M2 app (playwright.config.ts, project `m2`; tests/caddy/serve.ts, `limits`): in
// the M2 state with every text opened, so it has addresses behind the password and public forms.
// Each test is a visitor of its own (that Caddy alone takes the address from X-Forwarded-For), so
// no test uses up another's count; the limits themselves are read from the Caddyfile
// (tests/caddy/limits.ts), and tests/caddy/limits.test.ts checks what it says. The other Caddies
// of the tests count every test under this computer's one address, as the server would: that the
// M2 state's own tests pass through them shows that ordinary use stays below the limits.

const caddies = testCaddies(process.env, process.env.BASE_URL ?? 'http://localhost:3000')

test.skip(
  !caddies && !process.env.CI,
  'needs CADDY_BIN and M2_APP_URL (an app with SITE_STAGE=m2): see playwright.config.ts',
)
test.beforeAll(() => {
  expect(caddies, 'CADDY_BIN and M2_APP_URL').toBeTruthy()
})

// Addresses of this run's own, from the ranges kept for documentation (RFC 5737, RFC 3849), so
// that a second run within the minute does not meet the first one's counts.
const RUN = Math.floor(Math.random() * 250)
const ipv4 = (visitor: number) => `198.51.${RUN}.${visitor}`
/** An address of a /64: `host` is its second half, four groups. */
const ipv6 = (network: number, host: string) => `2001:db8:${RUN.toString(16)}:${network}:${host}`

const contexts: APIRequestContext[] = []
test.afterAll(async () => {
  await Promise.all(contexts.map((context) => context.dispose()))
})

/** A visitor at an address of its own; with `password`, one who knows the site-wide password. */
async function visitor(address: string, { password = false } = {}) {
  const context = await playwrightRequest.newContext({
    baseURL: caddies!.limits.url,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { 'X-Forwarded-For': address },
    ...(password ? { httpCredentials: { ...TEST_AUTH, send: 'always' as const } } : {}),
  })
  contexts.push(context)
  return context
}

type Call = { method?: 'GET' | 'POST'; path: string }
const send = (who: APIRequestContext, { method = 'GET', path }: Call) =>
  who.fetch(path, { method, maxRedirects: 0, failOnStatusCode: false })

/**
 * Each zone: what it counts (all of it in one count), and what it leaves alone. Without the
 * password, the private addresses answer 401 from Caddy and the public forms a plain 404 from the
 * app (it holds their texts as drafts): the limits come first either way.
 */
const ZONES: { name: string; counted: Call[]; free: Call[] }[] = [
  {
    name: 'editors',
    counted: [
      { method: 'POST', path: '/api/users/login/' },
      { method: 'POST', path: '/api/users/login' },
      { method: 'POST', path: '/api/users/forgot-password/' },
      { method: 'POST', path: '/api/users/reset-password/' },
      { method: 'POST', path: '/api/users/first-register/' },
      { method: 'POST', path: '/api/users/unlock/' },
      { path: '/admin/login/' },
      { path: '/admin/forgot/' },
      { path: '/admin/reset/0123456789abcdef/' },
      // Caddy compares paths without regard to case; the app would not know this one.
      { method: 'POST', path: '/API/Users/Login/' },
    ],
    free: [
      { path: '/api/users/me/' },
      { path: '/admin/' },
      { path: '/admin/collections/jobs/' },
      // The first account's form asks the server after every change: its page is not counted.
      { method: 'POST', path: '/admin/create-first-user/' },
    ],
  },
  {
    name: 'member_sign_in',
    counted: [
      { path: '/en/sign-in/' },
      { method: 'POST', path: '/en/sign-in/' },
      { path: '/en/sign-in/google/' },
      { path: '/en/sign-in/google/callback/?code=x&state=y' },
      { path: '/en/sign-in/orcid/' },
      { path: '/en/sign-in/link/?token=x' },
      { method: 'POST', path: '/en/sign-in/link/use/' },
      { method: 'POST', path: '/en/sign-in/create/' },
      { method: 'POST', path: '/en/account/' },
      { method: 'POST', path: '/en/account/settings/' },
    ],
    free: [{ path: '/en/account/' }, { path: '/en/account/saved/' }],
  },
  {
    name: 'forms',
    counted: [
      { method: 'POST', path: '/en/suggest/' },
      { method: 'POST', path: '/en/report/' },
      { method: 'POST', path: '/en/legal/data-requests/' },
      { method: 'POST', path: '/en/legal/data-requests/confirm/use/' },
      { method: 'POST', path: '/en/newsletter/' },
      { method: 'POST', path: '/en/newsletter/resend/' },
      { method: 'POST', path: '/en/newsletter/confirm/use/' },
    ],
    free: [
      { path: '/en/suggest/' },
      { path: '/en/newsletter/' },
      // A mail program's one-click unsubscribe (D50): never counted.
      { method: 'POST', path: '/en/newsletter/unsubscribe/use/?id=7&s=x' },
    ],
  },
  {
    name: 'search',
    counted: [
      { path: '/en/search/?q=glia' },
      { path: '/en/search/' },
      { path: '/en/jobs/?q=glia' },
      { path: '/en/jobs/?type=phd&q=glia' },
      { path: '/en/jobs/?type=phd' },
      { path: '/api/map/institutions/?q=glia' },
      // Queries Caddy cannot parse, which the app reads all the same and searches for.
      { path: '/en/jobs/?q=glia&utm_source=%' },
      { path: '/en/jobs/?q=glia&x=a;b' },
      { path: '/api/map/institutions/?q=glia&x=%' },
    ],
    free: [{ path: '/en/jobs/' }, { path: '/api/map/institutions/' }, { path: '/en/map/' }],
  },
]

test.describe('the rate limits of the production Caddyfile', () => {
  test('the tests know every zone of the Caddyfile', () => {
    expect(ZONES.map((one) => one.name)).toEqual(rateLimitZones().map((one) => one.name))
  })

  for (const [index, { name, counted, free }] of ZONES.entries()) {
    test(`${name}: one count for all of its routes, then 429 with Retry-After and one line`, async () => {
      const { events } = zone(name)
      const who = await visitor(ipv4(10 + index))
      // As many requests as the limit allows, over all of the zone's routes in turn: none refused.
      for (let sent = 0; sent < events; sent++) {
        const call = counted[sent % counted.length]!
        const response = await send(who, call)
        expect(response.status(), `request ${sent + 1}: ${call.path}`).not.toBe(429)
      }
      // The next one to each route is refused, whatever the route.
      for (const call of counted) {
        const response = await send(who, call)
        expect(response.status(), call.path).toBe(429)
        expect(await response.text()).toBe(TOO_MANY)
        const headers = response.headers()
        expect(headers['content-type']).toBe('text/plain; charset=utf-8')
        // The seconds until the oldest request of the last minute is a minute old.
        expect(Number(headers['retry-after']), call.path).toBeGreaterThanOrEqual(1)
        expect(Number(headers['retry-after']), call.path).toBeLessThanOrEqual(60)
        // With the site's headers, and nothing of the app's.
        expect(headers['strict-transport-security']).toBe('max-age=31536000')
        expect(headers['x-content-type-options']).toBe('nosniff')
        expect(headers['www-authenticate']).toBeUndefined()
      }
      // What the zone does not count still answers, for the same visitor.
      for (const call of free) {
        expect((await send(who, call)).status(), `free: ${call.path}`).not.toBe(429)
      }
      // And another visitor is not held up.
      const other = await visitor(ipv4(110 + index))
      expect((await send(other, counted[0]!)).status()).not.toBe(429)
    })
  }

  test('a request under the limit reaches the app as before, and one over it does not', async () => {
    const { events } = zone('search')
    const who = await visitor(ipv4(30), { password: true })
    const first = await send(who, { path: '/en/search/?q=glia' })
    expect(first.status()).toBe(200)
    expect(await first.text()).toContain('<html')
    for (let sent = 1; sent < events; sent++) {
      expect((await send(who, { path: `/en/search/?q=glia${sent}` })).status()).toBe(200)
    }
    // The right password does not help: the limit comes before it.
    const over = await send(who, { path: '/en/search/?q=glia' })
    expect(over.status()).toBe(429)
    expect(await over.text()).toBe(TOO_MANY)
    // The rest of the site is still there for this visitor.
    expect((await send(who, { path: '/en/about/' })).status()).toBe(200)
  })

  test('IPv6 visitors count by their /64, IPv4 visitors each on their own', async () => {
    const { events } = zone('editors')
    const call: Call = { method: 'POST', path: '/api/users/login/' }
    // One network, two of its addresses: half of the allowance each.
    const first = await visitor(ipv6(1, '0:0:0:1'))
    const second = await visitor(ipv6(1, 'abcd:ef01:2345:6789'))
    for (let sent = 0; sent < events; sent++) {
      expect((await send(sent % 2 ? first : second, call)).status()).not.toBe(429)
    }
    expect((await send(first, call)).status()).toBe(429)
    expect((await send(second, call)).status()).toBe(429)
    // A third address of that network, never seen before, is refused too.
    expect((await send(await visitor(ipv6(1, 'ffff:0:0:2')), call)).status()).toBe(429)
    // The network next to it is another visitor.
    expect((await send(await visitor(ipv6(2, '0:0:0:1')), call)).status()).not.toBe(429)

    // IPv4: the address next door is someone else.
    const one = await visitor(ipv4(40))
    for (let sent = 0; sent < events; sent++) await send(one, call)
    expect((await send(one, call)).status()).toBe(429)
    expect((await send(await visitor(ipv4(41)), call)).status()).not.toBe(429)
  })

  test('a refused request is in the access log like any other, and nowhere else', async () => {
    const { events } = zone('forms')
    const address = ipv4(50)
    const who = await visitor(address)
    const agent = `rate-limit-test-${Date.now()}`
    const post = () =>
      who.fetch('/en/suggest/', {
        method: 'POST',
        headers: { 'User-Agent': agent },
        maxRedirects: 0,
        failOnStatusCode: false,
      })
    for (let sent = 0; sent < events; sent++) await post()
    expect((await post()).status()).toBe(429)

    type Entry = {
      status: number
      request: {
        uri: string
        client_ip: string
        remote_ip: string
        headers: Record<string, string[]>
      }
    }
    const logged = () =>
      readFileSync(caddies!.limits.accessLog, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Entry)
        .filter((entry) => entry.request.headers['User-Agent']?.[0] === agent)
    await expect.poll(() => logged().length).toBe(events + 1)
    const refused = logged().filter((entry) => entry.status === 429)
    expect(refused).toHaveLength(1)
    // The same fields as every request: the address masked to its /24, nothing more.
    expect(refused[0]?.request.uri).toBe('/en/suggest/')
    expect(refused[0]?.request.client_ip).toBe(`198.51.${RUN}.0`)
    expect(Object.keys(refused[0]!).sort()).toEqual(Object.keys(logged()[0]!).sort())
    expect(readFileSync(caddies!.limits.accessLog, 'utf8')).not.toContain(address)
    // Caddy's own log says nothing about it: not the limiter's line, not the address.
    const own = readFileSync(caddies!.limits.ownLog, 'utf8')
    expect(own).not.toContain('rate limit exceeded')
    expect(own).not.toContain('http.handlers.rate_limit')
    expect(own).not.toContain(address)
    expect(own).not.toContain(`198.51.${RUN}.`)
  })
})
