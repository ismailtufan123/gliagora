import { describe, expect, it } from 'vitest'

import { OTHER_ANSWER_DAYS, REPORT_RETENTION_YEARS } from '@/lib/reports/status'
import { DATA_REQUEST_ANSWER_DAYS, DATA_REQUEST_RETENTION_YEARS } from '@/lib/retention/rules'

import { requestAddressHash } from './address'
import { DATA_REQUEST_KINDS, isDataRequestKind } from './kinds'
import {
  DATA_REQUEST_STATUSES,
  type DataRequestStatus,
  actionProblem,
  answerBy,
  requestDates,
  statusProblem,
} from './status'

const RECEIVED = '2026-10-01T10:00:00.000Z'
const NOW = new Date('2026-10-05T12:00:00.000Z')
const STATUSES = DATA_REQUEST_STATUSES.map(({ value }) => value)

describe('data request kinds', () => {
  it('are the rights the data-requests page names', () => {
    expect(DATA_REQUEST_KINDS.map(({ value }) => value)).toEqual([
      'deletion',
      'access',
      'correction',
      'objection',
      'restriction',
      'withdraw-consent',
      'other',
    ])
    expect(isDataRequestKind('deletion')).toBe(true)
    expect(isDataRequestKind('delete')).toBe(false)
  })
})

describe('statusProblem', () => {
  it('lets editors record emailed requests as New, and move them on', () => {
    expect(statusProblem(undefined, 'new', true)).toBeNull()
    for (const to of ['unconfirmed', 'in-progress', 'closed'] as const) {
      expect(statusProblem(undefined, to, true)).not.toBeNull()
    }
    expect(statusProblem('new', 'in-progress', true)).toBeNull()
    expect(statusProblem('in-progress', 'closed', true)).toBeNull()
    expect(statusProblem('closed', 'in-progress', true)).toBeNull()
  })

  it('never lets editors set or leave "not confirmed": only the person’s link does', () => {
    for (const from of STATUSES) {
      if (from !== 'unconfirmed') expect(statusProblem(from, 'unconfirmed', true)).not.toBeNull()
    }
    for (const to of STATUSES) {
      const problem = statusProblem('unconfirmed', to, true)
      if (to === 'unconfirmed') expect(problem).toBeNull()
      else expect(problem).not.toBeNull()
    }
  })

  it('lets the site record what the form and the settings did, and confirm requests', () => {
    for (const to of STATUSES) expect(statusProblem(undefined, to, false)).toBeNull()
    expect(statusProblem('unconfirmed', 'new', false)).toBeNull()
    expect(statusProblem('unconfirmed', 'closed', false)).toBeNull()
    expect(statusProblem('new', 'unconfirmed', false)).not.toBeNull()
  })

  it('never moves a request back to New', () => {
    for (const byEditor of [true, false]) {
      for (const from of ['in-progress', 'closed'] as DataRequestStatus[]) {
        expect(statusProblem(from, 'new', byEditor)).toMatch(/back to New/)
      }
    }
  })
})

describe('actionProblem', () => {
  it('keeps "deleted automatically" for the site', () => {
    expect(actionProblem(null, 'deleted-automatically', true)).not.toBeNull()
    expect(actionProblem('deleted-automatically', 'deleted-automatically', true)).toBeNull()
    expect(actionProblem(null, 'deleted-automatically', false)).toBeNull()
    expect(actionProblem(null, 'answered', true)).toBeNull()
  })
})

describe('requestDates', () => {
  it('keeps an unconfirmed request 60 days, with nothing due', () => {
    expect(requestDates(undefined, 'unconfirmed', RECEIVED, NOW)).toEqual({
      respondBy: null,
      closedAt: null,
      purgeAt: '2026-11-30T10:00:00.000Z',
    })
  })

  it('makes a confirmed request due 30 days after receipt, not after confirmation', () => {
    expect(requestDates({ status: 'unconfirmed' }, 'new', RECEIVED, NOW)).toEqual({
      respondBy: '2026-10-31T10:00:00.000Z',
      closedAt: null,
      purgeAt: null,
    })
    expect(answerBy(RECEIVED)).toBe('2026-10-31T10:00:00.000Z')
  })

  it('deletes a closed request 2 years after it was closed, as a report', () => {
    expect(requestDates({ status: 'unconfirmed' }, 'closed', RECEIVED, NOW)).toEqual({
      respondBy: '2026-10-31T10:00:00.000Z',
      closedAt: NOW.toISOString(),
      purgeAt: '2028-10-05T12:00:00.000Z',
    })
    // Closed earlier: the dates stay.
    const closedAt = '2026-10-02T09:00:00.000Z'
    expect(requestDates({ status: 'closed', closedAt }, 'closed', RECEIVED, NOW)).toMatchObject({
      closedAt,
      purgeAt: '2028-10-02T09:00:00.000Z',
    })
    // The report helpers are reused because the periods are the same.
    expect(DATA_REQUEST_RETENTION_YEARS).toBe(REPORT_RETENTION_YEARS)
    expect(DATA_REQUEST_ANSWER_DAYS).toBe(OTHER_ANSWER_DAYS)
  })
})

describe('requestAddressHash', () => {
  it('is a keyed hash of the address as stored, never the address', () => {
    const hash = requestAddressHash(' Someone@Example.org ', 'secret-a')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(requestAddressHash('someone@example.org', 'secret-a')).toBe(hash)
    // Another address in law, even if it reaches the same mailbox.
    expect(requestAddressHash('someone+tag@example.org', 'secret-a')).not.toBe(hash)
    expect(requestAddressHash('someone@example.org', 'secret-b')).not.toBe(hash)
    expect(requestAddressHash('not an address', 'secret-a')).toBeNull()
  })
})
