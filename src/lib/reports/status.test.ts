import { describe, expect, it } from 'vitest'

import {
  JOB_ONLY_KINDS,
  OTHER_ANSWER_DAYS,
  PERSONAL_RIGHTS_ANSWER_HOURS,
  REPORT_KINDS,
  REPORT_RETENTION_YEARS,
  closing,
  kindsFor,
  purgeAt,
  respondBy,
  statusProblem,
} from './status'

const RECEIVED = '2026-09-28T10:15:00.000Z'

describe('kindsFor', () => {
  const ALL = REPORT_KINDS.map(({ value }) => value)

  it('offers every kind for a job, and for a report about nothing in particular', () => {
    expect(kindsFor('job')).toEqual(ALL)
    expect(kindsFor(null)).toEqual(ALL)
    expect(kindsFor(undefined)).toEqual(ALL)
  })

  it('leaves out, for an institution, what only a position can be: closed, or not from the employer', () => {
    expect(JOB_ONLY_KINDS).toEqual(['closed', 'not-employer'])
    expect(kindsFor('institution')).toEqual([
      'wrong-fact',
      'broken-link',
      'personal-rights',
      'other',
    ])
  })
})

describe('respondBy', () => {
  it('gives a personal-rights request 24 hours (PLAN §3.2, §15.1, §15.4)', () => {
    expect(PERSONAL_RIGHTS_ANSWER_HOURS).toBe(24)
    expect(respondBy('personal-rights', RECEIVED)).toBe('2026-09-29T10:15:00.000Z')
  })

  it('gives every other report 30 days (PLAN §3.2, KVKK Art. 13)', () => {
    expect(OTHER_ANSWER_DAYS).toBe(30)
    for (const { value } of REPORT_KINDS.filter((kind) => kind.value !== 'personal-rights')) {
      expect(respondBy(value, RECEIVED), value).toBe('2026-10-28T10:15:00.000Z')
    }
  })

  it('reads a date as well as a string', () => {
    expect(respondBy('wrong-fact', new Date(RECEIVED))).toBe('2026-10-28T10:15:00.000Z')
  })
})

describe('purgeAt', () => {
  it('is 2 calendar years after the report was closed (PLAN §18.1)', () => {
    expect(REPORT_RETENTION_YEARS).toBe(2)
    expect(purgeAt('2026-10-02T08:00:00.000Z')).toBe('2028-10-02T08:00:00.000Z')
    // A leap day has no twin two years later: the next day.
    expect(purgeAt('2028-02-29T12:00:00.000Z')).toBe('2030-03-01T12:00:00.000Z')
  })

  it('is empty while the report is open', () => {
    expect(purgeAt(null)).toBeNull()
    expect(purgeAt(undefined)).toBeNull()
    expect(purgeAt('not a date')).toBeNull()
  })
})

describe('closing', () => {
  const now = new Date('2026-10-01T09:00:00.000Z')

  it('sets the time a report is closed, and the day it is deleted', () => {
    expect(closing({ status: 'in-progress' }, 'closed', now)).toEqual({
      closedAt: '2026-10-01T09:00:00.000Z',
      purgeAt: '2028-10-01T09:00:00.000Z',
    })
  })

  it('keeps them while the report stays closed', () => {
    const saved = { status: 'closed', closedAt: '2026-09-29T09:00:00.000Z' }
    expect(closing(saved, 'closed', now)).toEqual({
      closedAt: '2026-09-29T09:00:00.000Z',
      purgeAt: '2028-09-29T09:00:00.000Z',
    })
  })

  it('clears them when a report is reopened, and on open reports', () => {
    const saved = { status: 'closed', closedAt: '2026-09-29T09:00:00.000Z' }
    expect(closing(saved, 'in-progress', now)).toEqual({ closedAt: null, purgeAt: null })
    expect(closing(undefined, 'new', now)).toEqual({ closedAt: null, purgeAt: null })
  })
})

describe('statusProblem', () => {
  it('starts every report as New', () => {
    expect(statusProblem(undefined, 'new')).toBeNull()
    expect(statusProblem(undefined, 'closed')).toMatch(/starts as New/)
  })

  it('moves forward, and reopens a closed report as In progress', () => {
    expect(statusProblem('new', 'in-progress')).toBeNull()
    expect(statusProblem('new', 'closed')).toBeNull()
    expect(statusProblem('in-progress', 'closed')).toBeNull()
    expect(statusProblem('closed', 'in-progress')).toBeNull()
    expect(statusProblem('closed', 'closed')).toBeNull()
  })

  it('never goes back to New', () => {
    expect(statusProblem('in-progress', 'new')).toMatch(/does not go back to New/)
    expect(statusProblem('closed', 'new')).toMatch(/does not go back to New/)
  })
})
