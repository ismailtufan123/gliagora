import { createTranslator } from 'next-intl'
import { afterEach, describe, expect, it } from 'vitest'

import en from '../../../messages/en.json'
import tr from '../../../messages/tr.json'
import { calendarDay, deadlineEnd, storedDay } from './deadline'
import {
  type DeadlineFacts,
  daysLeftText,
  deadlineView,
  formatDay,
  languageName,
  listOf,
  timeZoneLabel,
} from './format'

const HOUR = 3_600_000
const DAY = 24 * HOUR

describe('formatDay', () => {
  const savedTz = process.env.TZ
  afterEach(() => {
    process.env.TZ = savedTz
  })

  it('writes days unambiguously, day before month (PLAN §12)', () => {
    expect(formatDay('2026-11-14', 'en')).toBe('14 Nov 2026')
    expect(formatDay('2026-11-14', 'tr')).toBe('14 Kas 2026')
    expect(formatDay('2027-01-01', 'en')).toBe('1 Jan 2027')
  })

  it('shows the stored day in every server time zone, never the day before or after', () => {
    for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/Los_Angeles', 'UTC']) {
      process.env.TZ = zone
      expect(formatDay(calendarDay(storedDay('2026-11-14')) as string, 'en')).toBe('14 Nov 2026')
      expect(calendarDay('2026-12-31T12:00:00.000Z')).toBe('2026-12-31')
    }
  })
})

describe('daysLeftText', () => {
  const end = new Date('2026-11-15T23:00:00.000Z')
  const before = (ms: number) => end.getTime() - ms

  it('counts whole days, rounded up', () => {
    expect(daysLeftText(end, before(12 * DAY))).toEqual({ key: 'daysLeft', days: 12 })
    expect(daysLeftText(end, before(11 * DAY + 1))).toEqual({ key: 'daysLeft', days: 12 })
    expect(daysLeftText(end, before(DAY + 1))).toEqual({ key: 'daysLeft', days: 2 })
  })

  it('says "Last day" once the deadline ends within 24 hours', () => {
    expect(daysLeftText(end, before(DAY))).toEqual({ key: 'lastDay' })
    expect(daysLeftText(end, before(HOUR))).toEqual({ key: 'lastDay' })
    expect(daysLeftText(end, before(1))).toEqual({ key: 'lastDay' })
  })

  it('says "Closed" from the end of the deadline day on', () => {
    expect(daysLeftText(end, end)).toEqual({ key: 'closed' })
    expect(daysLeftText(end, before(-DAY))).toEqual({ key: 'closed' })
  })
})

describe('deadlineView', () => {
  const fixed = (day: string, timeZone: string | null, extra: Partial<DeadlineFacts> = {}) => ({
    status: 'published' as const,
    deadlineKind: 'fixed' as const,
    deadlineDate: storedDay(day),
    deadlineTz: timeZone,
    deadlineAt: deadlineEnd(day, timeZone).toISOString(),
    ...extra,
  })

  it('shows the day, the days left, the gauge and the time zone of an open deadline', () => {
    const view = deadlineView(fixed('2026-11-14', 'Europe/Berlin'), '2026-11-02T10:00:00Z', 'en')
    expect(view).toEqual({
      kind: 'fixed',
      open: true,
      day: '2026-11-14',
      left: { key: 'daysLeft', days: 13 },
      closingSoon: true,
      gauge: 4,
      zone: { name: 'Central European Time', offset: 'UTC+1' },
    })
  })

  it('is not closing soon more than 14 days ahead', () => {
    const view = deadlineView(fixed('2026-12-31', 'Europe/Berlin'), '2026-11-02T10:00:00Z', 'en')
    expect(view).toMatchObject({ closingSoon: false, gauge: 2, left: { days: 60 } })
  })

  it('names no time zone when the posting names none (the day ends Anywhere on Earth)', () => {
    const job = fixed('2026-10-25', null)
    // 11:00 UTC on the 26th: already the 26th in Europe, still the 25th at UTC−12.
    expect(deadlineView(job, '2026-10-26T11:00:00Z', 'en')).toMatchObject({
      open: true,
      left: { key: 'lastDay' },
      zone: null,
    })
    expect(deadlineView(job, '2026-10-26T12:00:00Z', 'en')).toMatchObject({
      open: false,
      left: { key: 'closed' },
    })
  })

  it('counts from the moment across a change of clocks', () => {
    // Summer time ends in Europe on 25 October 2026, a 25-hour day: at its first moment, more
    // than 24 hours are left.
    const berlin = fixed('2026-10-25', 'Europe/Berlin')
    expect(deadlineView(berlin, '2026-10-24T22:00:00Z', 'en')).toMatchObject({
      left: { key: 'daysLeft', days: 2 },
      zone: { offset: 'UTC+1' },
    })
    expect(deadlineView(berlin, '2026-10-24T23:00:00Z', 'en')).toMatchObject({
      left: { key: 'lastDay' },
    })
    // Summer time starts in New York on 8 March 2026, a 23-hour day.
    const newYork = fixed('2026-03-08', 'America/New_York')
    expect(deadlineView(newYork, '2026-03-08T05:00:00Z', 'en')).toMatchObject({
      left: { key: 'lastDay' },
      zone: { name: 'Eastern Time', offset: 'UTC-4' },
    })
  })

  it('shows a published job whose deadline has passed as closed, before the hourly expiry', () => {
    const job = fixed('2026-10-01', 'UTC')
    expect(deadlineView(job, '2026-10-02T01:00:00Z', 'en')).toMatchObject({
      open: false,
      left: { key: 'closed' },
      closingSoon: false,
    })
  })

  it('shows a position filled before its deadline as closed', () => {
    const job = fixed('2026-12-01', 'UTC', { status: 'expired', expiredAt: '2026-10-01T09:00:00Z' })
    expect(deadlineView(job, '2026-10-02T00:00:00Z', 'en')).toMatchObject({
      open: false,
      left: { key: 'closed' },
    })
  })

  it('labels rolling and until-filled deadlines as such', () => {
    const now = '2026-10-01T00:00:00Z'
    expect(deadlineView({ status: 'published', deadlineKind: 'rolling' }, now, 'en')).toEqual({
      kind: 'rolling',
      open: true,
    })
    expect(deadlineView({ status: 'expired', deadlineKind: 'until-filled' }, now, 'en')).toEqual({
      kind: 'until-filled',
      open: false,
    })
  })

  it('has nothing to show for a fixed deadline without a day', () => {
    expect(deadlineView({ status: 'draft', deadlineKind: 'fixed' }, 0, 'en')).toBeNull()
  })
})

describe('timeZoneLabel', () => {
  const winter = '2026-01-15T12:00:00Z'
  const summer = '2026-07-15T12:00:00Z'

  it('names the zone and its offset on that day', () => {
    expect(timeZoneLabel('Europe/Stockholm', winter, 'en')).toEqual({
      name: 'Central European Time',
      offset: 'UTC+1',
    })
    expect(timeZoneLabel('Europe/Stockholm', summer, 'en').offset).toBe('UTC+2')
    expect(timeZoneLabel('Asia/Kathmandu', winter, 'en').offset).toBe('UTC+5:45')
    expect(timeZoneLabel('Europe/Berlin', winter, 'tr')).toEqual({
      name: 'Orta Avrupa Saati',
      offset: 'UTC+1',
    })
  })

  it('shows only the offset where there is no name', () => {
    expect(timeZoneLabel('UTC', winter, 'en')).toEqual({ name: null, offset: 'UTC' })
  })
})

describe('names', () => {
  it('names the language of a posting in the language of the page', () => {
    expect(languageName('de', 'en')).toBe('German')
    expect(languageName('de', 'tr')).toBe('Almanca')
    expect(languageName('en', 'en')).toBe('English')
  })

  it('joins labels as a list', () => {
    expect(listOf(['PhD candidate', 'Early postdoc'], 'en')).toBe('PhD candidate, Early postdoc')
    expect(listOf(['Student'], 'en')).toBe('Student')
  })
})

describe('days-left messages', () => {
  const english = createTranslator({ locale: 'en', messages: en, namespace: 'jobs' })
  const turkish = createTranslator({ locale: 'tr', messages: tr, namespace: 'jobs' })

  it('use the plural forms of each language', () => {
    expect(english('daysLeft', { days: 2 })).toBe('2 days left')
    expect(english('daysLeft', { days: 12 })).toBe('12 days left')
    expect(english('daysLeft', { days: 1 })).toBe('1 day left')
    expect(turkish('daysLeft', { days: 12 })).toBe('12 gün kaldı')
    expect(english('moreTopicsLabel', { count: 1 })).toBe('1 more topic')
    expect(english('moreTopicsLabel', { count: 3 })).toBe('3 more topics')
    expect(english('lastDay')).toBe('Last day')
  })
})
