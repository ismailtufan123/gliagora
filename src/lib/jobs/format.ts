import type { Locale } from '@/i18n/routing'

import {
  type DeadlineKind,
  type ListingDates,
  calendarDay,
  daysLeft,
  deadlineEnd,
  deadlineGauge,
  isClosingSoon,
  isOpen,
} from './deadline'

// How listings show their dates (PLAN §3.2, §12): unambiguous days ("14 Nov 2026"), days left in
// words, and the time zone of a deadline. Components take these results and pick the messages;
// the words themselves live in messages/{locale}.json.

type Instant = Date | string | number

/** The locale Intl formats in: British English, so that the day comes before the month (PLAN §12). */
export const intlLocale = (locale: Locale) => (locale === 'en' ? 'en-GB' : locale)

const dayFormats = new Map<Locale, Intl.DateTimeFormat>()

/**
 * A calendar day (YYYY-MM-DD, from `calendarDay`) as an unambiguous date: "14 Nov 2026",
 * "14 Kas 2026". Formatted in UTC from the day itself, so no server or reader time zone can
 * shift it to the day before or after.
 */
export function formatDay(day: string, locale: Locale): string {
  let format = dayFormats.get(locale)
  if (!format) {
    format = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeZone: 'UTC' })
    dayFormats.set(locale, format)
  }
  return format.format(new Date(`${day}T12:00:00Z`))
}

/**
 * The days left before a deadline, as the messages say them: whole days, rounded up, counted from
 * the moment (`daysLeft`), so every reader sees the same; "Last day" once less than 24 hours
 * remain; "Closed" once it has passed.
 */
export type DaysLeft = { key: 'daysLeft'; days: number } | { key: 'lastDay' } | { key: 'closed' }

export function daysLeftText(end: Instant, now: Instant): DaysLeft {
  const days = daysLeft(end, now)
  if (days === 0) return { key: 'closed' }
  if (days === 1) return { key: 'lastDay' }
  return { key: 'daysLeft', days }
}

/**
 * The name and UTC offset of a time zone at an instant: "Central European Time", "UTC+1". The
 * name is null where Intl has none but an offset ("GMT+03:00"), and for UTC itself.
 */
export function timeZoneLabel(
  timeZone: string,
  at: Instant,
  locale: Locale,
): { name: string | null; offset: string } {
  const part = (style: 'longGeneric' | 'shortOffset') =>
    new Intl.DateTimeFormat(intlLocale(locale), { timeZone, timeZoneName: style })
      .formatToParts(new Date(at))
      .find((p) => p.type === 'timeZoneName')?.value ?? ''
  const generic = part('longGeneric')
  const offset = part('shortOffset')
    .replace(/^GMT/, 'UTC')
    .replace(/^UTC\+0$/, 'UTC')
  const name = timeZone === 'UTC' || generic === '' || /^(GMT|UTC)/.test(generic) ? null : generic
  return { name, offset: offset || 'UTC' }
}

/** What a listing shows about its deadline. */
export type DeadlineView =
  | { kind: 'rolling' | 'until-filled'; open: boolean }
  | {
      kind: 'fixed'
      open: boolean
      /** The deadline day, YYYY-MM-DD. */
      day: string
      left: DaysLeft
      closingSoon: boolean
      /**
       * Closed before its deadline day ended (filled or withdrawn): the day, still to come or just
       * past, is then left out next to "Closed", where it read as a deadline still open.
       */
      closedEarly: boolean
      /** Segments of the decorative gauge (1–5). */
      gauge: 1 | 2 | 3 | 4 | 5
      /**
       * The time zone the day ends in, or null when the posting names none. The day then ends
       * Anywhere on Earth (UTC−12), which keeps the listing open for everyone who could still
       * apply; it is not shown as the employer's deadline, because the employer may close at
       * its own midnight.
       */
      zone: { name: string | null; offset: string } | null
    }

export type DeadlineFacts = ListingDates & {
  deadlineKind?: DeadlineKind | null
  deadlineDate?: string | null
  deadlineTz?: string | null
}

/**
 * The deadline of a listing at `now`: a fixed day with the days left (or "Closed" once the
 * listing has closed, also when it was filled before its deadline), or rolling / until filled.
 * Null for a fixed deadline without a day, which a public listing never has.
 */
export function deadlineView(
  listing: DeadlineFacts,
  now: Instant,
  locale: Locale,
): DeadlineView | null {
  const open = isOpen(listing, now)
  const kind = listing.deadlineKind ?? 'fixed'
  if (kind !== 'fixed') return { kind, open }
  const day = calendarDay(listing.deadlineDate)
  if (!day) return null
  const timeZone = listing.deadlineTz || null
  const end = listing.deadlineAt ? new Date(listing.deadlineAt) : deadlineEnd(day, timeZone)
  return {
    kind,
    open,
    day,
    left: open ? daysLeftText(end, now) : { key: 'closed' },
    closingSoon: open && isClosingSoon(end, now),
    closedEarly: !open && daysLeft(end, now) > 0,
    gauge: deadlineGauge(open ? daysLeft(end, now) : 0),
    // The offset of the deadline day's last moment.
    zone: timeZone ? timeZoneLabel(timeZone, end.getTime() - 1, locale) : null,
  }
}

const languageNames = new Map<Locale, Intl.DisplayNames>()

/** A language code (ISO 639-1) named in the page's language: "de" → "German", "Almanca". */
export function languageName(code: string, locale: Locale): string {
  let names = languageNames.get(locale)
  if (!names) {
    names = new Intl.DisplayNames([intlLocale(locale)], { type: 'language' })
    languageNames.set(locale, names)
  }
  return names.of(code) ?? code
}

/** Several labels as one list in the page's language: "PhD candidate, Early postdoc". */
export function listOf(items: string[], locale: Locale): string {
  return new Intl.ListFormat(intlLocale(locale), { type: 'unit', style: 'long' }).format(items)
}
