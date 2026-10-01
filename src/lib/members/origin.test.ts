import { describe, expect, it } from 'vitest'

import { appOrigin, sameOrigin, saveAtStart, startedHere } from './origin'

const headers = (values: Record<string, string>) => new Headers(values)

describe('appOrigin', () => {
  it('is SERVER_URL’s origin in production, whatever the request says', () => {
    // Inside the Docker image, request.url is http://0.0.0.0:3000/…; it is never read.
    const request = new Request('http://0.0.0.0:3000/en/sign-in/google/', {
      headers: { host: '0.0.0.0:3000' },
    })
    expect(appOrigin(request.headers, { SERVER_URL: 'https://gliagora.com' })).toBe(
      'https://gliagora.com',
    )
    expect(
      appOrigin(headers({ host: 'evil.example.org' }), { SERVER_URL: 'https://gliagora.com/' }),
    ).toBe('https://gliagora.com')
  })

  it('refuses a SERVER_URL that is not https, except on this computer', () => {
    expect(appOrigin(headers({}), { SERVER_URL: 'http://gliagora.com' })).toBeNull()
    expect(appOrigin(headers({}), { SERVER_URL: 'not a url' })).toBeNull()
    expect(appOrigin(headers({}), { SERVER_URL: 'http://localhost:3000' })).toBe(
      'http://localhost:3000',
    )
  })

  it.each([
    ['localhost:3000', 'http://localhost:3000'],
    ['127.0.0.1:3000', 'http://127.0.0.1:3000'],
    ['[::1]:3000', 'http://[::1]:3000'],
    ['localhost', 'http://localhost'],
    ['LOCALHOST:3000', 'http://localhost:3000'],
  ])('without SERVER_URL takes the Host %j of this computer', (host, origin) => {
    expect(appOrigin(headers({ host }), {})).toBe(origin)
  })

  it.each([
    'gliagora.com',
    '0.0.0.0:3000',
    '192.168.1.5:3000',
    'localhost.evil.org',
    'localhost:99999',
    '',
  ])('without SERVER_URL switches sign-in off for the Host %j', (host) => {
    expect(appOrigin(headers(host ? { host } : {}), { SERVER_URL: '' })).toBeNull()
  })
})

describe('sameOrigin', () => {
  const env = { SERVER_URL: 'https://gliagora.com' }

  it('trusts Sec-Fetch-Site when the browser sends it', () => {
    expect(sameOrigin(headers({ 'sec-fetch-site': 'same-origin' }), env)).toBe(true)
    for (const site of ['same-site', 'cross-site', 'none']) {
      expect(
        sameOrigin(headers({ 'sec-fetch-site': site, origin: 'https://gliagora.com' }), env),
      ).toBe(false)
    }
  })

  it('otherwise needs our own Origin: not missing, not null, not another', () => {
    expect(sameOrigin(headers({ origin: 'https://gliagora.com' }), env)).toBe(true)
    expect(sameOrigin(headers({}), env)).toBe(false)
    expect(sameOrigin(headers({ origin: 'null' }), env)).toBe(false)
    expect(sameOrigin(headers({ origin: 'https://evil.example.org' }), env)).toBe(false)
    expect(sameOrigin(headers({ origin: 'http://gliagora.com' }), env)).toBe(false)
  })

  it('refuses everything while the origin is unknown', () => {
    expect(sameOrigin(headers({ host: 'gliagora.com', 'sec-fetch-site': 'same-origin' }), {})).toBe(
      false,
    )
    expect(
      sameOrigin(headers({ host: 'localhost:3000', origin: 'http://localhost:3000' }), {}),
    ).toBe(true)
  })
})

describe('startedHere', () => {
  it('needs a request from our own pages', () => {
    expect(startedHere(headers({ 'sec-fetch-site': 'same-origin' }))).toBe(true)
    expect(startedHere(headers({ 'sec-fetch-site': 'cross-site' }))).toBe(false)
    expect(startedHere(headers({}))).toBe(false)
  })
})

describe('saveAtStart', () => {
  it.each([
    // The sign-in page's own provider links, which name the position.
    ['same-origin', 'keep'],
    // Another site, a subdomain, an email, the address bar or a bookmark: named first.
    ['cross-site', 'ask'],
    ['same-site', 'ask'],
    ['none', 'ask'],
    // A browser that does not say: no saving, since asking again would never end.
    [null, 'drop'],
  ] as const)('Sec-Fetch-Site %s: %s', (site, rule) => {
    expect(saveAtStart(headers(site === null ? {} : { 'sec-fetch-site': site }))).toBe(rule)
  })
})
