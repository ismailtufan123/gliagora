import { type ListingDates, goneAt } from '@/lib/jobs/deadline'
import { SUBMISSION_RETENTION_DAYS } from '@/lib/review/status'

// When the scheduled tasks delete personal data (D34, PLAN §18.1) and close listings (PLAN §2.5).
// Every rule compares instants, which Payload stores in UTC, so daylight-saving changes never move
// a deadline for deletion: "30 days" is 30 × 24 hours and "12 months" is the same day and time of
// day a year later in UTC. The tasks that apply the rules are in src/jobs/maintenance/.

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

type Instant = Date | string | number

const toMs = (value: Instant) =>
  value instanceof Date ? value.getTime() : new Date(value).getTime()

/**
 * Rows of the form limits (hashed IP addresses and used spam-check answers, M4.5) are deleted by
 * the hourly task once they are this old, so no row is older than 24 hours (D34) between two runs.
 * The limit itself needs one hour of rows, and a spam-check challenge is valid for 21 hours.
 */
export const FORM_LIMIT_MAX_AGE_HOURS = 23

/** A candidate's source text is deleted this many days after the decision (D34, PLAN §5.1). */
export const SNIPPET_RETENTION_DAYS = 30

/**
 * A listing that went offline (it answers 410) is kept in full for this many months; then only
 * its address and ID stay, so the address keeps answering 410 (D34).
 */
export const OFFLINE_RECORD_MONTHS = 12

/**
 * An automatic acknowledgement is sent only for a report received within this many days and not
 * closed yet: after an outage of the mail server, or when email is first set up (M2), nobody gets
 * a "we have received your report" for something we have long answered.
 */
export const ACK_WINDOW_DAYS = 7

export { SUBMISSION_RETENTION_DAYS }

/** Form-limit rows created before this instant are deleted. */
export function formLimitCutoff(now: Instant): Date {
  return new Date(toMs(now) - FORM_LIMIT_MAX_AGE_HOURS * HOUR_MS)
}

/** Candidates decided at or before this instant lose their source text. */
export function snippetCutoff(now: Instant): Date {
  return new Date(toMs(now) - SNIPPET_RETENTION_DAYS * DAY_MS)
}

/** Whether a candidate decided at `decidedAt` has its source text deleted at `now`. */
export function snippetExpired(decidedAt: Instant | null | undefined, now: Instant): boolean {
  if (decidedAt == null) return false
  const decided = toMs(decidedAt)
  return !Number.isNaN(decided) && decided <= snippetCutoff(now).getTime()
}

/**
 * Whether a suggestion's personal data (email address, link and note) is deleted at `now`: from
 * the moment the collection set (`emailPurgeAt`, 90 days after the decision). A suggestion that is
 * not decided, or was reopened, has none.
 */
export function suggestionExpired(emailPurgeAt: Instant | null | undefined, now: Instant): boolean {
  if (emailPurgeAt == null) return false
  const at = toMs(emailPurgeAt)
  return !Number.isNaN(at) && at <= toMs(now)
}

/**
 * Candidates from a suggestion decided at or before this instant lose the suggested link and
 * title, also when the suggestion itself was deleted earlier (a data request): the same moment as
 * the suggestion's `emailPurgeAt`, 90 days after the decision.
 */
export function suggestionLinkCutoff(now: Instant): Date {
  return new Date(toMs(now) - SUBMISSION_RETENTION_DAYS * DAY_MS)
}

/**
 * The same UTC day and time `months` months later. A day the later month does not have runs over
 * into the next month (29 February plus 12 months is 1 March), as for reports (2 calendar years).
 */
export function addMonthsUtc(value: Instant, months: number): Date {
  const date = new Date(toMs(value))
  date.setUTCMonth(date.getUTCMonth() + months)
  return date
}

/**
 * When a listing is reduced to its address and ID: 12 months after its address started answering
 * 410 (withdrawn, or 30 days after it closed; `goneAt`). Null while its page is public.
 */
export function retireAt(listing: ListingDates, now: Instant = Date.now()): Date | null {
  const gone = goneAt(listing, now)
  return gone ? addMonthsUtc(gone, OFFLINE_RECORD_MONTHS) : null
}

/** Whether a listing is reduced to its address and ID at `now`. */
export function isRetirable(listing: ListingDates, now: Instant = Date.now()): boolean {
  const at = retireAt(listing, now)
  return at !== null && at.getTime() <= toMs(now)
}

/**
 * The latest instant a listing could have closed and still be retirable at `now`, for narrowing
 * the search in the database: `retireAt` is at least 12 months after it closed or was withdrawn.
 * One day of margin covers the months that `addMonthsUtc` makes a day longer; `isRetirable` then
 * decides exactly.
 */
export function retireSearchCutoff(now: Instant): Date {
  return new Date(addMonthsUtc(now, -OFFLINE_RECORD_MONTHS).getTime() + DAY_MS)
}

/** Reports received before this instant get no automatic acknowledgement any more. */
export function ackCutoff(now: Instant): Date {
  return new Date(toMs(now) - ACK_WINDOW_DAYS * DAY_MS)
}
