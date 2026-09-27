import { describe, expect, it } from 'vitest'

import { needsFacts, statusProblem, statusTimes } from './status'

const now = new Date('2026-10-01T12:00:00.000Z')
const NOW = now.toISOString()
const EARLIER = '2026-09-01T08:00:00.000Z'
const LATER = '2026-09-20T08:00:00.000Z'

describe('statusTimes', () => {
  it('records the first publication and keeps it', () => {
    expect(statusTimes({ status: 'in_review' }, 'published', now)).toEqual({
      publishedAt: NOW,
      expiredAt: null,
      withdrawnAt: null,
    })
    expect(statusTimes({ status: 'published', publishedAt: EARLIER }, 'published', now)).toEqual({
      publishedAt: EARLIER,
      expiredAt: null,
      withdrawnAt: null,
    })
    expect(statusTimes(undefined, 'published', now).publishedAt).toBe(NOW)
  })

  it('keeps the first publication when a published job is set back to draft or review', () => {
    // statusProblem refuses that save by this publishedAt; it must not be cleared first.
    const published = { status: 'published' as const, publishedAt: EARLIER }
    expect(statusTimes(published, 'draft', now).publishedAt).toBe(EARLIER)
    expect(statusTimes(published, 'in_review', now).publishedAt).toBe(EARLIER)
  })

  it('records when a job expired, and keeps that time on later saves', () => {
    const published = { status: 'published' as const, publishedAt: EARLIER }
    expect(statusTimes(published, 'expired', now)).toEqual({
      publishedAt: EARLIER,
      expiredAt: NOW,
      withdrawnAt: null,
    })
    const expired = { status: 'expired' as const, publishedAt: EARLIER, expiredAt: LATER }
    expect(statusTimes(expired, 'expired', now).expiredAt).toBe(LATER)
  })

  it('clears the closing times when a job is published again', () => {
    const expired = { status: 'expired' as const, publishedAt: EARLIER, expiredAt: LATER }
    expect(statusTimes(expired, 'published', now)).toEqual({
      publishedAt: EARLIER,
      expiredAt: null,
      withdrawnAt: null,
    })
    const withdrawn = { status: 'withdrawn' as const, publishedAt: EARLIER, withdrawnAt: LATER }
    expect(statusTimes(withdrawn, 'published', now).withdrawnAt).toBeNull()
  })

  it('records when a job was withdrawn and keeps an earlier expiry', () => {
    const expired = { status: 'expired' as const, publishedAt: EARLIER, expiredAt: LATER }
    expect(statusTimes(expired, 'withdrawn', now)).toEqual({
      publishedAt: EARLIER,
      expiredAt: LATER,
      withdrawnAt: NOW,
    })
    const withdrawn = { status: 'withdrawn' as const, publishedAt: EARLIER, withdrawnAt: LATER }
    expect(statusTimes(withdrawn, 'withdrawn', now).withdrawnAt).toBe(LATER)
  })

  it('ignores timestamps in the saved data of drafts', () => {
    expect(statusTimes({ status: 'draft' }, 'in_review', now)).toEqual({
      publishedAt: null,
      expiredAt: null,
      withdrawnAt: null,
    })
  })
})

describe('statusProblem', () => {
  it('keeps a published job out of draft and review', () => {
    expect(statusProblem('draft', true)).toMatch(/cannot go back/)
    expect(statusProblem('in_review', true)).toMatch(/cannot go back/)
    expect(statusProblem('expired', true)).toBeNull()
    expect(statusProblem('withdrawn', true)).toBeNull()
    expect(statusProblem('published', true)).toBeNull()
  })

  it('lets only published jobs expire or be withdrawn', () => {
    expect(statusProblem('expired', false)).toMatch(/Only a job that has been published/)
    expect(statusProblem('withdrawn', false)).toMatch(/Only a job that has been published/)
    expect(statusProblem('draft', false)).toBeNull()
    expect(statusProblem('published', false)).toBeNull()
  })

  it('asks for the facts from review on', () => {
    expect(['draft', 'in_review', 'published', 'expired'].map(needsFacts)).toEqual([
      false,
      true,
      true,
      false,
    ])
  })
})
