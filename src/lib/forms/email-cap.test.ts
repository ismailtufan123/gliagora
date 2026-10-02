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

  it('never raises a lower value the operator set: an empty hour follows a smaller day', () => {
    // The mailbox allows little a day: the day alone sets both, with nothing to report.
    expect(emailCap({ EMAIL_CAP_DAY: '20' })).toEqual({
      hour: 20,
      day: 20,
      set: true,
      problems: [],
    })
    expect(emailCap({ EMAIL_CAP_DAY: '40', EMAIL_CAP_HOUR: ' ' })).toEqual({
      hour: 40,
      day: 40,
      set: true,
      problems: [],
    })
  })

  it('lowers an hour above the day to the day, naming the variables but never the values', () => {
    const cap = emailCap({ EMAIL_CAP_HOUR: '300', EMAIL_CAP_DAY: '100' })
    expect(cap).toMatchObject({ hour: 100, day: 100, set: true })
    expect(cap.problems).toEqual([
      'EMAIL_CAP_HOUR is above EMAIL_CAP_DAY: the hour is limited to the day.',
    ])
    // Also above the default day, when the day is empty: the day is never raised.
    const alone = emailCap({ EMAIL_CAP_HOUR: '300' })
    expect(alone).toMatchObject({ hour: 200, day: 200, set: true })
    expect(alone.problems).toEqual([
      'EMAIL_CAP_HOUR is above the default of EMAIL_CAP_DAY: the hour is limited to the day.',
    ])
    for (const problem of [...cap.problems, ...alone.problems]) {
      expect(problem).not.toMatch(/\d/)
    }
  })

  it('replaces an unusable value by the stricter of its default and the other setting', () => {
    for (const value of ['0', '-5', '12.5', '1e3', 'fifty', '0x20', String(EMAIL_CAP_MAX + 1)]) {
      // The hour: the default, or the day when that is lower.
      const hour = emailCap({ EMAIL_CAP_HOUR: value, EMAIL_CAP_DAY: '400' })
      expect(hour).toMatchObject({ hour: 50, day: 400, set: true })
      expect(hour.problems).toHaveLength(1)
      expect(hour.problems[0]).toMatch(/^EMAIL_CAP_HOUR is not a whole number/)
      expect(hour.problems[0]).not.toContain(` ${value}`)
      expect(emailCap({ EMAIL_CAP_HOUR: value, EMAIL_CAP_DAY: '20' })).toMatchObject({
        hour: 20,
        day: 20,
      })
      // The day: the default, or the hour when that is lower (never above what was set).
      const day = emailCap({ EMAIL_CAP_HOUR: '30', EMAIL_CAP_DAY: value })
      expect(day).toMatchObject({ hour: 30, day: 30, set: true })
      expect(day.problems).toEqual([expect.stringMatching(/^EMAIL_CAP_DAY is not a whole number/)])
      expect(day.problems[0]).not.toContain(` ${value}`)
      expect(emailCap({ EMAIL_CAP_HOUR: '300', EMAIL_CAP_DAY: value })).toMatchObject({
        hour: 200,
        day: 200,
        problems: [expect.stringMatching(/^EMAIL_CAP_DAY/)],
      })
      expect(emailCap({ EMAIL_CAP_DAY: value })).toMatchObject({ hour: 50, day: 200, set: false })
    }
    const both = emailCap({ EMAIL_CAP_HOUR: 'x', EMAIL_CAP_DAY: 'y' })
    expect(both).toMatchObject({ hour: 50, day: 200, set: false })
    expect(both.problems).toHaveLength(2)
  })

  it('is never above what was set, whatever the two settings are', () => {
    const values = ['', '1', '20', '49', '50', '51', '199', '200', '201', '5000', 'bad']
    for (const hourText of values) {
      for (const dayText of values) {
        const cap = emailCap({ EMAIL_CAP_HOUR: hourText, EMAIL_CAP_DAY: dayText })
        const hourSet = /^\d+$/.test(hourText) ? Number(hourText) : null
        const daySet = /^\d+$/.test(dayText) ? Number(dayText) : null
        expect(cap.hour).toBeLessThanOrEqual(cap.day)
        expect(cap.hour).toBeLessThanOrEqual(hourSet ?? EMAILS_SITE_WIDE.hour)
        expect(cap.day).toBeLessThanOrEqual(daySet ?? EMAILS_SITE_WIDE.day)
        expect(cap.hour).toBeGreaterThanOrEqual(1)
      }
    }
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
