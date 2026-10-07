import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { DATA_REQUEST_PATHS } from '../../src/lib/data-requests/paths'
import { MEMBER_PATHS } from '../../src/lib/members/paths'
import { NEWSLETTER_PATHS } from '../../src/lib/newsletter/paths'
import { REPORT_PATH } from '../../src/lib/reports/item'
import { paths } from '../../src/lib/site'
import { TOO_MANY, rateLimitZones, zone } from './limits'
import { CADDYFILE } from './serve'

// The rate limits of the production Caddyfile (PLAN §18.2, D42), as the file says them:
// tests/e2e/rate-limits.spec.ts sends requests through it. A change of a limit or of a route is
// made here too, on purpose.

const caddyfile = readFileSync(CADDYFILE, 'utf8')
const zones = rateLimitZones(caddyfile)
/** Both spellings of an address: Next.js redirects the one without the slash. */
const both = (path: string) => [path.replace(/\/$/, ''), path]

describe('the rate limits of the Caddyfile', () => {
  it('are these four, each per visitor address over a minute, IPv6 by its /64', () => {
    expect(zones.map(({ name, events }) => [name, events])).toEqual([
      ['editors', 20],
      ['member_sign_in', 120],
      ['forms', 30],
      ['search', 120],
    ])
    for (const one of zones) {
      expect(one.window, one.name).toBe('1m')
      // The connection's own address: no proxy stands in front of Caddy on the server.
      expect(one.key, one.name).toBe('{client_ip}')
      expect(one.ipv6Prefix, one.name).toBe(64)
      expect(one.matches.length, one.name).toBeGreaterThan(0)
    }
    expect(caddyfile).not.toMatch(/trusted_proxies/)
  })

  it('cover the editors’ sign-in and password routes, of Payload’s API and of the admin', () => {
    const [match] = zone('editors', zones).matches
    for (const route of [
      'login',
      'forgot-password',
      'reset-password',
      'first-register',
      'unlock',
    ]) {
      expect(match?.paths, route).toEqual(expect.arrayContaining(both(`/api/users/${route}/`)))
    }
    for (const page of ['login', 'forgot', 'reset', 'create-first-user']) {
      expect(match?.paths, page).toEqual(
        expect.arrayContaining([`/admin/${page}`, `/admin/${page}/*`]),
      )
    }
    // Whatever the method, and nothing an editor's daily work calls again and again.
    expect(match?.methods).toEqual([])
    expect(match?.paths.join(' ')).not.toMatch(/\/api\/users\/(?:me|refresh-token|logout)/)
  })

  it('cover every member sign-in route: the pages, Google and ORCID, the emailed link', () => {
    // Everything under the sign-in page, and what the account pages' forms send: signed out,
    // they show the sign-in panel in place, and its form posts to the page it is on.
    expect(zone('member_sign_in', zones).matches).toEqual([
      { methods: [], paths: ['/en/sign-in', '/en/sign-in/*'], query: [] },
      { methods: ['POST'], paths: ['/en/account', '/en/account/*'], query: [] },
    ])
    for (const [name, path] of Object.entries(MEMBER_PATHS)) {
      if (path === MEMBER_PATHS.signOut) continue
      expect(/^\/en\/(?:sign-in|account)\//.test(path), name).toBe(true)
    }
  })

  it('cover what the public forms send, and never the one-click unsubscribe', () => {
    const [match, ...more] = zone('forms', zones).matches
    expect(more).toEqual([])
    expect(match?.methods).toEqual(['POST'])
    const forms = [
      paths.section('suggest'),
      REPORT_PATH,
      DATA_REQUEST_PATHS.page,
      DATA_REQUEST_PATHS.confirmUse,
      NEWSLETTER_PATHS.signup,
      NEWSLETTER_PATHS.resend,
      NEWSLETTER_PATHS.confirmUse,
    ]
    expect([...(match?.paths ?? [])].sort()).toEqual(forms.flatMap(both).sort())
    // Mail providers send their users' unsubscribes from a few addresses of their own (D50).
    expect(match?.paths).not.toContain(NEWSLETTER_PATHS.unsubscribeUse)
  })

  it('cover search: its page, and the jobs list and the map’s data with words to search for', () => {
    expect(zone('search', zones).matches).toEqual([
      { methods: [], paths: ['/en/search', '/en/search/*'], query: [] },
      {
        methods: [],
        paths: [...both(paths.window('jobs')), ...both('/api/map/institutions/')],
        query: ['q=*'],
      },
    ])
    expect(paths.search()).toBe('/en/search/')
  })

  it('apply before the password and every handle, in each stage', () => {
    const site = caddyfile.slice(caddyfile.indexOf('\n{$SITE_DOMAIN} {'))
    expect(site.indexOf('\timport rate_limits\n')).toBeGreaterThan(0)
    expect(site.indexOf('\timport rate_limits\n')).toBeLessThan(site.indexOf('\thandle '))
    expect(caddyfile.match(/import rate_limits/g)).toHaveLength(1)
    // The module orders itself before basic_auth; no line here may change that.
    expect(caddyfile).not.toMatch(/^\s*order\s+rate_limit/m)
  })

  it('keep nothing about a visitor but the times of the last requests, in memory', () => {
    // The limiter's own line for a refused request names the whole address: left out of the log.
    expect(caddyfile).toMatch(
      /log default \{[^}]*\{[^}]*\}\s*exclude http\.handlers\.rate_limit\s*\}/,
    )
    // No counters per address either, no key in a log, and no storage shared with others.
    const limiter = caddyfile.slice(caddyfile.indexOf('\trate_limit {'))
    expect(limiter).toMatch(/^\t\tdisable_metrics$/m)
    expect(caddyfile).not.toMatch(/^\s*(?:log_key|distributed|storage)\b/m)
  })

  it('answer a request over a limit with 429, the site’s headers and one line of text', () => {
    const answer = /handle_errors 429 \{\n([\s\S]*?)\n\t\}/.exec(caddyfile)?.[1] ?? ''
    expect(answer).toContain('import security_headers')
    expect(answer).toContain('header Content-Type "text/plain; charset=utf-8"')
    expect(answer).toContain(`respond "${TOO_MANY}" 429`)
  })
})
