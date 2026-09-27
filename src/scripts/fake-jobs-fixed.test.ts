import { describe, expect, it } from 'vitest'

import { SHORT_ID_PATTERN } from '@/lib/short-id'
import { slugify } from '@/lib/slug'

import { FIXED_JOBS, jobPath } from './fake-jobs-fixed'

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

  it('build the job address from slug and short ID', () => {
    expect(jobPath(FIXED_JOBS.open)).toBe(
      '/en/jobs/phd-position-in-astrocyte-neuron-signalling-test1/',
    )
  })
})
