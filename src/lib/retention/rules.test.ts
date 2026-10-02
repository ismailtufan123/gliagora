import { describe, expect, it } from 'vitest'

import type { ListingDates } from '@/lib/jobs/deadline'
import { purgeAt } from '@/lib/review/status'

import {
  ACK_WINDOW_DAYS,
  CONSENT_LOG_YEARS,
  DATA_REQUEST_ANSWER_DAYS,
  DATA_REQUEST_LINK_HOURS,
  DATA_REQUEST_RETENTION_YEARS,
  DELETION_LOG_MONTHS,
  FORM_LIMIT_MAX_AGE_HOURS,
  INACTIVITY_GRACE_DAYS,
  INACTIVITY_MONTHS,
  MAX_PREFERRED_SUBFIELDS,
  MAX_SAVED_ITEMS,
  MAX_SESSIONS,
  NEWSLETTER_COOKIE_MINUTES,
  NEWSLETTER_LINK_DAYS,
  OFFLINE_RECORD_MONTHS,
  SESSION_DAYS,
  SIGN_IN_COOKIE_MINUTES,
  SIGN_IN_LINK_MINUTES,
  SNIPPET_RETENTION_DAYS,
  SUBMISSION_RETENTION_DAYS,
  UNCONFIRMED_REQUEST_DAYS,
  VERIFY_LINK_HOURS,
  WARNING_REFUSAL_RETRY_DAYS,
  REQUEST_EMAIL_WINDOW_DAYS,
  ackCutoff,
  addMonthsUtc,
  consentLogCutoff,
  deletionDueAt,
  deletionLogCutoff,
  formLimitCutoff,
  inactiveWithoutEmailCutoff,
  inactivityCutoff,
  isRetirable,
  retireAt,
  retireSearchCutoff,
  snippetCutoff,
  snippetExpired,
  suggestionExpired,
  suggestionLinkCutoff,
  monthsBeforeUtc,
  requestEmailCutoff,
  unconfirmedRequestCutoff,
  warningDeadlineDay,
  warningExpiredCutoff,
  warningRetryCutoff,
} from './rules'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const NOW = new Date('2026-10-15T04:15:00.000Z')
const before = (ms: number) => new Date(NOW.getTime() - ms)

describe('the periods D34 and the privacy texts set', () => {
  it('are 23 hours for form limits, 30 days for source text, 90 days for suggestions, 12 months for offline listings', () => {
    expect(FORM_LIMIT_MAX_AGE_HOURS).toBe(23)
    expect(SNIPPET_RETENTION_DAYS).toBe(30)
    expect(SUBMISSION_RETENTION_DAYS).toBe(90)
    expect(OFFLINE_RECORD_MONTHS).toBe(12)
    expect(ACK_WINDOW_DAYS).toBe(7)
  })

  it('are those of the M4b design (D49) for member accounts and data requests', () => {
    expect({
      SESSION_DAYS,
      SIGN_IN_LINK_MINUTES,
      VERIFY_LINK_HOURS,
      DATA_REQUEST_LINK_HOURS,
      SIGN_IN_COOKIE_MINUTES,
      INACTIVITY_MONTHS,
      INACTIVITY_GRACE_DAYS,
      WARNING_REFUSAL_RETRY_DAYS,
      DATA_REQUEST_ANSWER_DAYS,
      DATA_REQUEST_RETENTION_YEARS,
      UNCONFIRMED_REQUEST_DAYS,
      DELETION_LOG_MONTHS,
      MAX_SAVED_ITEMS,
      MAX_SESSIONS,
      MAX_PREFERRED_SUBFIELDS,
    }).toEqual({
      SESSION_DAYS: 30,
      SIGN_IN_LINK_MINUTES: 15,
      VERIFY_LINK_HOURS: 24,
      DATA_REQUEST_LINK_HOURS: 24,
      SIGN_IN_COOKIE_MINUTES: 15,
      INACTIVITY_MONTHS: 24,
      INACTIVITY_GRACE_DAYS: 30,
      WARNING_REFUSAL_RETRY_DAYS: 7,
      DATA_REQUEST_ANSWER_DAYS: 30,
      DATA_REQUEST_RETENTION_YEARS: 2,
      UNCONFIRMED_REQUEST_DAYS: 60,
      DELETION_LOG_MONTHS: 7,
      MAX_SAVED_ITEMS: 500,
      MAX_SESSIONS: 20,
      MAX_PREFERRED_SUBFIELDS: 12,
    })
    // The deletion log must outlive the backups that can hold deleted data (6 months).
    expect(DELETION_LOG_MONTHS).toBeGreaterThan(6)
  })

  it('are those of D50 for Glia Notes: 7 days to confirm, consent records 3 years', () => {
    expect({ NEWSLETTER_LINK_DAYS, NEWSLETTER_COOKIE_MINUTES, CONSENT_LOG_YEARS }).toEqual({
      NEWSLETTER_LINK_DAYS: 7,
      NEWSLETTER_COOKIE_MINUTES: 60,
      CONSENT_LOG_YEARS: 3,
    })
  })
})

describe('consentLogCutoff', () => {
  it('is 3 calendar years back, never shorter', () => {
    expect(consentLogCutoff(NOW)).toEqual(new Date('2023-10-15T04:15:00.000Z'))
    // 29 February counts back to the last day of February.
    expect(consentLogCutoff(new Date('2028-02-29T04:15:00.000Z'))).toEqual(
      new Date('2025-02-28T04:15:00.000Z'),
    )
  })
})

describe('formLimitCutoff', () => {
  it('deletes rows older than 23 hours, so none reaches 24 hours between hourly runs', () => {
    expect(formLimitCutoff(NOW)).toEqual(before(23 * HOUR))
    // The oldest row a run leaves is 23 hours old; an hour later, at the next run, 24 hours.
    const oldestKept = formLimitCutoff(NOW).getTime()
    expect(NOW.getTime() + HOUR - oldestKept).toBe(24 * HOUR)
  })
})

describe('snippetExpired', () => {
  it('is due from exactly 30 days after the decision', () => {
    expect(snippetCutoff(NOW)).toEqual(before(30 * DAY))
    expect(snippetExpired(before(30 * DAY), NOW)).toBe(true)
    expect(snippetExpired(before(30 * DAY - 1), NOW)).toBe(false)
    expect(snippetExpired(before(31 * DAY).toISOString(), NOW)).toBe(true)
  })

  it('never applies to a candidate that is not decided', () => {
    expect(snippetExpired(null, NOW)).toBe(false)
    expect(snippetExpired(undefined, NOW)).toBe(false)
    expect(snippetExpired('not a date', NOW)).toBe(false)
  })

  it('counts 30 × 24 hours across a daylight-saving change, since instants are UTC', () => {
    // Europe moved its clocks back on 25 October 2026: still 30 × 24 hours later in UTC.
    const decided = new Date('2026-10-10T09:00:00.000Z')
    expect(snippetExpired(decided, new Date('2026-11-09T09:00:00.000Z'))).toBe(true)
    expect(snippetExpired(decided, new Date('2026-11-09T08:59:59.999Z'))).toBe(false)
  })
})

describe('suggestionExpired', () => {
  it('is due from the moment the collection set (90 days after the decision)', () => {
    expect(suggestionExpired(NOW, NOW)).toBe(true)
    expect(suggestionExpired(new Date(NOW.getTime() + 1), NOW)).toBe(false)
    expect(suggestionExpired(before(1).toISOString(), NOW)).toBe(true)
  })

  it('deletes a suggestion exactly 90 days (90 × 24 hours) after the decision', () => {
    const decided = '2026-07-17T04:15:00.000Z'
    const at = purgeAt(decided)
    expect(at).toBe('2026-10-15T04:15:00.000Z')
    expect(suggestionExpired(at, NOW)).toBe(true)
    expect(suggestionExpired(at, new Date(NOW.getTime() - 1))).toBe(false)
  })

  it('clears the link of a candidate whose suggestion was deleted early at the same moment', () => {
    expect(suggestionLinkCutoff(NOW)).toEqual(before(90 * DAY))
    // A candidate decided at the cutoff: its suggestion would be due now as well.
    const decided = suggestionLinkCutoff(NOW).toISOString()
    expect(suggestionExpired(purgeAt(decided), NOW)).toBe(true)
    expect(suggestionExpired(purgeAt(decided), new Date(NOW.getTime() - 1))).toBe(false)
  })

  it('never applies before a decision, or after the suggestion was reopened', () => {
    expect(suggestionExpired(null, NOW)).toBe(false)
    expect(suggestionExpired(undefined, NOW)).toBe(false)
  })
})

describe('addMonthsUtc', () => {
  it('keeps the UTC day and time of day, whatever the local clocks do', () => {
    // 29 March 2026 is the European change to summer time; 12 months later is still 00:30 UTC.
    expect(addMonthsUtc('2026-03-29T00:30:00.000Z', 12).toISOString()).toBe(
      '2027-03-29T00:30:00.000Z',
    )
    expect(addMonthsUtc('2026-10-15T04:15:00.000Z', -12).toISOString()).toBe(
      '2025-10-15T04:15:00.000Z',
    )
  })

  it('runs a leap day over into 1 March, as for reports', () => {
    expect(addMonthsUtc('2028-02-29T12:00:00.000Z', 12).toISOString()).toBe(
      '2029-03-01T12:00:00.000Z',
    )
  })
})

describe('retireAt and isRetirable', () => {
  const withdrawn = (at: Date): ListingDates => ({
    status: 'withdrawn',
    deadlineKind: 'fixed',
    deadlineAt: new Date(at.getTime() + 20 * DAY),
    withdrawnAt: at,
  })

  it('retires a withdrawn listing exactly 12 months after it was withdrawn', () => {
    const at = new Date('2025-10-15T04:15:00.000Z')
    expect(retireAt(withdrawn(at), NOW)).toEqual(new Date('2026-10-15T04:15:00.000Z'))
    expect(isRetirable(withdrawn(at), NOW)).toBe(true)
    expect(isRetirable(withdrawn(new Date(at.getTime() + 1)), NOW)).toBe(false)
  })

  it('retires a closed listing 30 days plus 12 months after it closed', () => {
    const closed = new Date('2025-09-15T04:15:00.000Z')
    const expired: ListingDates = {
      status: 'expired',
      deadlineKind: 'fixed',
      deadlineAt: closed,
      expiredAt: new Date(closed.getTime() + 10 * 60_000),
    }
    // Gone (410) on 15 October 2025, 30 days after it closed; retired 12 months later.
    expect(retireAt(expired, NOW)).toEqual(new Date('2026-10-15T04:15:00.000Z'))
    expect(isRetirable(expired, NOW)).toBe(true)
    expect(isRetirable(expired, new Date(NOW.getTime() - 1))).toBe(false)
  })

  it('counts from the expiry of a position filled before its deadline, and of a rolling one', () => {
    const filled: ListingDates = {
      status: 'expired',
      deadlineKind: 'rolling',
      deadlineAt: null,
      expiredAt: new Date('2025-09-15T04:15:00.000Z'),
    }
    expect(retireAt(filled, NOW)).toEqual(new Date('2026-10-15T04:15:00.000Z'))
  })

  it('never retires a listing whose page is public, or a draft', () => {
    const open: ListingDates = {
      status: 'published',
      deadlineKind: 'fixed',
      deadlineAt: new Date(NOW.getTime() + DAY),
    }
    expect(retireAt(open, NOW)).toBeNull()
    expect(isRetirable(open, NOW)).toBe(false)
    expect(isRetirable({ status: 'draft', deadlineKind: 'rolling' }, NOW)).toBe(false)
    expect(isRetirable({ status: 'in_review', deadlineKind: 'fixed', deadlineAt: 0 }, NOW)).toBe(
      false,
    )
  })

  it('also retires a published job whose deadline passed long ago but was never marked expired', () => {
    const stale: ListingDates = {
      status: 'published',
      deadlineKind: 'fixed',
      deadlineAt: new Date('2025-09-01T22:00:00.000Z'),
    }
    expect(isRetirable(stale, NOW)).toBe(true)
  })
})

describe('retireSearchCutoff', () => {
  it('reaches back at most 12 months and a day, so the database search misses no due listing', () => {
    const cutoff = retireSearchCutoff(NOW)
    expect(cutoff).toEqual(new Date('2025-10-16T04:15:00.000Z'))
    // Every listing gone by the cutoff's day before is due now.
    const gone = new Date(cutoff.getTime() - DAY)
    expect(
      isRetirable({ status: 'withdrawn', deadlineKind: 'rolling', withdrawnAt: gone }, NOW),
    ).toBe(true)
  })
})

describe('ackCutoff', () => {
  it('acknowledges reports received within the last 7 days', () => {
    expect(ackCutoff(NOW)).toEqual(before(7 * DAY))
  })
})

describe('monthsBeforeUtc', () => {
  it('keeps the UTC day and time of day', () => {
    expect(monthsBeforeUtc('2026-10-15T04:15:00.000Z', 24).toISOString()).toBe(
      '2024-10-15T04:15:00.000Z',
    )
    expect(monthsBeforeUtc('2026-10-15T04:15:00.000Z', 7).toISOString()).toBe(
      '2026-03-15T04:15:00.000Z',
    )
  })

  it('takes a day the earlier month lacks as its last day, so a period is never shorter', () => {
    // 29 February, 24 months back: 2026 has no 29 February.
    expect(monthsBeforeUtc('2028-02-29T05:30:00.000Z', 24).toISOString()).toBe(
      '2026-02-28T05:30:00.000Z',
    )
    // 31 May, 7 months back: October has 31 days; 31 October, 7 months back: 31 March.
    expect(monthsBeforeUtc('2027-05-31T05:30:00.000Z', 7).toISOString()).toBe(
      '2026-10-31T05:30:00.000Z',
    )
    expect(monthsBeforeUtc('2026-09-30T05:30:00.000Z', 7).toISOString()).toBe(
      '2026-02-28T05:30:00.000Z',
    )
    // Counted forward again, never past the moment counted back from.
    for (const now of [
      '2028-02-29T05:30:00.000Z',
      '2026-12-31T05:30:00.000Z',
      '2027-03-31T00:00:00.000Z',
    ]) {
      for (const months of [1, 7, 24]) {
        expect(addMonthsUtc(monthsBeforeUtc(now, months), months).getTime()).toBeLessThanOrEqual(
          new Date(now).getTime(),
        )
      }
    }
  })
})

describe('inactivity (PLAN §18.1, the M4b design §7.7)', () => {
  const RUN = new Date('2026-10-01T05:30:00.000Z')

  it('warns members with an address 24 months after their last activity, to the minute', () => {
    expect(inactivityCutoff(RUN).toISOString()).toBe('2024-10-01T05:30:00.000Z')
    const lastSeen = (iso: string) => new Date(iso).getTime() <= inactivityCutoff(RUN).getTime()
    expect(lastSeen('2024-10-01T05:30:00.000Z')).toBe(true)
    expect(lastSeen('2024-10-01T05:30:00.001Z')).toBe(false)
  })

  it('around 29 February: never before 24 calendar months', () => {
    const leap = new Date('2028-02-29T05:30:00.000Z')
    expect(inactivityCutoff(leap).toISOString()).toBe('2026-02-28T05:30:00.000Z')
    // A member last seen on the leap day itself: 2030 has no 29 February, so the 24 months end on
    // 28 February at noon; the first run after that is the one on 1 March.
    const fromLeapDay = new Date('2028-02-29T12:00:00.000Z').getTime()
    expect(fromLeapDay <= inactivityCutoff('2030-02-28T05:30:00.000Z').getTime()).toBe(false)
    expect(fromLeapDay <= inactivityCutoff('2030-03-01T05:30:00.000Z').getTime()).toBe(true)
  })

  it('deletes members without an address at 24 months and 30 days, without warning', () => {
    expect(inactiveWithoutEmailCutoff(RUN).toISOString()).toBe('2024-09-01T05:30:00.000Z')
    expect(inactiveWithoutEmailCutoff('2028-02-29T05:30:00.000Z').toISOString()).toBe(
      '2026-01-29T05:30:00.000Z',
    )
  })

  it('deletes warned members 30 days after the warning, at the earliest', () => {
    expect(warningExpiredCutoff(RUN)).toEqual(new Date(RUN.getTime() - 30 * DAY))
    const warned = new Date('2026-10-01T05:30:12.000Z')
    expect(deletionDueAt(warned).toISOString()).toBe('2026-10-31T05:30:12.000Z')
    // The run 30 days later, at 05:30:00, comes a few seconds early; the next day's deletes.
    expect(warned.getTime() <= warningExpiredCutoff('2026-10-31T05:30:00.000Z').getTime()).toBe(
      false,
    )
    expect(warned.getTime() <= warningExpiredCutoff('2026-11-01T05:30:00.000Z').getTime()).toBe(
      true,
    )
    // A run that comes a little later than the warning's did deletes on that UTC day.
    expect(warned.getTime() <= warningExpiredCutoff('2026-10-31T05:30:20.000Z').getTime()).toBe(
      true,
    )
  })

  it('names a day in the warning that holds in every time zone, down to UTC−12', () => {
    // The daily run at 05:30 UTC: "sign in before 30 Oct" for a deletion from 31 Oct 05:30 UTC.
    expect(warningDeadlineDay('2026-10-01T05:30:12.000Z')).toBe('2026-10-30')
    // The day before the named day ends at UTC−12 at noon UTC of the named day: no later than the
    // earliest moment of the deletion, for a warning at any time of day (a run started by hand).
    // The day after the named one would not hold: the named day is the latest that does.
    const noonUtc = (day: string, plusDays = 0) =>
      Date.parse(`${day}T12:00:00.000Z`) + plusDays * DAY
    for (let minute = 0; minute < 24 * 60; minute += 7) {
      const warnedAt = new Date(Date.parse('2026-10-01T00:00:00.000Z') + minute * 60_000)
      const day = warningDeadlineDay(warnedAt)
      const earliest = deletionDueAt(warnedAt).getTime()
      expect(noonUtc(day), warnedAt.toISOString()).toBeLessThanOrEqual(earliest)
      expect(noonUtc(day, 1), warnedAt.toISOString()).toBeGreaterThan(earliest)
      // And the end of that day before, in Etc/GMT+12, is the same instant.
      const lastMoment = new Date(noonUtc(day) - 1)
      expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'Etc/GMT+12' }).format(lastMoment)).toBe(
        new Date(noonUtc(day, -1)).toISOString().slice(0, 10),
      )
    }
  })

  it('counts an address as unreachable only when refused again at least 7 days later', () => {
    expect(warningRetryCutoff(RUN)).toEqual(new Date(RUN.getTime() - 7 * DAY))
    const refused = new Date('2026-09-24T05:30:00.000Z')
    expect(refused.getTime() <= warningRetryCutoff(RUN).getTime()).toBe(true)
    // Six days later: not tried again yet.
    expect(refused.getTime() <= warningRetryCutoff('2026-09-30T05:30:00.000Z').getTime()).toBe(
      false,
    )
  })
})

describe('data requests and the deletion log (the M4b design §6)', () => {
  it('deletes an unconfirmed request 60 days after it arrived', () => {
    expect(unconfirmedRequestCutoff(NOW)).toEqual(before(60 * DAY))
  })

  it('keeps deletion-log rows 7 calendar months, longer than any backup', () => {
    expect(deletionLogCutoff(NOW).toISOString()).toBe('2026-03-15T04:15:00.000Z')
    expect(deletionLogCutoff('2026-09-30T04:15:00.000Z').toISOString()).toBe(
      '2026-02-28T04:15:00.000Z',
    )
    // Never less than 6 months plus a day.
    for (const now of ['2026-09-30T04:15:00.000Z', '2027-08-31T04:15:00.000Z']) {
      expect(addMonthsUtc(deletionLogCutoff(now), 6).getTime() + DAY).toBeLessThan(
        new Date(now).getTime(),
      )
    }
  })

  it('sends the final email of a request received within the last 7 days', () => {
    expect(REQUEST_EMAIL_WINDOW_DAYS).toBe(7)
    expect(requestEmailCutoff(NOW)).toEqual(before(7 * DAY))
  })
})
