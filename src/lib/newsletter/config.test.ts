import { describe, expect, it } from 'vitest'

import { describeNewsletter, listmonkSettings, newsletterConfig } from './config'

// Which parts of Glia Notes are on (src/lib/newsletter/config.ts): each switches on by itself once
// its settings exist, and an unusable setting is named, never its value.

const TOKEN = 'c0ffee'.repeat(10)
const LISTMONK = { LISTMONK_URL: 'http://listmonk:9000/', LISTMONK_API_TOKEN: TOKEN }
const ALL = { ...LISTMONK, SMTP_HOST: '127.0.0.1', ALTCHA_HMAC_KEY: 'k'.repeat(64) }

describe('newsletterConfig', () => {
  it('is off without listmonk settings, with no problem to report', () => {
    const config = newsletterConfig({ SMTP_HOST: '127.0.0.1', ALTCHA_HMAC_KEY: 'k'.repeat(64) })
    expect(config).toEqual({
      listmonk: null,
      signup: { on: false, reason: 'no-listmonk' },
      problems: [],
    })
    expect(describeNewsletter(config)).toBe(
      'Glia Notes: signup off (no listmonk settings), unsubscribe off',
    )
  })

  it('needs a mail server and the spam check for the signup, listmonk alone to unsubscribe', () => {
    expect(describeNewsletter(newsletterConfig(LISTMONK))).toBe(
      'Glia Notes: signup off (no mail server), unsubscribe on',
    )
    expect(describeNewsletter(newsletterConfig({ ...LISTMONK, SMTP_HOST: 'mail' }))).toBe(
      'Glia Notes: signup off (no spam-check key), unsubscribe on',
    )
    const on = newsletterConfig(ALL)
    expect(describeNewsletter(on)).toBe('Glia Notes: signup on, unsubscribe on')
    expect(on.listmonk).toEqual({ url: 'http://listmonk:9000', user: 'gliagora-app', token: TOKEN })
  })

  it('takes another API user, and leaves the placeholders of the example files off', () => {
    expect(listmonkSettings({ ...LISTMONK, LISTMONK_API_USER: 'other-app' })?.user).toBe(
      'other-app',
    )
    expect(
      newsletterConfig({ ...ALL, LISTMONK_API_TOKEN: 'replace-with-openssl-rand-hex-32' }).listmonk,
    ).toBeNull()
  })

  it('names an unusable setting, never its value', () => {
    for (const [env, problem] of [
      [{ LISTMONK_URL: 'http://listmonk:9000' }, /LISTMONK_URL is set, LISTMONK_API_TOKEN is not/],
      [{ LISTMONK_API_TOKEN: TOKEN }, /LISTMONK_API_TOKEN is set, LISTMONK_URL is not/],
      [{ ...LISTMONK, LISTMONK_URL: 'listmonk:9000' }, /LISTMONK_URL is not an http/],
      [{ ...LISTMONK, LISTMONK_URL: 'ftp://listmonk' }, /LISTMONK_URL is not an http/],
      [{ ...LISTMONK, LISTMONK_URL: 'http://u:p@listmonk:9000' }, /LISTMONK_URL is not an http/],
      [{ ...LISTMONK, LISTMONK_API_TOKEN: 'short' }, /LISTMONK_API_TOKEN must be/],
      [{ ...LISTMONK, LISTMONK_API_TOKEN: `${TOKEN}\nX-Evil: 1` }, /LISTMONK_API_TOKEN must be/],
      [{ ...LISTMONK, LISTMONK_API_USER: 'gliagora app' }, /LISTMONK_API_USER is not/],
    ] as const) {
      const config = newsletterConfig({
        ...env,
        SMTP_HOST: 'mail',
        ALTCHA_HMAC_KEY: 'k'.repeat(64),
      })
      expect(config.listmonk, JSON.stringify(env)).toBeNull()
      expect(config.signup).toEqual({ on: false, reason: 'no-listmonk' })
      expect(config.problems).toEqual([expect.stringMatching(problem)])
      expect(config.problems.join(' ')).not.toContain(TOKEN)
      expect(config.problems.join(' ')).not.toContain('listmonk:9000')
    }
  })
})
