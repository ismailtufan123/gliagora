import { describe, expect, it } from 'vitest'

import type { ListingDates } from '@/lib/jobs/deadline'
import { purgeAt } from '@/lib/review/status'

import {
  ACK_WINDOW_DAYS,
  FORM_LIMIT_MAX_AGE_HOURS,
  OFFLINE_RECORD_MONTHS,
  SNIPPET_RETENTION_DAYS,
  SUBMISSION_RETENTION_DAYS,
  ackCutoff,
  addMonthsUtc,
  formLimitCutoff,
  isRetirable,
  retireAt,
  retireSearchCutoff,
  snippetCutoff,
  snippetExpired,
  suggestionExpired,
  suggestionLinkCutoff,
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
