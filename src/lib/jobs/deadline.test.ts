import { describe, expect, it } from 'vitest'

import {
  addDays,
  calendarDay,
  closedAt,
  daysLeft,
  deadlineEnd,
  deadlineGauge,
  goneAt,
  isCalendarDay,
  isClosingSoon,
  isOpen,
  listingState,
  storedDay,
  type ListingDates,
} from './deadline'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const at = (iso: string) => new Date(iso)

describe('calendar days', () => {
  it('reads the day from what the admin day picker stores, in any browser time zone', () => {
    // Stored values seen from browsers in UTC−12, UTC−3:30, UTC+1 (DST), UTC+5:45 and UTC+14.
    for (const stored of [
      '2026-10-25T12:00:00.000Z',
      '2026-10-25T11:30:00.000Z',
      '2026-10-25T13:00:00.000Z',
      '2026-10-25T11:15:00.000Z',
    ]) {
      expect(calendarDay(stored)).toBe('2026-10-25')
    }
    expect(calendarDay(new Date('2026-10-25T12:00:00Z'))).toBe('2026-10-25')
  })

  it('takes a plain YYYY-MM-DD as that day and refuses days that do not exist', () => {
    expect(calendarDay('2026-10-25')).toBe('2026-10-25')
    expect(calendarDay('2026-02-30')).toBeNull()
    expect(calendarDay('not a date')).toBeNull()
    expect(calendarDay(null)).toBeNull()
    expect(calendarDay('')).toBeNull()
    expect(isCalendarDay('2028-02-29')).toBe(true)
    expect(isCalendarDay('2026-02-29')).toBe(false)
    expect(isCalendarDay('2026-1-5')).toBe(false)
  })

  it('stores a day at noon UTC and counts days across months and years', () => {
    expect(storedDay('2026-10-25')).toBe('2026-10-25T12:00:00.000Z')
    expect(calendarDay(storedDay('2026-10-25'))).toBe('2026-10-25')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('deadlineEnd', () => {
  it('ends the day Anywhere on Earth (UTC−12) when the posting names no time zone', () => {
    expect(deadlineEnd('2026-10-25').toISOString()).toBe('2026-10-26T12:00:00.000Z')
    expect(deadlineEnd('2026-10-25', null).toISOString()).toBe('2026-10-26T12:00:00.000Z')
  })

  it('ends the day at local midnight in the given time zone', () => {
    expect(deadlineEnd('2026-11-15', 'Europe/Istanbul').toISOString()).toBe(
      '2026-11-15T21:00:00.000Z',
    )
    expect(deadlineEnd('2026-11-15', 'UTC').toISOString()).toBe('2026-11-16T00:00:00.000Z')
    expect(deadlineEnd('2026-11-15', 'America/Los_Angeles').toISOString()).toBe(
      '2026-11-16T08:00:00.000Z',
    )
    expect(deadlineEnd('2026-11-15', 'Asia/Kathmandu').toISOString()).toBe(
      '2026-11-15T18:15:00.000Z',
    )
    expect(deadlineEnd('2026-11-15', 'Pacific/Kiritimati').toISOString()).toBe(
      '2026-11-15T10:00:00.000Z',
    )
  })

  it('handles the days on which clocks change', () => {
    // Europe: summer time ends on 25 October 2026, a 25-hour day.
    expect(deadlineEnd('2026-10-24', 'Europe/Berlin').toISOString()).toBe(
      '2026-10-24T22:00:00.000Z',
    )
    expect(deadlineEnd('2026-10-25', 'Europe/Berlin').toISOString()).toBe(
      '2026-10-25T23:00:00.000Z',
    )
    // United States: summer time starts on 8 March 2026, a 23-hour day.
    expect(deadlineEnd('2026-03-08', 'America/New_York').toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    )
  })

  it('handles clocks that change at midnight', () => {
    // Chile: summer time starts at midnight on 6 September 2026, so that day has no 00:00; the
    // 5th ends when the clocks jump to 01:00.
    expect(deadlineEnd('2026-09-05', 'America/Santiago').toISOString()).toBe(
      '2026-09-06T04:00:00.000Z',
    )
    expect(deadlineEnd('2026-09-06', 'America/Santiago').toISOString()).toBe(
      '2026-09-07T03:00:00.000Z',
    )
    // Lebanon: summer time ends at midnight on 25 October 2026 and the clocks go back to 23:00, so
    // the 24th has two hours from 23:00; it ends at the second midnight.
    expect(deadlineEnd('2026-10-24', 'Asia/Beirut').toISOString()).toBe('2026-10-24T22:00:00.000Z')
  })

  it('ends a day exactly: the last millisecond still belongs to it', () => {
    const end = deadlineEnd('2026-10-25', 'Europe/Berlin').getTime()
    const day = (ms: number) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(ms)
    expect(day(end - 1)).toBe('2026-10-25')
    expect(day(end)).toBe('2026-10-26')
  })

  it('refuses something that is not a calendar day', () => {
    expect(() => deadlineEnd('2026-13-01')).toThrow(RangeError)
  })
})

describe('days left and closing soon', () => {
  const end = at('2026-11-01T00:00:00Z')

  it('counts whole days, rounded up, and 0 once the deadline has ended', () => {
    expect(daysLeft(end, end.getTime() - 10 * HOUR)).toBe(1)
    expect(daysLeft(end, end.getTime() - 14 * DAY)).toBe(14)
    expect(daysLeft(end, end.getTime() - 14 * DAY - 1)).toBe(15)
    expect(daysLeft(end, end)).toBe(0)
    expect(daysLeft(end, end.getTime() + DAY)).toBe(0)
  })

  it('flags deadlines within 14 days as closing soon, but not ended ones', () => {
    expect(isClosingSoon(end, end.getTime() - 14 * DAY)).toBe(true)
    expect(isClosingSoon(end, end.getTime() - 1)).toBe(true)
    expect(isClosingSoon(end, end.getTime() - 14 * DAY - 1)).toBe(false)
    expect(isClosingSoon(end, end)).toBe(false)
  })

  it('fills the gauge as the deadline nears', () => {
    expect([0, 3, 4, 14, 15, 30, 31, 60, 61, 400].map(deadlineGauge)).toEqual([
      5, 5, 4, 4, 3, 3, 2, 2, 1, 1,
    ])
  })
})

describe('open, closed and gone', () => {
  const now = at('2026-10-01T12:00:00Z')
  const deadlineAt = '2026-10-10T22:00:00.000Z'
  const fixed = (overrides: Partial<ListingDates>): ListingDates => ({
    status: 'published',
    deadlineKind: 'fixed',
    deadlineAt,
    ...overrides,
  })

  it('is open while published and before the end of the deadline day', () => {
    expect(isOpen(fixed({}), now)).toBe(true)
    expect(isOpen(fixed({}), deadlineAt)).toBe(false)
    expect(isOpen(fixed({ status: 'expired' }), now)).toBe(false)
    expect(isOpen(fixed({ status: 'draft' }), now)).toBe(false)
    expect(isOpen({ status: 'published', deadlineKind: 'rolling' }, now)).toBe(true)
  })

  it('closes at the end of the deadline day, even before the hourly check marks it expired', () => {
    expect(closedAt(fixed({}), now)).toBeNull()
    expect(closedAt(fixed({}), '2026-10-11T00:00:00Z')?.toISOString()).toBe(deadlineAt)
    const expired = fixed({ status: 'expired', expiredAt: '2026-10-10T22:40:00.000Z' })
    expect(closedAt(expired, '2026-10-11T00:00:00Z')?.toISOString()).toBe(deadlineAt)
  })

  it('closes when marked expired, for rolling positions and positions filled early', () => {
    const early = fixed({ status: 'expired', expiredAt: '2026-10-05T09:00:00.000Z' })
    expect(closedAt(early, '2026-10-06T00:00:00Z')?.toISOString()).toBe('2026-10-05T09:00:00.000Z')
    const rolling: ListingDates = {
      status: 'expired',
      deadlineKind: 'until-filled',
      expiredAt: '2026-09-20T08:00:00.000Z',
    }
    expect(closedAt(rolling, now)?.toISOString()).toBe('2026-09-20T08:00:00.000Z')
  })

  it('is never closed while a draft or in review, which were never public', () => {
    expect(closedAt(fixed({ status: 'draft' }), '2027-01-01T00:00:00Z')).toBeNull()
    expect(goneAt(fixed({ status: 'in_review' }), '2027-01-01T00:00:00Z')).toBeNull()
  })

  it('is gone 30 days after closing, or at once when withdrawn', () => {
    const expired = fixed({ status: 'expired', expiredAt: '2026-10-10T22:40:00.000Z' })
    expect(goneAt(expired, '2026-10-11T00:00:00Z')?.toISOString()).toBe('2026-11-09T22:00:00.000Z')
    const withdrawn = fixed({ status: 'withdrawn', withdrawnAt: '2026-09-28T10:00:00.000Z' })
    expect(goneAt(withdrawn, now)?.toISOString()).toBe('2026-09-28T10:00:00.000Z')
    expect(goneAt(fixed({}), now)).toBeNull()
  })
})

describe('listingState', () => {
  const now = at('2026-10-01T12:00:00Z')
  const iso = (ms: number) => new Date(now.getTime() + ms).toISOString()
  const job = (overrides: Partial<ListingDates>): ListingDates => ({
    status: 'published',
    deadlineKind: 'fixed',
    deadlineAt: iso(10 * DAY),
    ...overrides,
  })

  it('hides drafts and jobs in review, which were never public', () => {
    expect(listingState(job({ status: 'draft' }), now)).toBe('hidden')
    expect(listingState(job({ status: 'in_review', deadlineAt: iso(-60 * DAY) }), now)).toBe(
      'hidden',
    )
  })

  it('is open while published and before the end of the deadline day', () => {
    expect(listingState(job({}), now)).toBe('open')
    expect(listingState(job({ deadlineKind: 'until-filled', deadlineAt: null }), now)).toBe('open')
  })

  it('is closed from the end of the deadline day, before the hourly check has run', () => {
    expect(listingState(job({ deadlineAt: iso(-HOUR) }), now)).toBe('closed')
    expect(listingState(job({ deadlineAt: iso(0) }), now)).toBe('closed')
    expect(listingState(job({ status: 'expired', expiredAt: iso(-DAY) }), now)).toBe('closed')
  })

  it('is gone from 30 days after closing, and at once when withdrawn', () => {
    expect(listingState(job({ deadlineAt: iso(-30 * DAY) }), now)).toBe('gone')
    expect(listingState(job({ deadlineAt: iso(-30 * DAY + 1) }), now)).toBe('closed')
    expect(listingState(job({ status: 'withdrawn', withdrawnAt: iso(-HOUR) }), now)).toBe('gone')
  })
})
