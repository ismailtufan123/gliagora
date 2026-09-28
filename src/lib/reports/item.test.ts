import { describe, expect, it } from 'vitest'

import { type ReportableJob, parseItemRef, reportHref, reportItem } from './item'

const now = new Date('2026-09-28T10:00:00.000Z')
const DAY = 86_400_000

const job = (overrides: Partial<ReportableJob> = {}): ReportableJob => ({
  id: 7,
  title: 'PhD position in astrocyte–neuron signalling',
  slug: 'phd-position-in-astrocyte-neuron-signalling',
  shortId: 'test1',
  originalLanguage: 'en',
  status: 'published',
  deadlineKind: 'fixed',
  deadlineAt: new Date(now.getTime() + 60 * DAY).toISOString(),
  ...overrides,
})

describe('parseItemRef', () => {
  it('reads a job by its short ID', () => {
    expect(parseItemRef('job:test1')).toEqual({ type: 'job', shortId: 'test1' })
    expect(parseItemRef('job:k3f9a')).toEqual({ type: 'job', shortId: 'k3f9a' })
  })

  it('ignores anything else', () => {
    for (const value of [
      undefined,
      null,
      '',
      'test1',
      'job:',
      'job:test',
      'job:test12',
      'job:TEST1',
      // Characters short IDs never use (i, l, o, u).
      'job:testi',
      'job:test1 ',
      ' job:test1',
      'event:test1',
      'job:test1/',
      'job:../..',
      ['job:test1'],
      ['job:test1', 'job:test2'],
      42,
    ]) {
      expect(parseItemRef(value), JSON.stringify(value)).toBeNull()
    }
  })

  it('is what the "Report a problem" link writes', () => {
    const ref = { type: 'job', shortId: 'test1' } as const
    expect(reportHref(ref)).toBe('/en/report/?item=job:test1')
    const item = new URL(reportHref(ref), 'https://gliagora.com').searchParams.get('item')
    expect(parseItemRef(item)).toEqual(ref)
  })
})

describe('reportItem', () => {
  it('names an open job, with its address and title', () => {
    expect(reportItem(job(), now)).toEqual({
      ref: 'job:test1',
      jobId: 7,
      title: 'PhD position in astrocyte–neuron signalling',
      path: '/en/jobs/phd-position-in-astrocyte-neuron-signalling-test1/',
    })
  })

  it('names a job that has closed but still has its page', () => {
    const closed = job({
      status: 'expired',
      deadlineAt: new Date(now.getTime() - 10 * DAY).toISOString(),
      expiredAt: new Date(now.getTime() - 10 * DAY).toISOString(),
    })
    expect(reportItem(closed, now)?.ref).toBe('job:test1')
  })

  it('gives the title’s language when it is not English', () => {
    expect(reportItem(job({ originalLanguage: 'de' }), now)?.lang).toBe('de')
  })

  it('leaves out drafts, jobs in review and jobs whose page is gone (410)', () => {
    expect(reportItem(job({ status: 'draft' }), now)).toBeNull()
    expect(reportItem(job({ status: 'in_review' }), now)).toBeNull()
    expect(reportItem(job({ status: 'withdrawn', withdrawnAt: now.toISOString() }), now)).toBeNull()
    const longClosed = job({
      status: 'expired',
      deadlineAt: new Date(now.getTime() - 45 * DAY).toISOString(),
    })
    expect(reportItem(longClosed, now)).toBeNull()
  })

  it('leaves out an unknown job', () => {
    expect(reportItem(null, now)).toBeNull()
    expect(reportItem(job({ slug: null }), now)).toBeNull()
  })
})
