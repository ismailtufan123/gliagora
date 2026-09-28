import { isCalendarDay } from '@/lib/jobs/deadline'

// Small helpers for the machine-readable files (PLAN §2.2): the sitemaps and the jobs feed are
// written as text, so everything that comes from the database or the messages is escaped here.

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

// Characters XML 1.0 cannot hold at all, even escaped: C0 controls other than tab, line feed and
// carriage return, lone surrogates, and U+FFFE/U+FFFF. One of them pasted into a title would
// otherwise make the whole file unreadable.
const NOT_XML =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/**
 * Text or an attribute value made safe for XML: the five special characters escaped, and the
 * characters XML cannot hold left out.
 */
export function escapeXml(text: string): string {
  return text.replace(NOT_XML, '').replace(/[&<>"']/g, (char) => ESCAPES[char] as string)
}

/** An instant, or a calendar day written as YYYY-MM-DD. */
export type DateValue = Date | string

/** The instant a value names (a calendar day counts from its start, UTC), or null. */
function timeOf(value: DateValue | null | undefined): number | null {
  if (value == null || value === '') return null
  const time = isCalendarDay(value)
    ? Date.parse(`${value}T00:00:00Z`)
    : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? NaN
      : new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

/**
 * A date in the W3C Datetime format of the sitemaps' `<lastmod>`: a calendar day stays a day
 * (`2026-09-27`); an instant is written in UTC to the second (`2026-09-27T14:05:09Z`).
 */
export function w3cDate(value: DateValue): string {
  if (isCalendarDay(value)) return value
  const time = timeOf(value)
  if (time === null) throw new RangeError(`Not a date: ${String(value)}`)
  return new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * A date in the RFC 822 format of RSS 2.0, with the four-digit year the RSS specification
 * recommends: `Mon, 28 Sep 2026 14:05:09 GMT`.
 */
export function rfc822Date(value: DateValue): string {
  const time = timeOf(value)
  if (time === null) throw new RangeError(`Not a date: ${String(value)}`)
  return new Date(time).toUTCString()
}

/**
 * The latest of the given dates, as it was given (so a calendar day stays a day), or null when
 * none names a date.
 */
export function latestDate(values: readonly (DateValue | null | undefined)[]): DateValue | null {
  let found: DateValue | null = null
  let max = -Infinity
  for (const value of values) {
    const time = timeOf(value)
    if (time !== null && time > max) {
      max = time
      found = value as DateValue
    }
  }
  return found
}
