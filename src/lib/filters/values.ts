import { COUNTRY_CODE_PATTERN, REGIONS, type Region } from '@/lib/geography'
import { isCalendarDay } from '@/lib/jobs/deadline'
import { isRorId } from '@/lib/ror/ror-id'
import { SHORT_ID_PATTERN } from '@/lib/short-id'
import { SLUG_PATTERN } from '@/lib/taxonomy'

// The values of the shared filter parameters (PLAN §2.4), as read from a URL: each reader returns
// the value in its canonical spelling, or null for anything that cannot be one. Whether a value
// exists (a term, a country, an institution) is decided later, by the database.

/** Taxonomy slugs (`subfield`, `method`, `model`, `type`, `stage`), in lower case. */
export function readSlug(raw: string): string | null {
  const slug = raw.toLowerCase()
  return slug.length <= 64 && SLUG_PATTERN.test(slug) ? slug : null
}

/** ISO 3166-1 alpha-2 country codes, in upper case. */
export function readCountry(raw: string): string | null {
  const code = raw.toUpperCase()
  return COUNTRY_CODE_PATTERN.test(code) ? code : null
}

/** The UN M49 regions of src/lib/geography.ts. */
export function readRegion(raw: string): Region | null {
  const slug = raw.toLowerCase()
  return REGIONS.find((region) => region.value === slug)?.value ?? null
}

/** An institution: its ROR ID (with a valid checksum) or, without one, its 5-character short ID. */
export function readInstitution(raw: string): string | null {
  const id = raw.toLowerCase()
  return isRorId(id) || SHORT_ID_PATTERN.test(id) ? id : null
}

/** Deadline windows: closing within 7, 14 (the "Closing soon" badge), 30 or 90 days. */
export const DEADLINE_DAYS = [7, 14, 30, 90] as const

/** A deadline filter: a window from now, the current month, or a range of days (inclusive). */
export type DeadlineFilter =
  | { kind: 'within'; days: (typeof DEADLINE_DAYS)[number] }
  | { kind: 'this-month' }
  | { kind: 'range'; from: string; to: string }

/** The range of days `from..to` (YYYY-MM-DD, inclusive), or null unless both are days in order. */
export function deadlineRange(from: unknown, to: unknown): string | null {
  return isCalendarDay(from) && isCalendarDay(to) && from <= to ? `${from}..${to}` : null
}

/** What a canonical `deadline` value means, or null if it is not one. */
export function deadlineFilter(value: string): DeadlineFilter | null {
  if (value === 'this-month') return { kind: 'this-month' }
  const days = DEADLINE_DAYS.find((d) => value === `${d}d`)
  if (days) return { kind: 'within', days }
  const [from = '', to = '', extra] = value.split('..')
  return extra === undefined && deadlineRange(from, to) ? { kind: 'range', from, to } : null
}

/** `7d`, `14d`, `30d`, `90d`, `this-month` or `YYYY-MM-DD..YYYY-MM-DD` (in order). */
export function readDeadline(raw: string): string | null {
  const value = raw.toLowerCase()
  return deadlineFilter(value) ? value : null
}
