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
 * A posting a monitor saw (`source-postings`, M7) is forgotten once its source's list has not
 * named it for this many days; by then its deadline has long passed.
 */
export const SOURCE_POSTING_DAYS = 180

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

// Member accounts and self-service privacy (M4b, D49; PLAN §18.1). The sign-in core
// (src/lib/members/) uses the lifetimes; the member tasks (src/jobs/maintenance/:
// cleanInactiveMembers, purgeMemberAuth, applyDeletionLog, sendRequestEmails) and the retention
// task apply the periods, through the functions below.

/** A session lasts this long from sign-in, never extended (PLAN §18.1). */
export const SESSION_DAYS = 30
/** A sign-in link works this long, once. */
export const SIGN_IN_LINK_MINUTES = 15
/** A link that adds an email address to an account works this long, once. */
export const VERIFY_LINK_HOURS = 24
/** A link that confirms a data request works this long, once. */
export const DATA_REQUEST_LINK_HOURS = 24
/** The sealed sign-in cookie (an OAuth flow, the confirm step, an email link's binding). */
export const SIGN_IN_COOKIE_MINUTES = 15
/** An account unused this long is warned, then deleted INACTIVITY_GRACE_DAYS later. */
export const INACTIVITY_MONTHS = 24
export const INACTIVITY_GRACE_DAYS = 30
/** A warning refused as "no such address" counts only when refused again this many days later. */
export const WARNING_REFUSAL_RETRY_DAYS = 7
/** A confirmed data request is answered within this many days of receipt (KVKK Art. 13). */
export const DATA_REQUEST_ANSWER_DAYS = 30
/** A closed data request is kept this long, then deleted (as reports, PLAN §18.1). */
export const DATA_REQUEST_RETENTION_YEARS = 2
/** What is left of a request nobody confirmed (kind, date, keyed address hash) is kept this long. */
export const UNCONFIRMED_REQUEST_DAYS = 60
/**
 * Rows of the deletion log (record IDs only) are kept this long: longer than the 6 months a backup
 * can hold the deleted data, so a restore of any backup can still repeat each deletion.
 */
export const DELETION_LOG_MONTHS = 7
/**
 * The final email about a data request (an account deleted in its settings, M4b) goes out only for
 * a request received within this many days: after an outage of the mail server, or when email is
 * first set up (M2), nobody gets one for something done long ago.
 */
export const REQUEST_EMAIL_WINDOW_DAYS = 7
/** Limits on what one member can store. */
export const MAX_SAVED_ITEMS = 500
export const MAX_SESSIONS = 20
export const MAX_PREFERRED_SUBFIELDS = 12

// Glia Notes (M2, D50; PLAN §13, §18.1). The signup's link is in src/lib/newsletter/ and the
// members' store (`email_tokens`); the consent records are deleted by the retention task.

/**
 * A link that confirms a Glia Notes signup works this long, once. Until then the signup is only
 * that link's row (address, locale, consent version), which `purgeMemberAuth` deletes within the
 * hour after it expired: unconfirmed addresses are gone after 7 days (PLAN §13).
 */
export const NEWSLETTER_LINK_DAYS = 7
/**
 * The sealed cookie after the newsletter form (the address the link went to, for "Check your
 * inbox" and "Send it again") lasts this long from the form; "Send it again" never extends it.
 */
export const NEWSLETTER_COOKIE_MINUTES = 60
/**
 * Consent records are kept this long after the subscription ended (its newest record, an
 * unsubscribe: through the site, or noted when listmonk no longer had the subscriber), a record
 * without a subscriber (unlinked by an erasure) this long after its own time (PLAN §18.1, `[U]`
 * for the lawyer).
 */
export const CONSENT_LOG_YEARS = 3

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

/**
 * The same UTC day and time `months` months earlier; a day the earlier month does not have becomes
 * that month's last day (29 February 2028 minus 24 months is 28 February 2026). A period counted
 * back from now this way is never shorter than its months, at most a day longer: a member last
 * seen at noon on 28 February 2026 counts as 24 months away from the run at 05:30 on 1 March 2028,
 * not from the one on 29 February (which looks back to 05:30 on 28 February). `addMonthsUtc`, for
 * periods counted forward, runs over into the next month instead, with the same effect.
 */
export function monthsBeforeUtc(value: Instant, months: number): Date {
  const date = new Date(toMs(value))
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() - months)
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
  return date
}

/**
 * Members with an email address last seen at or before this instant are warned that their account
 * will be deleted (24 months without activity, PLAN §18.1).
 */
export function inactivityCutoff(now: Instant): Date {
  return monthsBeforeUtc(now, INACTIVITY_MONTHS)
}

/**
 * Members without an email address (nobody to warn) last seen at or before this instant are
 * deleted: 24 months and 30 days after their last activity.
 */
export function inactiveWithoutEmailCutoff(now: Instant): Date {
  return new Date(inactivityCutoff(now).getTime() - INACTIVITY_GRACE_DAYS * DAY_MS)
}

/**
 * Members warned at or before this instant, and not seen since the warning, are deleted: 30 days
 * after the warning.
 */
export function warningExpiredCutoff(now: Instant): Date {
  return new Date(toMs(now) - INACTIVITY_GRACE_DAYS * DAY_MS)
}

/**
 * The earliest moment an account warned at `warnedAt` can be deleted (30 days later): the daily run
 * deletes it then or the day after (a run at the same minute 30 days on can come a few seconds
 * early). The warning names an earlier day (`warningDeadlineDay`).
 */
export function deletionDueAt(warnedAt: Instant): Date {
  return new Date(toMs(warnedAt) + INACTIVITY_GRACE_DAYS * DAY_MS)
}

/** The westernmost time zone (UTC−12), where a calendar day ends last: Anywhere on Earth. */
const AOE_OFFSET_MS = 12 * HOUR_MS

/**
 * The day the inactivity warning names ("To keep it, sign in before …"), as `YYYY-MM-DD`: the
 * latest day N such that the day before it has ended everywhere, even at UTC−12 (N at 12:00 UTC),
 * by the earliest moment the account can be deleted (`deletionDueAt`). A reader in any time zone
 * who signs in before N keeps the account; the deletion comes on day N or later, wherever they are.
 * The date has no time zone of its own, as the reader's is unknown (CLAUDE.md: calendar days).
 */
export function warningDeadlineDay(warnedAt: Instant): string {
  return new Date(deletionDueAt(warnedAt).getTime() - AOE_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * A warning the mail server refused as "no such address" (a recipient refused at RCPT TO with
 * 5.1.0–5.1.3, 5.1.6 or 5.1.10, in a run where it accepted some other warning) at or before this
 * instant is sent again: refused again, the address counts as unreachable and the 30 days start
 * without a delivered warning. Refused later than this, the member is not tried again yet.
 */
export function warningRetryCutoff(now: Instant): Date {
  return new Date(toMs(now) - WARNING_REFUSAL_RETRY_DAYS * DAY_MS)
}

/** Data requests nobody confirmed, received at or before this instant, are deleted (60 days). */
export function unconfirmedRequestCutoff(now: Instant): Date {
  return new Date(toMs(now) - UNCONFIRMED_REQUEST_DAYS * DAY_MS)
}

/** Rows of the deletion log written at or before this instant are deleted (7 months). */
export function deletionLogCutoff(now: Instant): Date {
  return monthsBeforeUtc(now, DELETION_LOG_MONTHS)
}

/** Data requests received before this instant get no final email any more (7 days). */
export function requestEmailCutoff(now: Instant): Date {
  return new Date(toMs(now) - REQUEST_EMAIL_WINDOW_DAYS * DAY_MS)
}

/**
 * Consent records of a subscription that ended (its newest record is an unsubscribe) at or before
 * this instant are deleted, and records without a subscriber written at or before it (3 calendar
 * years).
 */
export function consentLogCutoff(now: Instant): Date {
  return monthsBeforeUtc(now, CONSENT_LOG_YEARS * 12)
}
