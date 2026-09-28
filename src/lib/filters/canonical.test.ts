import { describe, expect, it } from 'vitest'

import { canonicalListPath } from './canonical'

// What the proxy sees: Next.js hands it the query re-encoded as a form would (commas as %2C,
// spaces as +), so the check works on URLSearchParams, not on the raw string.
const seen = (url: string) => {
  const parsed = new URL(url, 'http://localhost')
  parsed.searchParams.delete('_rsc')
  return { pathname: parsed.pathname, query: parsed.searchParams }
}
const redirectFor = (url: string) => {
  const { pathname, query } = seen(url)
  return canonicalListPath(pathname, query)
}

describe('canonical list addresses', () => {
  it('leave canonical addresses alone, however the characters are spelt', () => {
    for (const url of [
      '/en/jobs/',
      '/en/jobs/?type=phd',
      '/en/jobs/?deadline=14d',
      '/en/jobs/?subfield=glia,motor&type=phd',
      '/en/jobs/?subfield=glia%2Cmotor&type=phd',
      '/en/jobs/?q=calcium+imaging',
      '/en/jobs/?q=calcium%20imaging',
      '/en/jobs/?q=%c3%bcber',
      '/en/jobs/?deadline=2026-10-01..2026-12-31&sort=newest&page=2',
      // Campaign tags on our own links, wherever they are (PLAN §13, §16.4).
      '/en/jobs/?deadline=14d&utm_source=glia-notes&utm_medium=email',
      '/en/jobs/?utm_source=linkedin&type=phd',
    ]) {
      expect(redirectFor(url), url).toBeNull()
    }
  })

  it('redirect other spellings of the same filters to the canonical address', () => {
    const cases: [string, string][] = [
      // The filter form without JavaScript: repeated parameters, empty and default values.
      [
        '/en/jobs/?q=&type=phd&type=msc&deadline=&deadline-from=&deadline-to=&sort=deadline',
        '/en/jobs/?type=msc,phd',
      ],
      [
        '/en/jobs/?deadline=range&deadline-from=2026-10-01&deadline-to=2026-12-31',
        '/en/jobs/?deadline=2026-10-01..2026-12-31',
      ],
      ['/en/jobs/?type=phd&subfield=glia', '/en/jobs/?subfield=glia&type=phd'],
      ['/en/jobs/?type=PhD', '/en/jobs/?type=phd'],
      ['/en/jobs/?country=de', '/en/jobs/?country=DE'],
      ['/en/jobs/?page=1', '/en/jobs/'],
      ['/en/jobs/?utm_source=newsletter&type=PhD', '/en/jobs/?type=phd&utm_source=newsletter'],
      ['/en/jobs/?UTM_Source=x&page=1', '/en/jobs/?UTM_Source=x'],
      ['/en/jobs/?type=', '/en/jobs/'],
      ['/en/jobs/?q=++two++words', '/en/jobs/?q=two+words'],
      ['/en/jobs/?view=list', '/en/jobs/'],
    ]
    for (const [from, to] of cases) expect(redirectFor(from), from).toBe(to)
  })

  it('never redirect a canonical address to itself', () => {
    for (const url of [
      '/en/jobs/?type=phd&type=msc',
      '/en/jobs/?q=it%27s+%22quoted%22+50%25+%26+more,+more',
      '/en/jobs/?q=%E2%80%94%F0%9F%A7%A0',
      "/en/jobs/?q=it's",
      '/en/jobs/?country=de,nl&region=Europe&institution=05DXPS055',
    ]) {
      const target = redirectFor(url) ?? url
      // As the browser would request the target, and as Next.js hands it to the proxy.
      const requested = new URL(target, 'http://localhost')
      expect(redirectFor(requested.pathname + requested.search), url).toBeNull()
    }
  })

  it('leave a range of days with a mistake as sent: the page shows it with an error', () => {
    for (const url of [
      '/en/jobs/?type=phd&deadline=range&deadline-from=2026-12-31&deadline-to=2026-10-01',
      '/en/jobs/?q=&deadline=range&deadline-from=2026-10-01&deadline-to=&sort=deadline',
      '/en/jobs/?deadline=range',
    ]) {
      expect(redirectFor(url), url).toBeNull()
    }
  })

  it('ignore the router’s own parameter and other pages', () => {
    expect(redirectFor('/en/jobs/?type=phd&_rsc=abc12')).toBeNull()
    expect(redirectFor('/en/contact/?type=PhD')).toBeNull()
    expect(redirectFor('/en/jobs/phd-position-test1/?type=PhD')).toBeNull()
  })

  it('accept the list path without its trailing slash', () => {
    expect(canonicalListPath('/en/jobs', new URLSearchParams('type=PhD'))).toBe(
      '/en/jobs/?type=phd',
    )
  })
})
