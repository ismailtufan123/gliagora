import * as oauth from 'oauth4webapi'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  FAKE_CLIENT,
  FAULTS,
  type Fault,
  type FakeOidc,
  type FakeProvider,
  fakeOrcidId,
  startFakeOidc,
} from '../../../tests/fake-oidc/server'
import { type ProviderOn, TEST_CLIENT, memberAuthConfig } from './config'
import { isOrcidId } from './orcid-id'
import {
  type CallbackResult,
  ClaimError,
  authorizationRequest,
  forgetProviders,
  oauthErrorCode,
  orcidName,
  verifyCallback,
} from './oidc'
import { sealSignIn } from './seal'

// Signing in with Google and ORCID (src/lib/members/oidc.ts) against the fake providers of the
// tests (tests/fake-oidc/server.ts), in this process: the real protocol code, every fault the fake
// can put into its answer, a declined consent, and a sign-in cookie that is missing or changed.

const SECRET = 'test-only-payload-secret'
const REDIRECT = 'http://localhost:3000/en/sign-in/google/callback/'

let fake: FakeOidc
let settings: Record<FakeProvider, ProviderOn>

beforeAll(async () => {
  fake = await startFakeOidc({ port: 0 })
  const config = memberAuthConfig({ AUTH_TEST_ISSUER: fake.base })
  if (!config.google.on || !config.orcid.on) throw new Error('the test issuer is not on')
  settings = { google: config.google, orcid: config.orcid }
})

afterAll(() => fake.close())

beforeEach(() => {
  forgetProviders()
  fake.requests.length = 0
})

type Answer = {
  fields?: Record<string, string>
  fault?: Fault
  decision?: 'allow' | 'deny'
}

/** The fields the fake's form has, as a person who just presses Continue sends them. */
function defaultFields(provider: FakeProvider): Record<string, string> {
  return provider === 'google'
    ? {
        sub: '108234567890123456789',
        email: 'm-0123456789ab@example.org',
        email_verified: 'true',
        hd: 'example.org',
      }
    : { sub: fakeOrcidId(), given_name: 'Josiah', family_name: 'Carberry', name: 'Josiah Carberry' }
}

/**
 * Starts a sign-in, answers the fake's form as a person would, and returns the authorization
 * address, the callback's query and the sealed cookie the start route would have set.
 */
async function signInAt(provider: FakeProvider, answer: Answer = {}) {
  const now = new Date()
  const { url, flow } = await authorizationRequest(provider, settings[provider], REDIRECT)
  const page = await fetch(url)
  expect(page.status).toBe(200)
  const form = new URLSearchParams(url.searchParams)
  for (const [name, value] of Object.entries(answer.fields ?? defaultFields(provider))) {
    form.set(name, value)
  }
  form.set('fault', answer.fault ?? 'none')
  form.set('decision', answer.decision ?? 'allow')
  const back = await fetch(`${settings[provider].issuer}/authorize`, {
    method: 'POST',
    body: form,
    redirect: 'manual',
  })
  expect(back.status).toBe(303)
  const callback = new URL(back.headers.get('location')!)
  const sealed = sealSignIn(
    { kind: 'oauth', p: provider, ...flow, intent: 'sign-in', next: '/en/account/' },
    SECRET,
    now,
  )
  return { url, flow, params: callback.searchParams, sealed, now }
}

async function callback(
  provider: FakeProvider,
  started: { params: URLSearchParams; sealed: string; now: Date },
  sealed: string | null = started.sealed,
): Promise<CallbackResult> {
  return verifyCallback({
    provider,
    settings: settings[provider],
    sealed,
    secret: SECRET,
    now: started.now,
    params: started.params,
    redirectUri: REDIRECT,
  })
}

/** The error code oauth4webapi or the claim checks gave, from a failed callback. */
function failure(result: CallbackResult) {
  expect(result.ok).toBe(false)
  if (result.ok || result.error !== 'failed')
    throw new Error(`expected a failure, got ${JSON.stringify(result)}`)
  return (result.cause as { code?: string }).code
}

describe('the fake providers', () => {
  it('know the client the app uses with AUTH_TEST_ISSUER', () => {
    expect(FAKE_CLIENT).toEqual(TEST_CLIENT)
  })

  it('makes ORCID iDs with a valid check character', () => {
    for (let i = 0; i < 50; i++) expect(isOrcidId(fakeOrcidId())).toBe(true)
  })

  it('ORCID takes the client secret in the body only, as the real one does', async () => {
    const response = await fetch(`${settings.orcid.issuer}/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${TEST_CLIENT.id}:${TEST_CLIENT.secret}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'x' }),
    })
    expect(response.status).toBe(401)
  })
})

describe('signing in with Google', () => {
  it('asks for the address with PKCE, lets the person choose the account, and names nobody', async () => {
    const started = await signInAt('google')
    const query = started.url.searchParams
    expect(query.get('scope')).toBe('openid email')
    expect(query.get('code_challenge_method')).toBe('S256')
    expect(query.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(query.get('prompt')).toBe('select_account')
    expect(query.get('nonce')).toBe(started.flow.nonce)
    expect(query.get('state')).toBe(started.flow.state)
    expect(query.has('login_hint')).toBe(false)
    expect(started.flow.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const result = await callback('google', started)
    expect(result).toMatchObject({
      ok: true,
      identity: {
        provider: 'google',
        sub: '108234567890123456789',
        email: 'm-0123456789ab@example.org',
        ignored: null,
      },
    })
    // The code went back with the verifier and the client secret in the body.
    expect(fake.requests.find((request) => request.endpoint === 'token')).toMatchObject({
      provider: 'google',
      clientAuth: 'post',
      codeVerifier: true,
      status: 200,
    })
  })

  it('takes a Gmail address without a Workspace domain', async () => {
    const started = await signInAt('google', {
      fields: { sub: '1001', email: 'Someone.Else@Gmail.com', email_verified: 'true', hd: '' },
    })
    expect(await callback('google', started)).toMatchObject({
      ok: true,
      identity: { email: 'someone.else@gmail.com', ignored: null },
    })
  })

  it.each([
    ['non-authoritative-email', 'not-managed'],
    ['unverified-email', 'unverified'],
  ] as const)('with %s, takes no address and says why', async (fault, reason) => {
    const started = await signInAt('google', { fault })
    expect(await callback('google', started)).toMatchObject({
      ok: true,
      identity: { email: null, ignored: { email: 'm-0123456789ab@example.org', reason } },
    })
  })

  it('refuses a Google account ID that is not one', async () => {
    const started = await signInAt('google', {
      fields: { sub: 'not an id', email: '', hd: '' },
    })
    const result = await callback('google', started)
    expect(failure(result)).toBe('sub')
    expect(result.ok === false && result.error === 'failed' && result.cause).toBeInstanceOf(
      ClaimError,
    )
  })
})

describe('signing in with ORCID', () => {
  it('sends no PKCE (ORCID does not advertise it), and the client secret in the body', async () => {
    const started = await signInAt('orcid', {
      fields: { sub: '9999-0000-0000-0027', name: 'Josiah Carberry' },
    })
    const query = started.url.searchParams
    expect(query.get('scope')).toBe('openid')
    expect(query.has('code_challenge')).toBe(false)
    expect(query.has('prompt')).toBe(false)
    expect(query.get('nonce')).toBe(started.flow.nonce)
    expect(started.flow.verifier).toBeUndefined()

    expect(await callback('orcid', started)).toMatchObject({
      ok: true,
      identity: { provider: 'orcid', sub: '9999-0000-0000-0027', name: 'Josiah Carberry' },
    })
    expect(fake.requests.find((request) => request.endpoint === 'token')).toMatchObject({
      provider: 'orcid',
      clientAuth: 'post',
      codeVerifier: false,
      status: 200,
    })
  })

  it('keeps no name when the record has none', async () => {
    const started = await signInAt('orcid', { fields: { sub: '9999-0000-0000-0027' } })
    expect(await callback('orcid', started)).toMatchObject({ ok: true, identity: { name: null } })
  })

  it('refuses an iD with a wrong check character', async () => {
    const started = await signInAt('orcid', { fields: { sub: '9999-0000-0000-0028' } })
    expect(failure(await callback('orcid', started))).toBe('sub')
  })
})

// The faults the ID token can have: each one ends the sign-in, for both providers (the nonce is
// required for ORCID too).
const TOKEN_FAULTS = FAULTS.filter(
  (fault) => !['none', 'unverified-email', 'non-authoritative-email'].includes(fault),
)
const EXPECTED_CODE: Record<string, string> = {
  'wrong-nonce': oauth.JWT_CLAIM_COMPARISON,
  'no-nonce': oauth.INVALID_RESPONSE,
  'wrong-aud': oauth.JWT_CLAIM_COMPARISON,
  'wrong-iss': oauth.JWT_CLAIM_COMPARISON,
  expired: oauth.JWT_TIMESTAMP_CHECK,
}

describe.each(['google', 'orcid'] as const)('%s: a faulty answer signs nobody in', (provider) => {
  it.each(TOKEN_FAULTS)('%s', async (fault) => {
    const started = await signInAt(provider, { fault })
    const code = failure(await callback(provider, started))
    if (fault === 'bad-signature') expect(code).toBeDefined()
    else expect(code).toBe(EXPECTED_CODE[fault])
  })

  it('declined consent is "cancelled"', async () => {
    const started = await signInAt(provider, { decision: 'deny' })
    expect(started.params.get('error')).toBe('access_denied')
    expect(await callback(provider, started)).toMatchObject({ ok: false, error: 'cancelled' })
  })

  it('without the sign-in cookie, or with a changed one, the flow has expired', async () => {
    const started = await signInAt(provider)
    expect(await callback(provider, started, null)).toEqual({ ok: false, error: 'expired' })
    const chars = [...started.sealed]
    chars[20] = chars[20] === 'A' ? 'B' : 'A'
    expect(await callback(provider, started, chars.join(''))).toEqual({
      ok: false,
      error: 'expired',
    })
    // Nothing was exchanged.
    expect(fake.requests.some((request) => request.endpoint === 'token')).toBe(false)
  })

  it("another flow's answer (its state) has expired too, and is not exchanged", async () => {
    const started = await signInAt(provider)
    const other = await signInAt(provider)
    expect(await callback(provider, { ...started, sealed: other.sealed })).toMatchObject({
      ok: false,
      error: 'expired',
    })
    expect(fake.requests.some((request) => request.endpoint === 'token')).toBe(false)
  })

  it('a cookie of the other provider has expired', async () => {
    const started = await signInAt(provider)
    const other = provider === 'google' ? 'orcid' : 'google'
    const sealed = sealSignIn(
      { kind: 'oauth', p: other, ...started.flow, intent: 'sign-in', next: '/en/account/' },
      SECRET,
      started.now,
    )
    expect(await callback(provider, started, sealed)).toEqual({ ok: false, error: 'expired' })
  })

  it('a code works once', async () => {
    const started = await signInAt(provider)
    expect((await callback(provider, started)).ok).toBe(true)
    const again = await callback(provider, started)
    expect(failure(again)).toBe(oauth.RESPONSE_BODY_ERROR)
    expect(oauthErrorCode(again.ok === false && again.error === 'failed' && again.cause)).toBe(
      'invalid_grant',
    )
  })
})

describe('a provider that cannot be reached', () => {
  it('fails the start, which the route reports', async () => {
    const config = memberAuthConfig({ AUTH_TEST_ISSUER: 'http://127.0.0.1:9' })
    if (!config.google.on) throw new Error('the test issuer is not on')
    await expect(authorizationRequest('google', config.google, REDIRECT)).rejects.toThrow()
  })
})

describe('orcidName', () => {
  it.each([
    [{ name: 'Josiah Carberry' }, 'Josiah Carberry'],
    [{ given_name: 'Josiah', family_name: 'Carberry' }, 'Josiah Carberry'],
    [{ given_name: 'Josiah' }, 'Josiah'],
    [{ name: '  Ayşe\u0000  Yılmaz\n' }, 'Ayşe Yılmaz'],
    [{ name: 'evil\u202Etxt.exe' }, 'evil txt.exe'],
    [{ name: 'x'.repeat(81) }, null],
    [{ name: 'x'.repeat(101), given_name: 'Ada', family_name: 'Lovelace' }, 'Ada Lovelace'],
    [{ name: 42 }, null],
    [{}, null],
  ])('%j → %j', (claims, expected) => {
    expect(orcidName(claims)).toBe(expected)
  })
})

describe('oauthErrorCode', () => {
  it('keeps only a plain OAuth error code for the log', () => {
    expect(oauthErrorCode({ error: 'access_denied' })).toBe('access_denied')
    expect(oauthErrorCode({ error: 'm-01@example.org' })).toBeNull()
    expect(oauthErrorCode({ error: 'a'.repeat(41) })).toBeNull()
    expect(oauthErrorCode(new Error('x'))).toBeNull()
    expect(oauthErrorCode(null)).toBeNull()
  })
})
