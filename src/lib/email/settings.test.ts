import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_SENDER, canSendEmail, parseAddress, smtpSettings } from './settings'

describe('parseAddress', () => {
  it('reads a name and an address, or a bare address', () => {
    expect(parseAddress('Gliagora <hello@gliagora.com>')).toEqual({
      name: 'Gliagora',
      address: 'hello@gliagora.com',
    })
    expect(parseAddress('"Gliagora | Neuroscience" <hello@gliagora.com>')).toEqual({
      name: 'Gliagora | Neuroscience',
      address: 'hello@gliagora.com',
    })
    expect(parseAddress(' hello@gliagora.com ')).toEqual({
      name: 'Gliagora',
      address: 'hello@gliagora.com',
    })
  })

  it('refuses what is not an address', () => {
    expect(parseAddress('Gliagora')).toBeNull()
    expect(parseAddress('Gliagora <hello>')).toBeNull()
    expect(parseAddress('hello @gliagora.com')).toBeNull()
    expect(parseAddress('')).toBeNull()
  })
})

describe('smtpSettings', () => {
  it('is null without SMTP_HOST: nothing is sent', () => {
    expect(smtpSettings({})).toBeNull()
    expect(smtpSettings({ SMTP_HOST: '  ', SMTP_USER: 'x' })).toBeNull()
    expect(canSendEmail({})).toBe(false)
    expect(canSendEmail({ SMTP_HOST: '' })).toBe(false)
    expect(canSendEmail({ SMTP_HOST: 'smtp.example.org' })).toBe(true)
  })

  it('sends through a relay with STARTTLS required on port 587, from hello@gliagora.com by default', () => {
    expect(smtpSettings({ SMTP_HOST: 'smtp.example.org' })).toEqual({
      host: 'smtp.example.org',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: null,
      from: DEFAULT_SENDER,
    })
    expect(DEFAULT_SENDER).toEqual({ name: 'Gliagora', address: 'hello@gliagora.com' })
  })

  it('uses TLS from the start on port 465 with SMTP_SECURE, and signs in with SMTP_USER', () => {
    expect(
      smtpSettings({
        SMTP_HOST: 'smtp.example.org',
        SMTP_SECURE: 'true',
        SMTP_USER: 'relay-user',
        SMTP_PASS: 'relay-password',
        EMAIL_FROM: 'Gliagora <hello@gliagora.com>',
      }),
    ).toMatchObject({
      port: 465,
      secure: true,
      requireTLS: false,
      auth: { user: 'relay-user', pass: 'relay-password' },
      from: { name: 'Gliagora', address: 'hello@gliagora.com' },
    })
  })

  it('needs no TLS for Mailpit on this computer', () => {
    expect(smtpSettings({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025' })).toMatchObject({
      port: 1025,
      requireTLS: false,
    })
    expect(smtpSettings({ SMTP_HOST: 'localhost', SMTP_PORT: '1025' })?.requireTLS).toBe(false)
  })

  it('falls back to the defaults for unusable values, naming the variable but never its value', () => {
    const warn = vi.fn()
    const settings = smtpSettings(
      { SMTP_HOST: 'smtp.example.org', SMTP_PORT: 'twenty-five', EMAIL_FROM: 'Gliagora' },
      warn,
    )
    expect(settings).toMatchObject({ port: 587, from: DEFAULT_SENDER })
    expect(warn).toHaveBeenCalledTimes(2)
    for (const [message] of warn.mock.calls) {
      expect(message).not.toContain('twenty-five')
      expect(message).toMatch(/^(SMTP_PORT|EMAIL_FROM) /)
    }
    expect(smtpSettings({ SMTP_HOST: 'h.example.org', SMTP_PORT: '70000' }, warn)?.port).toBe(587)
  })
})
