import { describe, expect, it } from 'vitest'

import { similarity, normaliseTitle } from '@/lib/jobs/similarity'
import { canonicalUrl, isHttpUrl } from '@/lib/jobs/url'
import { REPORT_KINDS, statusProblem } from '@/lib/reports/status'
import { transitionProblem } from '@/lib/review/status'

import { FAKE_INSTITUTIONS, postingUrl } from './fake-jobs-data'
import { FIXED_JOBS } from './fake-jobs-fixed'
import {
  FAKE_CANDIDATES,
  FAKE_QUEUE_INSTITUTIONS,
  FAKE_QUEUE_NOTE,
  FAKE_REPORTS,
  FAKE_SUBMISSIONS,
} from './fake-queue-data'

const RESERVED = /(^|\.)example\.(org|com)$/
const reviews = [...FAKE_SUBMISSIONS, ...FAKE_CANDIDATES].flatMap((item) =>
  item.review ? [item.review] : [],
)

describe('fake review queue', () => {
  it('uses only reserved example domains for addresses and email addresses', () => {
    for (const { url, email } of FAKE_SUBMISSIONS) {
      expect(isHttpUrl(url)).toBe(true)
      expect(new URL(url).hostname).toMatch(RESERVED)
      if (email) expect(email.split('@')[1]).toMatch(RESERVED)
    }
    for (const { rawUrl } of FAKE_CANDIDATES) expect(new URL(rawUrl).hostname).toMatch(RESERVED)
  })

  it('marks every suggestion and hand-added candidate, so the next run finds them', () => {
    for (const { note } of FAKE_SUBMISSIONS) expect(note.startsWith(FAKE_QUEUE_NOTE)).toBe(true)
    for (const { snippet } of FAKE_CANDIDATES)
      expect(snippet.startsWith(FAKE_QUEUE_NOTE)).toBe(true)
  })

  it('fits the limits of the collections', () => {
    for (const { note, url } of FAKE_SUBMISSIONS) {
      expect(note.length).toBeLessThanOrEqual(500)
      expect(url.length).toBeLessThanOrEqual(2000)
    }
    for (const review of reviews) expect(review.rawTitle.length).toBeLessThanOrEqual(300)
  })

  it('covers every state of the queue, and an email address given without consent', () => {
    const states = new Set([...reviews.map((r) => r.status), 'new'])
    expect([...states].sort()).toEqual(['accepted', 'duplicate', 'new', 'rejected', 'triaged'])
    expect(FAKE_SUBMISSIONS.some((s) => s.email && !s.consentToContact)).toBe(true)
    expect(FAKE_SUBMISSIONS.some((s) => s.kind !== 'position' && s.decided)).toBe(true)
    expect(FAKE_SUBMISSIONS.some((s) => s.kind !== 'position' && !s.decided)).toBe(true)
  })

  it('makes only the moves an editor can make', () => {
    for (const review of reviews) {
      expect(transitionProblem('new', 'triaged')).toBeNull()
      expect(transitionProblem('triaged', review.status)).toBeNull()
      if (review.status === 'rejected') expect(review.decisionReason).toBeDefined()
      if (review.status === 'duplicate') expect(review.duplicateOf).toBeDefined()
    }
  })

  it('refers to test institutions and fixed jobs that exist', () => {
    const rorIds = new Set<string>([
      ...FAKE_INSTITUTIONS.map(({ rorId }) => rorId),
      ...Object.values(FIXED_JOBS).map((job) => job.institutionRorId),
    ])
    for (const rorId of FAKE_QUEUE_INSTITUTIONS) expect(rorIds.has(rorId)).toBe(true)
    const shortIds = new Set<string>(Object.values(FIXED_JOBS).map((job) => job.shortId))
    for (const review of reviews) {
      if (review.duplicateOf) expect(shortIds.has(review.duplicateOf)).toBe(true)
    }
  })

  it('shows both kinds of possible duplicate', () => {
    const { open, closingSoon } = FIXED_JOBS
    // The same address as a fixed job, with a tracking parameter.
    const sameAddress = FAKE_CANDIDATES.find(
      (c) =>
        canonicalUrl(c.rawUrl) === postingUrl(closingSoon.institutionRorId, closingSoon.shortId),
    )
    expect(sameAddress?.review?.status).toBe('duplicate')
    // Nearly the title of a fixed job at the same institution.
    const similar = FAKE_CANDIDATES.find(
      (c) =>
        c.institutionRorId === open.institutionRorId &&
        similarity(normaliseTitle(c.rawTitle), normaliseTitle(open.title)) >= 0.8,
    )
    expect(similar).toBeDefined()
    // The accepted suggestion does not repeat any fixed job.
    const accepted = reviews.find((r) => r.status === 'accepted')!
    for (const job of Object.values(FIXED_JOBS)) {
      expect(similarity(normaliseTitle(accepted.rawTitle), normaliseTitle(job.title))).toBeLessThan(
        0.8,
      )
    }
  })
})

describe('fake reports', () => {
  it('are marked, so the next run removes them, and fit the collection', () => {
    for (const { details } of FAKE_REPORTS) {
      expect(details.startsWith(FAKE_QUEUE_NOTE)).toBe(true)
      expect(details.length).toBeLessThanOrEqual(2000)
    }
  })

  it('use only reserved example domains, and give an address for personal rights', () => {
    for (const { email, kind } of FAKE_REPORTS) {
      if (email) expect(email.split('@')[1]).toMatch(RESERVED)
      if (kind === 'personal-rights') expect(email).not.toBeNull()
    }
  })

  it('cover every status, with an action on each closed one, and name fixed jobs', () => {
    expect(new Set(FAKE_REPORTS.map((r) => r.status))).toEqual(
      new Set(['new', 'in-progress', 'closed']),
    )
    expect(FAKE_REPORTS.some((r) => r.kind === 'personal-rights' && r.status === 'new')).toBe(true)
    expect(FAKE_REPORTS.some((r) => r.job === undefined)).toBe(true)
    const shortIds = Object.values(FIXED_JOBS).map((job) => job.shortId as string)
    for (const report of FAKE_REPORTS) {
      expect(REPORT_KINDS.map((k) => k.value)).toContain(report.kind)
      if (report.job) expect(shortIds).toContain(report.job)
      if (report.status === 'closed') expect(report.action).toBeDefined()
      expect(statusProblem('new', report.status)).toBeNull()
    }
  })
})
