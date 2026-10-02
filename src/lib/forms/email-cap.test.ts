import { describe, expect, it } from 'vitest'

import { EMAILS_SITE_WIDE, EMAIL_CAP_MAX, describeEmailCap, emailCap } from './email-cap'

// The site-wide cap on the emails the forms send, as the server sets it (M2, D50).

describe('emailCap', () => {
  it('is 50 an hour and 200 a day without settings', () => {
    expect(EMAILS_SITE_WIDE).toEqual({ hour: 50, day: 200 })
    for (const env of [{}, { EMAIL_CAP_HOUR: '', EMAIL_CAP_DAY: '  ' }]) {
      expect(emailCap(env)).toEqual({ hour: 50, day: 200, set: false, problems: [] })
    }
  })

  it('takes whole numbers from 1 to the maximum, each on its own', () => {
    expect(emailCap({ EMAIL_CAP_HOUR: '120', EMAIL_CAP_DAY: ' 900 ' })).toEqual({
      hour: 120,
      day: 900,
      set: true,
      problems: [],
    })
    expect(emailCap({ EMAIL_CAP_HOUR: '1' })).toMatchObject({ hour: 1, day: 200, set: true })
    expect(emailCap({ EMAIL_CAP_DAY: String(EMAIL_CAP_MAX) })).toMatchObject({
      hour: 50,
      day: EMAIL_CAP_MAX,
      set: true,
    })
  })

  it('keeps the default for an unusable value, naming the variable but never the value', () => {
    for (const value of ['0', '-5', '12.5', '1e3', 'fifty', '0x20', String(EMAIL_CAP_MAX + 1)]) {
      const cap = emailCap({ EMAIL_CAP_HOUR: value, EMAIL_CAP_DAY: '400' })
      expect(cap).toMatchObject({ hour: 50, day: 400, set: true })
      expect(cap.problems).toHaveLength(1)
      expect(cap.problems[0]).toMatch(/^EMAIL_CAP_HOUR is not a whole number/)
      expect(cap.problems[0]).not.toContain(` ${value}`)
    }
  })

  it('keeps both defaults when the hour is above the day, since one of them is a mistake', () => {
    const cap = emailCap({ EMAIL_CAP_HOUR: '300', EMAIL_CAP_DAY: '100' })
    expect(cap).toMatchObject({ hour: 50, day: 200, set: false })
    expect(cap.problems).toEqual([expect.stringMatching(/^EMAIL_CAP_HOUR is above EMAIL_CAP_DAY/)])
    // Also when only the day is set, below the default hour.
    expect(emailCap({ EMAIL_CAP_DAY: '20' }).problems).toHaveLength(1)
  })
})

describe('describeEmailCap', () => {
  it('gives the start line, saying when it is the default', () => {
    expect(describeEmailCap(emailCap({}))).toBe(
      'Email cap of the forms: 50 an hour, 200 a day (default)',
    )
    expect(describeEmailCap(emailCap({ EMAIL_CAP_HOUR: '500', EMAIL_CAP_DAY: '2000' }))).toBe(
      'Email cap of the forms: 500 an hour, 2000 a day',
    )
  })
})
