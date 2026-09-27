import { describe, expect, it } from 'vitest'

import { calendarDay, closedAt, deadlineEnd, goneAt, isOpen } from '@/lib/jobs/deadline'
import { likelyDuplicate, normaliseTitle } from '@/lib/jobs/similarity'
import { isTimeZone } from '@/lib/jobs/time-zones'
import { isHttpUrl } from '@/lib/jobs/url'
import { SHORT_ID_PATTERN } from '@/lib/short-id'

import { FAKE_INSTITUTIONS, type FakeJob, fakeJobs, seededRandom } from './fake-jobs-data'
import { FIXED_JOBS } from './fake-jobs-fixed'

const now = new Date('2026-09-28T09:00:00Z')
const jobs = fakeJobs(now)
const byId = (shortId: string) => jobs.find((job) => job.shortId === shortId) as FakeJob

const listing = (job: FakeJob) => ({
  ...job,
  deadlineAt: job.deadlineDate
    ? deadlineEnd(calendarDay(job.deadlineDate) as string, job.deadlineTz)
    : null,
})

describe('fake jobs', () => {
  it('are the same on every run, apart from dates that follow the day of the run', () => {
    expect(fakeJobs(now)).toEqual(jobs)
    const later = fakeJobs(new Date('2026-10-05T09:00:00Z'))
    expect(later.map((job) => job.title)).toEqual(jobs.map((job) => job.title))
    expect(seededRandom(1)()).toBe(seededRandom(1)())
  })

  it('are the fixed jobs plus about 60 generated ones, with distinct short IDs', () => {
    expect(jobs).toHaveLength(Object.keys(FIXED_JOBS).length + 60)
    expect(new Set(jobs.map((job) => job.shortId)).size).toBe(jobs.length)
    for (const job of jobs) expect(job.shortId).toMatch(SHORT_ID_PATTERN)
  })

  it('contain no email addresses, phone numbers or real addresses', () => {
    for (const job of jobs) {
      const text = `${job.title} ${job.summary} ${job.startText ?? ''}`
      expect(text).not.toMatch(/@|\+?\d[\d\s()-]{7,}\d|https?:/)
      expect(new URL(job.originalUrl).hostname).toBe('careers.example.org')
      expect(isHttpUrl(job.originalUrl)).toBe(true)
    }
  })

  it('fit the limits of the collection', () => {
    for (const job of jobs) {
      expect(job.title.length).toBeLessThanOrEqual(300)
      expect(job.summary.length).toBeLessThanOrEqual(280)
      expect(job.subfields.length).toBeGreaterThan(0)
      if (job.deadlineTz) expect(isTimeZone(job.deadlineTz)).toBe(true)
    }
  })

  it('have statuses that match their deadlines', () => {
    for (const job of jobs) {
      if (job.status === 'published') expect(isOpen(listing(job), now)).toBe(true)
      if (job.status === 'expired') {
        expect(closedAt(listing(job), now)?.getTime()).toBeLessThanOrEqual(now.getTime())
      }
      if (job.status !== 'draft' && job.status !== 'in_review') {
        expect(job.publishedAt).not.toBeNull()
        expect(Object.values(job.checks).every(Boolean)).toBe(true)
      }
      if (job.verifiedAt) {
        expect(calendarDay(job.verifiedAt)! <= calendarDay(now)!).toBe(true)
      }
    }
    const statuses = new Set(jobs.map((job) => job.status))
    expect([...statuses].sort()).toEqual([
      'draft',
      'expired',
      'in_review',
      'published',
      'withdrawn',
    ])
  })

  it('include rolling and until-filled deadlines, time zones and location overrides', () => {
    const kinds = new Set(jobs.map((job) => job.deadlineKind))
    expect([...kinds].sort()).toEqual(['fixed', 'rolling', 'until-filled'])
    expect(jobs.filter((job) => job.deadlineTz).length).toBeGreaterThan(10)
    expect(jobs.filter((job) => job.locationOverride).length).toBe(3)
    const institutions = new Set(jobs.map((job) => job.institutionRorId))
    expect(institutions.size).toBeGreaterThan(FAKE_INSTITUTIONS.length / 2)
  })

  it('never look like the same position twice', () => {
    const facts = (job: FakeJob) => ({
      canonicalUrl: job.originalUrl,
      institution: job.institutionRorId,
      deadlineKind: job.deadlineKind,
      deadlineDay: calendarDay(job.deadlineDate),
      fingerprint: normaliseTitle(job.title),
    })
    for (const [i, job] of jobs.entries()) {
      for (const other of jobs.slice(i + 1)) {
        expect(likelyDuplicate(facts(job), facts(other))).toBe(false)
      }
    }
  })

  it('give the fixed jobs the states the end-to-end tests expect', () => {
    const { open, closingSoon, rolling, expiredRecently, expiredLongAgo, withdrawn, draft } =
      FIXED_JOBS
    expect(isOpen(listing(byId(open.shortId)), now)).toBe(true)
    expect(isOpen(listing(byId(closingSoon.shortId)), now)).toBe(true)
    expect(isOpen(listing(byId(rolling.shortId)), now)).toBe(true)
    expect(goneAt(listing(byId(expiredRecently.shortId)), now)!.getTime()).toBeGreaterThan(
      now.getTime(),
    )
    expect(goneAt(listing(byId(expiredLongAgo.shortId)), now)!.getTime()).toBeLessThan(
      now.getTime(),
    )
    expect(goneAt(listing(byId(withdrawn.shortId)), now)!.getTime()).toBeLessThan(now.getTime())
    expect(byId(draft.shortId)).toMatchObject({ status: 'draft', publishedAt: null })
    expect(byId(open.shortId).title).toBe(open.title)
  })
})
