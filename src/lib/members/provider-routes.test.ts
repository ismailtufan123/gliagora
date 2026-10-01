import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SIGN_IN_COOKIE } from './cookies'
import { openSignIn } from './seal'

// Starting to sign in with Google or ORCID (provider-routes.ts) with a position to save
// afterwards: kept only when the start came from the sign-in page, which named it (the M4b design
// §3). The provider is not asked: authorizationRequest is replaced by a fixed answer.

vi.mock('payload', () => ({
  getPayload: async () => {
    throw new Error('A start of signing in reads no database')
  },
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('./oidc', async (original) => ({
  ...(await original<typeof import('./oidc')>()),
  authorizationRequest: async () => ({
    url: new URL('http://127.0.0.1:9400/orcid/authorize?state=fixed'),
    flow: { state: 's'.repeat(43), nonce: 'n'.repeat(43) },
  }),
}))

const { startProviderSignIn } = await import('./provider-routes')

const SECRET = 'provider-routes-test-secret'
const SAVE = 'job:k3f9a'
const START = `http://localhost:3000/en/sign-in/orcid/?next=%2Fen%2Fjobs%2F&save=job%3Ak3f9a`

beforeEach(() => {
  vi.stubEnv('SERVER_URL', '')
  vi.stubEnv('PAYLOAD_JOBS_AUTORUN', 'false')
  vi.stubEnv('AUTH_TEST_ISSUER', 'http://127.0.0.1:9400')
  vi.stubEnv('PAYLOAD_SECRET', SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const start = (site: string | null, url = START) =>
  startProviderSignIn(
    'orcid',
    new Request(url, {
      headers: { host: 'localhost:3000', ...(site === null ? {} : { 'sec-fetch-site': site }) },
    }),
  )

/** The flow sealed into the sign-in cookie of a start's answer. */
function sealedFlow(response: Response) {
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${SIGN_IN_COOKIE}=`))
  const value = cookie?.slice(SIGN_IN_COOKIE.length + 1).split(';', 1)[0]
  return openSignIn(value, SECRET, new Date(), 'oauth')
}

describe('a start of signing in with a position to save', () => {
  it('from the sign-in page: the position travels in the sealed flow', async () => {
    const response = await start('same-origin')
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toMatch(/^http:\/\/127\.0\.0\.1:9400\/orcid\//)
    const flow = sealedFlow(response)
    expect(flow).toMatchObject({ intent: 'sign-in', next: '/en/jobs/', save: SAVE })
  })

  it.each(['cross-site', 'same-site', 'none'])(
    'from elsewhere (%s): the sign-in page names it first, and nothing is started',
    async (site) => {
      const response = await start(site)
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe(
        '/en/sign-in/?next=%2Fen%2Fjobs%2F&save=job%3Ak3f9a',
      )
      expect(response.headers.getSetCookie()).toEqual([])
    },
  )

  it('from elsewhere, without `next`: the sign-in page with the position only', async () => {
    const response = await start(
      'cross-site',
      'http://localhost:3000/en/sign-in/orcid/?save=job%3Ak3f9a',
    )
    expect(response.headers.get('location')).toBe('/en/sign-in/?save=job%3Ak3f9a')
  })

  it('from a browser that does not say: signs in, without saving', async () => {
    const response = await start(null)
    expect(response.headers.get('location')).toMatch(/^http:\/\/127\.0\.0\.1:9400\/orcid\//)
    const flow = sealedFlow(response)
    expect(flow).toMatchObject({ intent: 'sign-in', next: '/en/jobs/' })
    expect(flow?.save).toBeUndefined()
  })

  it('without a position, from anywhere: signs in as asked', async () => {
    const response = await start(
      'cross-site',
      'http://localhost:3000/en/sign-in/orcid/?next=%2Fen%2Fjobs%2F',
    )
    expect(response.headers.get('location')).toMatch(/^http:\/\/127\.0\.0\.1:9400\/orcid\//)
    expect(sealedFlow(response)).toMatchObject({ next: '/en/jobs/' })
  })
})
