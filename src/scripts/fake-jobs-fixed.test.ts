import { describe, expect, it } from 'vitest'

import { SHORT_ID_PATTERN } from '@/lib/short-id'
import { slugify } from '@/lib/slug'

import { FIXED_JOBS, MANUAL_INSTITUTION, RETIRED_JOB, jobPath } from './fake-jobs-fixed'

describe('fixed fake jobs', () => {
  const jobs = Object.values(FIXED_JOBS)

  it('have valid, distinct short IDs and the slugs the collection makes', () => {
    expect(new Set(jobs.map((job) => job.shortId)).size).toBe(jobs.length)
    for (const job of jobs) {
      expect(job.shortId).toMatch(SHORT_ID_PATTERN)
      expect(slugify(job.title, { fallback: 'job' })).toBe(job.slug)
    }
  })

  it('cover each state the jobs pages handle', () => {
    expect(FIXED_JOBS.open.deadlineInDays).toBeGreaterThan(14)
    expect(FIXED_JOBS.closingSoon.deadlineInDays).toBeLessThanOrEqual(14)
    expect(FIXED_JOBS.expiredRecently.deadlineInDays).toBeGreaterThan(-30)
    expect(FIXED_JOBS.expiredLongAgo.deadlineInDays).toBeLessThan(-31)
    expect(jobs.map((job) => job.status).sort()).toEqual([
      'draft',
      'expired',
      'expired',
      'published',
      'published',
      'published',
      'withdrawn',
    ])
  })

  it('keep a retired job whose short ID no fake job has', () => {
    expect(RETIRED_JOB.shortId).toMatch(SHORT_ID_PATTERN)
    expect(slugify(RETIRED_JOB.slug, { fallback: 'job' })).toBe(RETIRED_JOB.slug)
    expect(jobs.map((job) => job.shortId)).not.toContain(RETIRED_JOB.shortId)
  })

  it('keep an institution added by hand that a fixed job refers to', () => {
    // It then cannot be deleted (keepReferenced), even by a broken access rule.
    expect(MANUAL_INSTITUTION.shortId).toMatch(SHORT_ID_PATTERN)
    const atManual = jobs.filter(
      (job) => 'institutionShortId' in job && job.institutionShortId === MANUAL_INSTITUTION.shortId,
    )
    expect(atManual).toHaveLength(1)
  })

  it('build the job address from slug and short ID', () => {
    expect(jobPath(FIXED_JOBS.open)).toBe(
      '/en/jobs/phd-position-in-astrocyte-neuron-signalling-test1/',
    )
  })
})
