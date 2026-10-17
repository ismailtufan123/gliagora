import { describe, expect, it } from 'vitest'

import { campaignsSettings } from '../config'
import { describeIssuePush, pushSettings, sendRate } from './settings'

describe("the issues' sending rate (deploy/listmonk/settings.sql computes the same)", () => {
  it('keeps a tenth of the mailbox and twice the forms’ cap for everything else', () => {
    // 500 an hour: 450 minus twice 50 (the forms' links and as many welcome emails).
    expect(sendRate({ mailboxHour: 500, mailboxDay: null, capHour: 50, capDay: 200 })).toEqual({
      rate: 350,
      windowHours: 1,
    })
    // 2000 a day: 1800 minus twice 150, in one window of a day.
    expect(sendRate({ mailboxHour: null, mailboxDay: 2000, capHour: 40, capDay: 150 })).toEqual({
      rate: 1500,
      windowHours: 24,
    })
  })

  it('with both limits, spaces the hourly bursts so that a day stays within its share', () => {
    // Hour: 540 − 100 = 440; day: 1350 − 400 = 950; two windows of 440 a day fit, so 12 hours.
    expect(sendRate({ mailboxHour: 600, mailboxDay: 1500, capHour: 50, capDay: 200 })).toEqual({
      rate: 440,
      windowHours: 12,
    })
    // A generous daily limit leaves the hourly rhythm alone.
    expect(sendRate({ mailboxHour: 300, mailboxDay: 50_000, capHour: 20, capDay: 200 })).toEqual({
      rate: 230,
      windowHours: 1,
    })
    for (const [hour, day] of [
      [600, 1500],
      [300, 5000],
      [1000, 1200],
    ] as const) {
      const rate = sendRate({ mailboxHour: hour, mailboxDay: day, capHour: 50, capDay: 200 })
      if (!rate || 'problem' in rate) throw new Error('no rate')
      const dayShare = Math.floor(day * 0.9) - 400
      expect(Math.ceil(24 / rate.windowHours) * rate.rate).toBeLessThanOrEqual(dayShare)
    }
  })

  it('has no rate without limits, and a problem when a limit leaves no share', () => {
    expect(sendRate({ mailboxHour: null, mailboxDay: null, capHour: 50, capDay: 200 })).toBeNull()
    expect(sendRate({ mailboxHour: 100, mailboxDay: null, capHour: 50, capDay: 200 })).toEqual({
      problem: expect.stringContaining('no room for Glia Notes'),
    })
  })
})

describe('the push switch (D53)', () => {
  const on = {
    GLIA_NOTES_PUSH: 'on',
    LISTMONK_URL: 'http://listmonk:9000',
    LISTMONK_CAMPAIGNS_TOKEN: 'c'.repeat(64),
    LISTMONK_API_TOKEN: 'a'.repeat(64),
    MAILBOX_LIMIT_HOUR: '500',
  }

  it('is off unless GLIA_NOTES_PUSH is on', () => {
    for (const value of [undefined, '', 'off', 'true', 'yes']) {
      expect(pushSettings({ ...on, GLIA_NOTES_PUSH: value })).toMatchObject({ on: false })
    }
    expect(pushSettings(on)).toMatchObject({ on: true, rate: { rate: 350, windowHours: 1 } })
    expect(pushSettings({ ...on, GLIA_NOTES_PUSH: ' ON ' })).toMatchObject({ on: true })
  })

  it("needs the issues' own listmonk user and the mailbox's limit", () => {
    expect(pushSettings({ ...on, LISTMONK_CAMPAIGNS_TOKEN: '' })).toMatchObject({ on: false })
    expect(pushSettings({ ...on, MAILBOX_LIMIT_HOUR: '' })).toMatchObject({ on: false })
    expect(pushSettings({ ...on, MAILBOX_LIMIT_HOUR: '5x' })).toMatchObject({ on: false })
    // Scheduling also needs a mail server.
    expect(pushSettings(on)).toMatchObject({ canSchedule: false })
    expect(pushSettings({ ...on, SMTP_HOST: 'smtp.example.org' })).toMatchObject({
      canSchedule: true,
    })
  })

  it("never takes the subscribers' token for the issues' user", () => {
    expect(campaignsSettings({ ...on, LISTMONK_CAMPAIGNS_TOKEN: on.LISTMONK_API_TOKEN })).toBeNull()
    expect(campaignsSettings(on)).toEqual({
      url: 'http://listmonk:9000',
      user: 'gliagora-campaigns',
      token: on.LISTMONK_CAMPAIGNS_TOKEN,
    })
    const problems: string[] = []
    expect(campaignsSettings({ ...on, LISTMONK_CAMPAIGNS_TOKEN: 'short' }, problems)).toBeNull()
    expect(problems.join()).not.toContain('short')
  })

  it('says in the start line whether it is on, and at which rate, never a token', () => {
    expect(describeIssuePush(pushSettings({}))).toBe(
      'Glia Notes issues: push off (GLIA_NOTES_PUSH, until the launch)',
    )
    expect(describeIssuePush(pushSettings(on))).toBe(
      'Glia Notes issues: push on, at most 350 messages an hour (no mail server: drafts only)',
    )
    expect(describeIssuePush(pushSettings({ ...on, SMTP_HOST: 'smtp.example.org' }))).not.toContain(
      on.LISTMONK_CAMPAIGNS_TOKEN,
    )
  })
})
