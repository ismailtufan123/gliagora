import { canSendEmail } from '@/lib/email/settings'
import { altchaKey } from '@/lib/forms/altcha'

import { isLoopbackHostname } from './origin'

// Which ways of signing in are switched on (M4b, D49; the M4b design §9). Each switches on by
// itself once its settings exist, so production keeps answering "Signing in is not available yet"
// until the operator sets the keys on the server (only with the operator's go-ahead):
// - Google: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET;
// - ORCID: ORCID_CLIENT_ID and ORCID_CLIENT_SECRET, with ORCID_ISSUER (https://orcid.org by
//   default; ORCID's sandbox only where PAYLOAD_JOBS_AUTORUN is not "true", so no sandbox identity
//   ever reaches the production database);
// - email links: a mail server (SMTP_HOST) and the spam check (ALTCHA_HMAC_KEY), as the other
//   forms that send email.
// AUTH_TEST_ISSUER points both providers at the fake ones of the tests (CI and local runs; they
// come with Google and ORCID sign-in, in tests/fake-oidc/). It is honoured only on this
// computer's addresses and never where PAYLOAD_JOBS_AUTORUN is "true" (the production server,
// which never names it either: a unit test reads deploy/compose.prod.yml and deploy/.env.example).
// Unusable settings switch a method off with a problem that names the variable, never its value;
// the app never stops for them (a crash would trigger the automatic rollback of a deploy).

type Env = Record<string, string | undefined>

export type Provider = 'google' | 'orcid'

export const GOOGLE_ISSUER = 'https://accounts.google.com'
export const ORCID_ISSUER = 'https://orcid.org'
export const ORCID_SANDBOX_ISSUER = 'https://sandbox.orcid.org'

/** The client the tests' fake providers know: test-only values, not secrets. */
export const TEST_CLIENT = { id: 'gliagora-test', secret: 'test-secret' } as const

export type OffReason =
  'not-configured' | 'sandbox-in-production' | 'unknown-issuer' | 'no-smtp' | 'no-altcha'

export type Off = { on: false; reason: OffReason }

export type ProviderOn = {
  on: true
  reason: 'configured' | 'test-issuer'
  issuer: string
  clientId: string
  clientSecret: string
  /** Plain-http issuer: only the fake providers on this computer. */
  insecure: boolean
}

export type MemberAuthConfig = {
  google: ProviderOn | Off
  orcid: ProviderOn | Off
  email: { on: true; reason: 'configured' } | Off
  /** One line per unusable setting, for the log: names, never values. */
  problems: string[]
}

const isProduction = (env: Env) => env.PAYLOAD_JOBS_AUTORUN === 'true'

/** A setting that is set and not still the `replace-with…` placeholder of an example file. */
function setting(env: Env, name: string): string | null {
  const value = env[name]?.trim() ?? ''
  return value !== '' && !value.startsWith('replace-with') ? value : null
}

/** The test issuers' base, or null; problems for an AUTH_TEST_ISSUER that is not honoured. */
function testIssuerBase(env: Env, problems: string[]): string | null {
  const value = env.AUTH_TEST_ISSUER?.trim()
  if (!value) return null
  if (isProduction(env)) {
    problems.push('AUTH_TEST_ISSUER is ignored where PAYLOAD_JOBS_AUTORUN is "true".')
    return null
  }
  let url: URL | null = null
  try {
    url = new URL(value)
  } catch {
    url = null
  }
  if (!url || !['http:', 'https:'].includes(url.protocol) || !isLoopbackHostname(url.hostname)) {
    problems.push('AUTH_TEST_ISSUER is ignored: it must be an address on this computer.')
    return null
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

function testProvider(base: string, provider: Provider): ProviderOn {
  return {
    on: true,
    reason: 'test-issuer',
    issuer: `${base}/${provider}`,
    clientId: TEST_CLIENT.id,
    clientSecret: TEST_CLIENT.secret,
    insecure: base.startsWith('http:'),
  }
}

function credentials(env: Env, prefix: 'GOOGLE' | 'ORCID') {
  const clientId = setting(env, `${prefix}_CLIENT_ID`)
  const clientSecret = setting(env, `${prefix}_CLIENT_SECRET`)
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

/**
 * Which ways of signing in are on, from the environment. Read by dynamic pages and routes at
 * request time: the image is built without the server's settings, so nothing static may depend on
 * it.
 */
export function memberAuthConfig(env: Env = process.env): MemberAuthConfig {
  const problems: string[] = []
  const test = testIssuerBase(env, problems)

  let google: MemberAuthConfig['google'] = { on: false, reason: 'not-configured' }
  const googleClient = credentials(env, 'GOOGLE')
  if (test) google = testProvider(test, 'google')
  else if (googleClient) {
    google = {
      on: true,
      reason: 'configured',
      issuer: GOOGLE_ISSUER,
      insecure: false,
      ...googleClient,
    }
  }

  let orcid: MemberAuthConfig['orcid'] = { on: false, reason: 'not-configured' }
  const orcidClient = credentials(env, 'ORCID')
  if (test) orcid = testProvider(test, 'orcid')
  else if (orcidClient) {
    const issuer = (env.ORCID_ISSUER?.trim() || ORCID_ISSUER).replace(/\/+$/, '')
    if (issuer === ORCID_ISSUER || (issuer === ORCID_SANDBOX_ISSUER && !isProduction(env))) {
      orcid = { on: true, reason: 'configured', issuer, insecure: false, ...orcidClient }
    } else if (issuer === ORCID_SANDBOX_ISSUER) {
      orcid = { on: false, reason: 'sandbox-in-production' }
      problems.push(
        'ORCID sign-in is off: ORCID_ISSUER is the sandbox, which is refused where PAYLOAD_JOBS_AUTORUN is "true".',
      )
    } else {
      orcid = { on: false, reason: 'unknown-issuer' }
      problems.push(
        `ORCID sign-in is off: ORCID_ISSUER is neither ${ORCID_ISSUER} nor the sandbox.`,
      )
    }
  }

  const email: MemberAuthConfig['email'] = !canSendEmail(env)
    ? { on: false, reason: 'no-smtp' }
    : !altchaKey(env)
      ? { on: false, reason: 'no-altcha' }
      : { on: true, reason: 'configured' }

  return { google, orcid, email, problems }
}

/** Whether any way of signing in is on (otherwise: "Signing in is not available yet"). */
export const anySignIn = (config: MemberAuthConfig) =>
  config.google.on || config.orcid.on || config.email.on

/** The startup line: which methods are on, by name only. */
export function describeMemberAuth(config: MemberAuthConfig): string {
  const state = (method: { on: boolean }) => (method.on ? 'on' : 'off')
  return `Member sign-in: email ${state(config.email)}, google ${state(config.google)}, orcid ${state(config.orcid)}`
}
