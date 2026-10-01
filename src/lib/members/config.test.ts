import { describe, expect, it } from 'vitest'

import {
  GOOGLE_ISSUER,
  ORCID_ISSUER,
  ORCID_SANDBOX_ISSUER,
  TEST_CLIENT,
  anySignIn,
  describeMemberAuth,
  memberAuthConfig,
} from './config'

const ALTCHA = 'test-only-hmac-key-0123456789abcdef0123456789abcdef'
const GOOGLE = { GOOGLE_CLIENT_ID: 'google-client', GOOGLE_CLIENT_SECRET: 'google-secret' }
const ORCID = { ORCID_CLIENT_ID: 'APP-TEST', ORCID_CLIENT_SECRET: 'orcid-secret' }
const PRODUCTION = { PAYLOAD_JOBS_AUTORUN: 'true' }

describe('memberAuthConfig', () => {
  it('has every method off without settings (production today)', () => {
    const config = memberAuthConfig({ ...PRODUCTION })
    expect(config).toEqual({
      google: { on: false, reason: 'not-configured' },
      orcid: { on: false, reason: 'not-configured' },
      email: { on: false, reason: 'no-smtp' },
      problems: [],
    })
    expect(anySignIn(config)).toBe(false)
    expect(describeMemberAuth(config)).toBe('Member sign-in: email off, google off, orcid off')
  })

  it('switches Google on with both of its settings', () => {
    expect(memberAuthConfig({ ...GOOGLE }).google).toEqual({
      on: true,
      reason: 'configured',
      issuer: GOOGLE_ISSUER,
      clientId: 'google-client',
      clientSecret: 'google-secret',
      insecure: false,
    })
    expect(memberAuthConfig({ GOOGLE_CLIENT_ID: 'google-client' }).google.on).toBe(false)
    expect(memberAuthConfig({ GOOGLE_CLIENT_SECRET: 'google-secret' }).google.on).toBe(false)
  })

  it('leaves the placeholders of the example files off', () => {
    const config = memberAuthConfig({
      GOOGLE_CLIENT_ID: 'replace-with-the-client-id',
      GOOGLE_CLIENT_SECRET: 'replace-with-the-secret',
      ORCID_CLIENT_ID: ' ',
      ORCID_CLIENT_SECRET: 'orcid-secret',
    })
    expect(config.google.on).toBe(false)
    expect(config.orcid.on).toBe(false)
  })

  it('takes ORCID’s own issuer by default, and the sandbox outside production only', () => {
    expect(memberAuthConfig({ ...ORCID }).orcid).toMatchObject({ on: true, issuer: ORCID_ISSUER })
    expect(memberAuthConfig({ ...ORCID, ORCID_ISSUER: 'https://orcid.org/' }).orcid).toMatchObject({
      on: true,
      issuer: ORCID_ISSUER,
    })
    expect(memberAuthConfig({ ...ORCID, ORCID_ISSUER: ORCID_SANDBOX_ISSUER }).orcid).toMatchObject({
      on: true,
      issuer: ORCID_SANDBOX_ISSUER,
    })

    const production = memberAuthConfig({
      ...ORCID,
      ...PRODUCTION,
      ORCID_ISSUER: ORCID_SANDBOX_ISSUER,
    })
    expect(production.orcid).toEqual({ on: false, reason: 'sandbox-in-production' })
    expect(production.problems).toHaveLength(1)
    expect(production.problems[0]).toContain('ORCID_ISSUER')

    const other = memberAuthConfig({ ...ORCID, ORCID_ISSUER: 'https://orcid.example.org' })
    expect(other.orcid).toEqual({ on: false, reason: 'unknown-issuer' })
    expect(other.problems.join(' ')).not.toContain('orcid.example.org')
  })

  it('switches email links on with a mail server and the spam check', () => {
    expect(memberAuthConfig({ SMTP_HOST: '127.0.0.1', ALTCHA_HMAC_KEY: ALTCHA }).email).toEqual({
      on: true,
      reason: 'configured',
    })
    expect(memberAuthConfig({ SMTP_HOST: '127.0.0.1' }).email).toEqual({
      on: false,
      reason: 'no-altcha',
    })
    expect(memberAuthConfig({ ALTCHA_HMAC_KEY: ALTCHA }).email).toEqual({
      on: false,
      reason: 'no-smtp',
    })
  })

  it('points both providers at the fake ones with AUTH_TEST_ISSUER on this computer', () => {
    const config = memberAuthConfig({ ...GOOGLE, AUTH_TEST_ISSUER: 'http://127.0.0.1:9400/' })
    expect(config.google).toEqual({
      on: true,
      reason: 'test-issuer',
      issuer: 'http://127.0.0.1:9400/google',
      clientId: TEST_CLIENT.id,
      clientSecret: TEST_CLIENT.secret,
      insecure: true,
    })
    expect(config.orcid).toMatchObject({
      on: true,
      issuer: 'http://127.0.0.1:9400/orcid',
      insecure: true,
    })
    for (const base of ['http://localhost:9400', 'http://[::1]:9400']) {
      expect(memberAuthConfig({ AUTH_TEST_ISSUER: base }).google).toMatchObject({
        on: true,
        reason: 'test-issuer',
      })
    }
  })

  it('ignores AUTH_TEST_ISSUER on the production server, with one problem line', () => {
    const config = memberAuthConfig({
      ...PRODUCTION,
      ...GOOGLE,
      AUTH_TEST_ISSUER: 'http://127.0.0.1:9400',
    })
    expect(config.google).toMatchObject({ on: true, reason: 'configured', issuer: GOOGLE_ISSUER })
    expect(config.orcid.on).toBe(false)
    expect(config.problems).toEqual([
      'AUTH_TEST_ISSUER is ignored where PAYLOAD_JOBS_AUTORUN is "true".',
    ])
  })

  it('ignores an AUTH_TEST_ISSUER that is not on this computer', () => {
    for (const value of [
      'https://issuer.example.org',
      'http://10.0.0.5:9400',
      'http://localhost.example.org:9400',
      'file:///etc/passwd',
      'not a url',
    ]) {
      const config = memberAuthConfig({ AUTH_TEST_ISSUER: value })
      expect(config.google.on, value).toBe(false)
      expect(config.orcid.on, value).toBe(false)
      expect(config.problems, value).toHaveLength(1)
      expect(config.problems[0]).not.toContain(value)
    }
  })

  // That deploy/compose.prod.yml and deploy/.env.example never name AUTH_TEST_ISSUER is checked
  // with the other deploy files in src/lib/access.test.ts.
})
