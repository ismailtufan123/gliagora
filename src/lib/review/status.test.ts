import { describe, expect, it } from 'vitest'

import {
  CANDIDATE_KIND_OF,
  CANDIDATE_STATUSES,
  type CandidateStatus,
  REJECTION_REASONS,
  decidedAt,
  isDecided,
  purgeAt,
  submissionState,
  transitionProblem,
} from './status'

const STATUSES = CANDIDATE_STATUSES.map(({ value }) => value)
const now = new Date('2026-09-28T09:00:00.000Z')

describe('candidate statuses', () => {
  it('follow PLAN §5.2: new → triaged → accepted, rejected or duplicate', () => {
    expect(STATUSES).toEqual(['new', 'triaged', 'accepted', 'rejected', 'duplicate'])
    expect(STATUSES.filter(isDecided)).toEqual(['accepted', 'rejected', 'duplicate'])
  })

  it('start as new or triaged', () => {
    expect(transitionProblem(undefined, 'new')).toBeNull()
    expect(transitionProblem(undefined, 'triaged')).toBeNull()
    for (const status of ['accepted', 'rejected', 'duplicate'] as const) {
      expect(transitionProblem(undefined, status)).toMatch(/starts as New or Triaged/)
    }
  })

  it('let an open candidate be decided, or triaged', () => {
    for (const from of ['new', 'triaged'] as const) {
      for (const to of ['triaged', 'accepted', 'rejected', 'duplicate'] as const) {
        expect(transitionProblem(from, to)).toBeNull()
      }
    }
    expect(transitionProblem('triaged', 'new')).toMatch(/does not go back to New/)
  })

  it('keep an accepted candidate accepted', () => {
    for (const to of STATUSES) {
      const problem = transitionProblem('accepted', to)
      if (to === 'accepted') expect(problem).toBeNull()
      else expect(problem).toMatch(/final/)
    }
  })

  it('reopen a rejected or duplicate candidate only as triaged', () => {
    for (const from of ['rejected', 'duplicate'] as const) {
      expect(transitionProblem(from, from)).toBeNull()
      expect(transitionProblem(from, 'triaged')).toBeNull()
      for (const to of STATUSES.filter((s) => s !== from && s !== 'triaged')) {
        expect(transitionProblem(from, to as CandidateStatus)).toMatch(/reopen/)
      }
    }
  })

  it('record when a decision was made, and forget it on reopening', () => {
    expect(decidedAt(undefined, 'accepted', now)).toBe(now.toISOString())
    expect(decidedAt({ status: 'triaged' }, 'rejected', now)).toBe(now.toISOString())
    const earlier = '2026-09-01T08:00:00.000Z'
    expect(decidedAt({ status: 'rejected', decidedAt: earlier }, 'rejected', now)).toBe(earlier)
    expect(decidedAt({ status: 'rejected', decidedAt: earlier }, 'triaged', now)).toBeNull()
    expect(decidedAt({ status: 'new' }, 'new', now)).toBeNull()
  })

  it('name the agency rule among the reasons for rejecting (PLAN §6.1)', () => {
    expect(REJECTION_REASONS.map(({ value }) => value)).toEqual([
      'not-neuroscience',
      'not-research',
      'agency-or-intermediary',
      'closed',
      'not-a-position',
      'not-employer-page',
      'spam',
      'other',
    ])
    expect(REJECTION_REASONS[2].label).toMatch(/Law 4904/)
  })
})

describe('suggestions', () => {
  it('become job candidates only as positions, until the other windows exist', () => {
    expect(CANDIDATE_KIND_OF).toEqual({ position: 'job' })
  })

  it('lose the email address, link and note 90 days after the decision (D34)', () => {
    expect(purgeAt('2026-09-28T09:00:00.000Z')).toBe('2026-12-27T09:00:00.000Z')
    expect(purgeAt(null)).toBeNull()
    expect(purgeAt('not a date')).toBeNull()
  })

  it('follow their candidate', () => {
    const own = { status: 'new' as const }
    expect(submissionState({ status: 'new' }, own, now)).toEqual({
      status: 'queued',
      decidedAt: null,
      emailPurgeAt: null,
    })
    expect(submissionState({ status: 'triaged' }, own, now).status).toBe('queued')
    const decided = '2026-09-20T10:00:00.000Z'
    for (const status of ['accepted', 'rejected', 'duplicate']) {
      expect(submissionState({ status, decidedAt: decided }, own, now)).toEqual({
        status: 'decided',
        decidedAt: decided,
        emailPurgeAt: '2026-12-19T10:00:00.000Z',
      })
    }
  })

  it('without a candidate, are decided by hand', () => {
    expect(submissionState(null, { status: 'new' }, now)).toEqual({
      status: 'new',
      decidedAt: null,
      emailPurgeAt: null,
    })
    expect(submissionState(null, { status: 'decided' }, now)).toEqual({
      status: 'decided',
      decidedAt: now.toISOString(),
      emailPurgeAt: '2026-12-27T09:00:00.000Z',
    })
    // Saving it again keeps the day it was decided.
    const saved = { status: 'decided', decidedAt: '2026-09-01T08:00:00.000Z' }
    expect(submissionState(null, { status: 'decided', saved }, now).decidedAt).toBe(saved.decidedAt)
    expect(submissionState(null, { status: 'new', saved }, now).decidedAt).toBeNull()
  })
})
