import * as oauth from 'oauth4webapi'

import { errorCode, errorSummary } from '@/lib/errors'

import type { Provider, ProviderOn } from './config'
import { DISPLAY_NAME_MAX, UNSAFE_IN_NAME } from './display-name'
import { normaliseEmail } from './email-address'
import { googleEmail, isGoogleSubject, isOrcidSubject } from './identity'
import { type SignInState, openSignIn } from './seal'
import { sameSecret } from './tokens'

// Signing in with Google and ORCID (M4b, D49; the M4b design §7.2, §8): OpenID Connect's
// authorization code flow through oauth4webapi (panva; OpenID Certified, no dependencies). The
// browser goes to the provider with `state` (this flow, against login CSRF), `nonce` (this ID
// token) and, where the provider's discovery advertises S256, a PKCE challenge (Google does;
// ORCID does not, so it gets none: state and nonce protect that flow). Back at the callback, our
// server exchanges the code for an ID token with the client secret in the request body (the one
// method ORCID supports), checks the token's issuer, audience, expiry and nonce, and its signature
// against the provider's published keys. The access token is discarded: no other request is
// made. Nothing about the person goes to the provider; the provider tells us who they are.
//
// The nonce is always required, for ORCID too: if a provider stopped echoing it, every sign-in
// with it would fail (and say so in the log) rather than go on without that check. Discovery
// documents are kept for 24 hours and the signing keys as oauth4webapi caches them (5 minutes, or
// at once when a token names a key it does not know). Every request to a provider gives up after
// 10 seconds. Plain http is allowed only for the fake providers of the tests (AUTH_TEST_ISSUER,
// config.ts), which only ever run on this computer.

export const OIDC_TIMEOUT_MS = 10_000
export const DISCOVERY_TTL_MS = 24 * 60 * 60_000

/** What we ask each provider for: an ID token, and from Google the email address. */
export const SCOPES: Record<Provider, string> = { google: 'openid email', orcid: 'openid' }

const NAME_PART_MAX = 100

/** Options of every request to a provider: the time limit, and plain http for the fakes only. */
const requestOptions = (settings: ProviderOn) => ({
  signal: () => AbortSignal.timeout(OIDC_TIMEOUT_MS),
  ...(settings.insecure ? { [oauth.allowInsecureRequests]: true } : {}),
})

const client = (settings: ProviderOn): oauth.Client => ({
  client_id: settings.clientId,
  id_token_signed_response_alg: 'RS256',
})

const discoveries = new Map<string, { at: number; server: Promise<oauth.AuthorizationServer> }>()
const jwksCaches = new Map<string, oauth.JWKSCacheInput>()

async function fetchDiscovery(settings: ProviderOn): Promise<oauth.AuthorizationServer> {
  const issuer = new URL(settings.issuer)
  const response = await oauth.discoveryRequest(issuer, requestOptions(settings))
  // The document must name exactly this issuer (oauth4webapi compares it).
  const server = await oauth.processDiscoveryResponse(issuer, response)
  const endpoint = server.authorization_endpoint
  let url: URL | null = null
  try {
    url = endpoint ? new URL(endpoint) : null
  } catch {
    url = null
  }
  if (!url || (url.protocol !== 'https:' && !(settings.insecure && url.protocol === 'http:'))) {
    throw new oauth.OperationProcessingError('unusable authorization_endpoint', {
      code: oauth.INVALID_SERVER_METADATA,
    })
  }
  if (typeof server.token_endpoint !== 'string' || typeof server.jwks_uri !== 'string') {
    throw new oauth.OperationProcessingError('incomplete discovery document', {
      code: oauth.MISSING_SERVER_METADATA,
    })
  }
  return server
}

/** The provider's discovery document, fetched once a day (only successes are kept). */
export function discover(
  settings: ProviderOn,
  now = Date.now(),
): Promise<oauth.AuthorizationServer> {
  const cached = discoveries.get(settings.issuer)
  if (cached && now - cached.at < DISCOVERY_TTL_MS) return cached.server
  const server = fetchDiscovery(settings)
  discoveries.set(settings.issuer, { at: now, server })
  server.catch(() => {
    if (discoveries.get(settings.issuer)?.server === server) discoveries.delete(settings.issuer)
  })
  return server
}

/** Forgets the cached discovery documents and keys (tests). */
export function forgetProviders() {
  discoveries.clear()
  jwksCaches.clear()
}

/** What the sign-in cookie keeps of a flow: compared or sent again at the callback. */
export type FlowSecrets = { state: string; nonce: string; verifier?: string }

/**
 * Where to send the browser to sign in at the provider, and the secrets of this flow (sealed into
 * the sign-in cookie). Never a `login_hint`: we tell the provider nothing about the person. Google
 * is asked to let the person choose the account (`prompt=select_account`), so someone with several
 * Google accounts is not signed in with whichever one the browser used last.
 */
export async function authorizationRequest(
  provider: Provider,
  settings: ProviderOn,
  redirectUri: string,
): Promise<{ url: URL; flow: FlowSecrets }> {
  const server = await discover(settings)
  const state = oauth.generateRandomState()
  const nonce = oauth.generateRandomNonce()
  const pkce = server.code_challenge_methods_supported?.includes('S256') === true
  const verifier = pkce ? oauth.generateRandomCodeVerifier() : undefined
  const url = new URL(server.authorization_endpoint!)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', settings.clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', SCOPES[provider])
  url.searchParams.set('state', state)
  url.searchParams.set('nonce', nonce)
  if (verifier) {
    url.searchParams.set('code_challenge', await oauth.calculatePKCECodeChallenge(verifier))
    url.searchParams.set('code_challenge_method', 'S256')
  }
  if (provider === 'google') url.searchParams.set('prompt', 'select_account')
  return { url, flow: { state, nonce, ...(verifier ? { verifier } : {}) } }
}

/** Who the provider says the person is, after every check. */
export type VerifiedIdentity =
  | {
      provider: 'google'
      sub: string
      /** Only an address Google is authoritative for (identity.ts `googleEmail`). */
      email: string | null
      /** An address Google sent that the account does not take, for the confirm page's note. */
      ignored: { email: string; reason: 'unverified' | 'not-managed' } | null
    }
  | {
      provider: 'orcid'
      sub: string
      /** The record's name, cleaned and short enough to be a display name, or null. */
      name: string | null
    }

/** Why a callback cannot sign anyone in. */
export type CallbackFailure =
  /** No usable sign-in cookie: missing, changed, expired, for another provider or another flow. */
  | { ok: false; error: 'expired'; flow?: OAuthFlow }
  /** The person declined at the provider (`error=access_denied`). */
  | { ok: false; error: 'cancelled'; flow: OAuthFlow }
  /** Anything else: the provider's error, a check that failed, an unreachable provider. */
  | { ok: false; error: 'failed'; flow: OAuthFlow; cause: unknown }

export type OAuthFlow = Extract<SignInState, { kind: 'oauth' }>

export type CallbackResult =
  { ok: true; flow: OAuthFlow; identity: VerifiedIdentity } | CallbackFailure

/** A claim that is not what the provider promised (logged by class only, never its value). */
export class ClaimError extends Error {
  override name = 'ClaimError'
  readonly code: string
  constructor(code: string) {
    super(`Unusable ID token claim (${code})`)
    this.code = code
  }
}

/** Every character of UNSAFE_IN_NAME, to replace them all. */
const UNSAFE_IN_NAME_ALL = new RegExp(UNSAFE_IN_NAME, 'gu')

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.normalize('NFC').replace(UNSAFE_IN_NAME_ALL, ' ').replace(/\s+/gu, ' ').trim()
  return text !== '' && text.length <= NAME_PART_MAX ? text : null
}

/**
 * The name on an ORCID record, as a display name the member may choose to keep: `name`, or else
 * the given and family names; cleaned of control characters, and null when there is none or it is
 * longer than a display name may be.
 */
export function orcidName(claims: { name?: unknown; given_name?: unknown; family_name?: unknown }) {
  const name =
    cleanName(claims.name) ??
    ([cleanName(claims.given_name), cleanName(claims.family_name)].filter(Boolean).join(' ') ||
      null)
  return name !== null && name.length <= DISPLAY_NAME_MAX ? name : null
}

/** The identity in a validated ID token's claims, or a ClaimError. */
export function identityFromClaims(provider: Provider, claims: oauth.IDToken): VerifiedIdentity {
  if (provider === 'google') {
    if (!isGoogleSubject(claims.sub)) throw new ClaimError('sub')
    const email = googleEmail(claims as Record<string, unknown>)
    const sent = typeof claims.email === 'string' ? normaliseEmail(claims.email) : null
    return {
      provider,
      sub: claims.sub,
      email,
      ignored:
        email === null && sent !== null
          ? { email: sent, reason: claims.email_verified === true ? 'not-managed' : 'unverified' }
          : null,
    }
  }
  if (!isOrcidSubject(claims.sub)) throw new ClaimError('sub')
  return { provider, sub: claims.sub, name: orcidName(claims as Record<string, unknown>) }
}

/**
 * oauth4webapi's error classes by a fixed name. The library names its errors after their class
 * (`this.name = this.constructor.name`), which the production build minifies to one letter, so
 * the log would say `E OAUTH_…`; instanceof still works there.
 */
const OAUTH_ERRORS: readonly [new (...args: never[]) => Error, string][] = [
  [oauth.OperationProcessingError, 'OperationProcessingError'],
  [oauth.ResponseBodyError, 'ResponseBodyError'],
  [oauth.AuthorizationResponseError, 'AuthorizationResponseError'],
  [oauth.WWWAuthenticateChallengeError, 'WWWAuthenticateChallengeError'],
  [oauth.UnsupportedOperationError, 'UnsupportedOperationError'],
]

/** The class of an oauth4webapi error, by its fixed name, or null for any other error. */
export function oauthErrorName(error: unknown): string | null {
  return OAUTH_ERRORS.find(([kind]) => error instanceof kind)?.[1] ?? null
}

/**
 * A failure for the log: the error's class and code (`OperationProcessingError
 * OAUTH_JWT_CLAIM_COMPARISON_FAILED`), never its message, as `errorSummary` does for other errors.
 */
export function failureSummary(error: unknown): string {
  const name = oauthErrorName(error)
  return name ? [name, errorCode(error)].filter(Boolean).join(' ') : errorSummary(error)
}

/** The provider's OAuth error code, for the log: only a plain code, never other text. */
export function oauthErrorCode(error: unknown): string | null {
  const code = (error as { error?: unknown } | null)?.error
  return typeof code === 'string' && /^[a-z_]{1,40}$/.test(code) ? code : null
}

/**
 * The callback: opens this browser's sign-in cookie (it must hold a flow with this provider), checks
 * the provider's answer against it, exchanges the code and checks the ID token. Never throws: a
 * failure says what to show, and carries the error for the log.
 */
export async function verifyCallback({
  provider,
  settings,
  sealed,
  secret,
  now,
  params,
  redirectUri,
}: {
  provider: Provider
  settings: ProviderOn
  /** The sign-in cookie's value. */
  sealed: string | null | undefined
  secret: string
  now: Date
  /** The callback's query. */
  params: URLSearchParams
  redirectUri: string
}): Promise<CallbackResult> {
  const flow = openSignIn(sealed, secret, now, 'oauth')
  if (!flow || flow.p !== provider) return { ok: false, error: 'expired' }
  // Another flow's answer (an older tab, or a link someone else started): this browser did not
  // ask for it.
  const state = params.get('state')
  if (state === null || !sameSecret(state, flow.state)) return { ok: false, error: 'expired', flow }
  try {
    const server = await discover(settings)
    const checked = oauth.validateAuthResponse(server, client(settings), params, flow.state)
    const response = await oauth.authorizationCodeGrantRequest(
      server,
      client(settings),
      oauth.ClientSecretPost(settings.clientSecret),
      checked,
      redirectUri,
      flow.verifier ?? oauth.nopkce,
      requestOptions(settings),
    )
    const result = await oauth.processAuthorizationCodeResponse(
      server,
      client(settings),
      response,
      {
        expectedNonce: flow.nonce,
        requireIdToken: true,
      },
    )
    let cache = jwksCaches.get(settings.issuer)
    if (!cache) jwksCaches.set(settings.issuer, (cache = {}))
    await oauth.validateApplicationLevelSignature(server, response, {
      ...requestOptions(settings),
      [oauth.jwksCache]: cache,
    })
    const claims = oauth.getValidatedIdTokenClaims(result)
    if (!claims) throw new ClaimError('id_token')
    return { ok: true, flow, identity: identityFromClaims(provider, claims) }
  } catch (error) {
    if (error instanceof oauth.AuthorizationResponseError && error.error === 'access_denied') {
      return { ok: false, error: 'cancelled', flow }
    }
    return { ok: false, error: 'failed', flow, cause: error }
  }
}
