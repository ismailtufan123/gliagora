import type { JobStatus } from './status'

// Deadlines of job listings (PLAN §2.5, §3.2). A fixed deadline is a calendar day in a time zone,
// the institution's or the one the posting names: the listing closes when that day ends there.
// When that zone is unknown (empty), the day ends Anywhere on Earth (AoE, UTC−12), the last place
// where it is still that day, so nobody who could still apply sees the listing closed.

export const DEADLINE_KINDS = [
  { value: 'fixed', label: 'Fixed date' },
  { value: 'rolling', label: 'Rolling' },
  { value: 'until-filled', label: 'Until filled' },
] as const

export type DeadlineKind = (typeof DEADLINE_KINDS)[number]['value']

/** The "Closing soon" badge and filter (PLAN §2.4, §3.2). */
export const CLOSING_SOON_DAYS = 14

/** A closed listing answers 410 Gone this many days after it closed (PLAN §2.5). */
export const GONE_AFTER_DAYS = 30

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

type Instant = Date | string | number

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

function dayParts(day: string): [number, number, number] | null {
  const match = CALENDAR_DAY.exec(day)
  if (!match) return null
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const check = new Date(Date.UTC(year, month - 1, date))
  return check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === date
    ? [year, month, date]
    : null
}

/** Whether `value` is a real calendar day written as YYYY-MM-DD. */
export function isCalendarDay(value: unknown): value is string {
  return typeof value === 'string' && dayParts(value) !== null
}

/**
 * The calendar day (YYYY-MM-DD) that a date field holds. Payload stores date fields as
 * timestamps; the admin's day picker sends the picked day between 11:00 and 13:00 UTC in every
 * browser time zone, so the UTC date is the day. A plain `YYYY-MM-DD` counts as that day.
 */
export function calendarDay(value: Instant | null | undefined): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'string' && CALENDAR_DAY.test(value))
    return isCalendarDay(value) ? value : null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

/**
 * How a calendar day is stored in a date field: at noon UTC, which is the same day from UTC−12 to
 * UTC+11, so the admin shows the day unchanged for editors almost everywhere.
 */
export const storedDay = (day: string) => `${day}T12:00:00.000Z`

/** The calendar day `days` days after `day` (or before, if negative). */
export function addDays(day: string, days: number): string {
  const parts = dayParts(day)
  if (!parts) throw new RangeError(`Not a calendar day: ${day}`)
  const [year, month, date] = parts
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/** The calendar day at instant `ms` in `timeZone`. */
function localDay(ms: number, timeZone: string): string {
  let format = formatters.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    formatters.set(timeZone, format)
  }
  const parts = Object.fromEntries(format.formatToParts(ms).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

/**
 * The instant the deadline day ends: the first moment at which the calendar in `timeZone` shows a
 * later day, normally midnight at the start of the next day. Daylight-saving changes are handled,
 * also where clocks change at midnight. Without a time zone, the day ends Anywhere on Earth.
 */
export function deadlineEnd(day: string, timeZone?: string | null): Date {
  const parts = dayParts(day)
  if (!parts) throw new RangeError(`Not a calendar day: ${day}`)
  const [year, month, date] = parts
  const nextMidnightUtc = Date.UTC(year, month - 1, date + 1)
  if (!timeZone) return new Date(nextMidnightUtc + 12 * HOUR_MS)
  // UTC offsets lie between −12 and +14 hours, so the end lies within a day of midnight UTC; the
  // search finds the exact millisecond without needing to know the offset.
  let before = nextMidnightUtc - DAY_MS
  let after = nextMidnightUtc + DAY_MS
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2)
    if (localDay(middle, timeZone) > day) after = middle
    else before = middle
  }
  return new Date(after)
}

const toMs = (value: Instant) =>
  value instanceof Date ? value.getTime() : new Date(value).getTime()

/**
 * Whole days until the deadline ends, rounded up: 1 on the last day, 0 once it has ended. Counted
 * from the moment, not from the reader's calendar, so every reader sees the same number.
 */
export function daysLeft(end: Instant, now: Instant = Date.now()): number {
  return Math.max(0, Math.ceil((toMs(end) - toMs(now)) / DAY_MS))
}

/** "Closing soon": still open and ending within 14 days (PLAN §3.2). */
export function isClosingSoon(end: Instant, now: Instant = Date.now()): boolean {
  const left = daysLeft(end, now)
  return left > 0 && left <= CLOSING_SOON_DAYS
}

/** Segments of the decorative deadline gauge on job cards (PLAN §3.2): fuller as the end nears. */
export function deadlineGauge(daysToGo: number): 1 | 2 | 3 | 4 | 5 {
  if (daysToGo <= 3) return 5
  if (daysToGo <= CLOSING_SOON_DAYS) return 4
  if (daysToGo <= 30) return 3
  if (daysToGo <= 60) return 2
  return 1
}

/** What decides whether a listing is open, closed or gone. */
export type ListingDates = {
  status: JobStatus
  deadlineKind?: DeadlineKind | null
  /** The end of a fixed deadline day (`deadlineEnd`). */
  deadlineAt?: Instant | null
  expiredAt?: Instant | null
  withdrawnAt?: Instant | null
}

/** Published and, for a fixed deadline, before the end of the deadline day. */
export function isOpen(listing: ListingDates, now: Instant = Date.now()): boolean {
  if (listing.status !== 'published') return false
  if (listing.deadlineKind !== 'fixed' || listing.deadlineAt == null) return true
  return toMs(now) < toMs(listing.deadlineAt)
}

/**
 * When a listing that was public closed: at the end of its deadline day, when it was marked as
 * expired (a rolling position, or one filled early) or when it was withdrawn, whichever came
 * first. Null while it is open, and for drafts, which were never public.
 */
export function closedAt(listing: ListingDates, now: Instant = Date.now()): Date | null {
  const { status } = listing
  if (status === 'draft' || status === 'in_review') return null
  const times: number[] = []
  if (listing.deadlineKind === 'fixed' && listing.deadlineAt != null) {
    const end = toMs(listing.deadlineAt)
    if (end <= toMs(now)) times.push(end)
  }
  if ((status === 'expired' || status === 'withdrawn') && listing.expiredAt != null) {
    times.push(toMs(listing.expiredAt))
  }
  if (status === 'withdrawn' && listing.withdrawnAt != null) times.push(toMs(listing.withdrawnAt))
  return times.length > 0 ? new Date(Math.min(...times)) : null
}

/**
 * From when the listing's address answers 410 Gone (PLAN §2.5): 30 days after it closed, or at
 * once when it was withdrawn. Null while it is open.
 */
export function goneAt(listing: ListingDates, now: Instant = Date.now()): Date | null {
  const closed = closedAt(listing, now)
  if (!closed) return null
  const gone = closed.getTime() + GONE_AFTER_DAYS * DAY_MS
  if (listing.status === 'withdrawn' && listing.withdrawnAt != null) {
    return new Date(Math.min(gone, toMs(listing.withdrawnAt)))
  }
  return new Date(gone)
}
