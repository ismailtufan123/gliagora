import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { calendarDay, closedAt, deadlineEnd, goneAt, isOpen } from '@/lib/jobs/deadline'
import { likelyDuplicate, normaliseTitle } from '@/lib/jobs/similarity'
import { timeZoneAt } from '@/lib/jobs/time-zone-at'
import { isTimeZone } from '@/lib/jobs/time-zones'
import { isHttpUrl } from '@/lib/jobs/url'
import { fromRorRecord } from '@/lib/ror/record'
import { SHORT_ID_PATTERN } from '@/lib/short-id'

import {
  FAKE_INSTITUTIONS,
  type FakeJob,
  fakeJobs,
  seededRandom,
  storedZone,
} from './fake-jobs-data'
import { FIXED_JOBS, MANUAL_INSTITUTION } from './fake-jobs-fixed'

const now = new Date('2026-09-28T09:00:00Z')
const jobs = fakeJobs(now)
const byId = (shortId: string) => jobs.find((job) => job.shortId === shortId) as FakeJob

const listing = (job: FakeJob) => ({
  ...job,
  deadlineAt: job.deadlineDate
    ? deadlineEnd(calendarDay(job.deadlineDate) as string, storedZone(job))
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
      const zone = storedZone(job)
      if (zone) expect(isTimeZone(zone)).toBe(true)
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
    expect(jobs.filter((job) => storedZone(job)).length).toBeGreaterThan(40)
    expect(jobs.filter((job) => job.locationOverride).length).toBe(3)
    const institutions = new Set(jobs.map((job) => job.institution))
    expect(institutions.size).toBeGreaterThan(FAKE_INSTITUTIONS.length / 2)
  })

  it("mostly take their institution's time zone, and some leave it unknown (D40)", () => {
    const generated = jobs.filter(
      (job) =>
        job.deadlineKind === 'fixed' &&
        !Object.values(FIXED_JOBS).some((fixed) => fixed.shortId === job.shortId),
    )
    const fromInstitution = generated.filter((job) => job.deadlineTz === undefined)
    const unknown = generated.filter((job) => job.deadlineTz === null)
    expect(fromInstitution.length + unknown.length).toBe(generated.length)
    expect(fromInstitution.length).toBeGreaterThan(unknown.length * 4)
    expect(unknown.length).toBeGreaterThan(0)
    // The fixed jobs keep the zones the end-to-end tests expect, unknown ones included.
    for (const fixed of Object.values(FIXED_JOBS)) {
      const job = byId(fixed.shortId)
      expect(job.deadlineTz).toBe('deadlineTz' in fixed ? fixed.deadlineTz : null)
    }
  })

  it('know the time zones the coordinates and countries of their institutions give', () => {
    const records = JSON.parse(
      readFileSync(
        new URL('../../tests/fixtures/ror/v2.13-2026-09-22-ror-data-sample.json', import.meta.url),
        'utf8',
      ),
    ) as unknown[]
    const places = new Map(
      records.flatMap((record) => {
        const institution = fromRorRecord(record)
        return institution ? [[institution.rorId, institution] as const] : []
      }),
    )
    for (const { rorId, timeZone } of FAKE_INSTITUTIONS) {
      const place = places.get(rorId)
      expect(place, rorId).toBeDefined()
      expect(timeZoneAt(place?.lat, place?.lng, place?.countryCode), rorId).toBe(timeZone)
    }
    // The institution added by hand gets its zone from its coordinates too; the draft job there
    // keeps its own (unknown) zone, as every fixed job does.
    const { lat, lng, country } = MANUAL_INSTITUTION
    expect(timeZoneAt(lat, lng, country)).toBe('Europe/Amsterdam')
  })

  it('never look like the same position twice', () => {
    const facts = (job: FakeJob) => ({
      canonicalUrl: job.originalUrl,
      institution: job.institution,
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
