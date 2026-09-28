import { describe, expect, it, vi } from 'vitest'

import {
  type ItemLookup,
  type ReportableInstitution,
  type ReportableJob,
  findReportItem,
  institutionItem,
  jobItem,
  parseItemRef,
  reportHref,
} from './item'

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

const institution = (overrides: Partial<ReportableInstitution> = {}): ReportableInstitution => ({
  id: 12,
  name: 'Example Institute of Neuroscience',
  slug: 'example-institute-of-neuroscience',
  rorId: '05dxps055',
  shortId: null,
  ...overrides,
})

describe('parseItemRef', () => {
  it('reads a job by its short ID', () => {
    expect(parseItemRef('job:test1')).toEqual({ type: 'job', shortId: 'test1' })
    expect(parseItemRef('job:k3f9a')).toEqual({ type: 'job', shortId: 'k3f9a' })
  })

  it('reads an institution by the ID its address ends with: a ROR ID or a short ID', () => {
    expect(parseItemRef('institution:05dxps055')).toEqual({ type: 'institution', id: '05dxps055' })
    expect(parseItemRef('institution:k3f9a')).toEqual({ type: 'institution', id: 'k3f9a' })
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
      // A ROR ID is not a job's ID.
      'job:05dxps055',
      'institution:',
      'institution:05dxps05',
      'institution:05dxps0551',
      // A ROR ID starts with 0 and ends with two digits.
      'institution:15dxps055',
      'institution:05dxps0aa',
      'institution:05DXPS055',
      'institution:abcdi',
      'institution:test12',
      'institution:05dxps055/',
      'institution:https://ror.org/05dxps055',
      'Institution:05dxps055',
      ['job:test1'],
      ['job:test1', 'job:test2'],
      42,
    ]) {
      expect(parseItemRef(value), JSON.stringify(value)).toBeNull()
    }
  })

  it('is what the "Report a problem" links write', () => {
    for (const ref of [
      { type: 'job', shortId: 'test1' },
      { type: 'institution', id: '05dxps055' },
      { type: 'institution', id: 'k3f9a' },
    ] as const) {
      const item = new URL(reportHref(ref), 'https://gliagora.com').searchParams.get('item')
      expect(parseItemRef(item)).toEqual(ref)
    }
    expect(reportHref({ type: 'job', shortId: 'test1' })).toBe('/en/report/?item=job:test1')
    expect(reportHref({ type: 'institution', id: '05dxps055' })).toBe(
      '/en/report/?item=institution:05dxps055',
    )
  })
})

describe('jobItem', () => {
  it('names an open job, with its address and title', () => {
    expect(jobItem(job(), now)).toEqual({
      ref: 'job:test1',
      type: 'job',
      id: 7,
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
    expect(jobItem(closed, now)?.ref).toBe('job:test1')
  })

  it('gives the title’s language when it is not English', () => {
    expect(jobItem(job({ originalLanguage: 'de' }), now)?.lang).toBe('de')
  })

  it('leaves out drafts, jobs in review and jobs whose page is gone (410)', () => {
    expect(jobItem(job({ status: 'draft' }), now)).toBeNull()
    expect(jobItem(job({ status: 'in_review' }), now)).toBeNull()
    expect(jobItem(job({ status: 'withdrawn', withdrawnAt: now.toISOString() }), now)).toBeNull()
    const longClosed = job({
      status: 'expired',
      deadlineAt: new Date(now.getTime() - 45 * DAY).toISOString(),
    })
    expect(jobItem(longClosed, now)).toBeNull()
  })

  it('leaves out an unknown job', () => {
    expect(jobItem(null, now)).toBeNull()
    expect(jobItem(job({ slug: null }), now)).toBeNull()
  })
})

describe('institutionItem', () => {
  it('names an institution from ROR by its ROR ID, with the address of its page', () => {
    expect(institutionItem(institution())).toEqual({
      ref: 'institution:05dxps055',
      type: 'institution',
      id: 12,
      title: 'Example Institute of Neuroscience',
      path: '/en/institutions/example-institute-of-neuroscience-05dxps055/',
    })
  })

  it('names an institution added by hand by its short ID, until it gets a ROR ID', () => {
    const manual = institution({ rorId: null, shortId: 'k3f9a' })
    expect(institutionItem(manual)).toMatchObject({
      ref: 'institution:k3f9a',
      path: '/en/institutions/example-institute-of-neuroscience-k3f9a/',
    })
    // Its address moves to the ROR ID (src/lib/detail-routes.ts), and so does the reference.
    expect(institutionItem({ ...manual, rorId: '05dxps055' })).toMatchObject({
      ref: 'institution:05dxps055',
      path: '/en/institutions/example-institute-of-neuroscience-05dxps055/',
    })
  })

  it('has no language of its own: the name is shown as it is', () => {
    expect(institutionItem(institution())).not.toHaveProperty('lang')
  })

  it('leaves out an unknown institution', () => {
    expect(institutionItem(null)).toBeNull()
    expect(institutionItem(institution({ slug: null }))).toBeNull()
    expect(institutionItem(institution({ rorId: null, shortId: null }))).toBeNull()
  })
})

describe('findReportItem', () => {
  const lookup = () => ({
    job: vi.fn<ItemLookup['job']>(async () => job()),
    institution: vi.fn<ItemLookup['institution']>(async () => institution()),
  })

  it('looks the item up by its type, and only then', async () => {
    const records = lookup()
    expect(await findReportItem({ type: 'job', shortId: 'test1' }, records, now)).toMatchObject({
      type: 'job',
      id: 7,
    })
    expect(records.job).toHaveBeenCalledWith('test1')
    expect(records.institution).not.toHaveBeenCalled()

    const again = lookup()
    expect(
      await findReportItem({ type: 'institution', id: '05dxps055' }, again, now),
    ).toMatchObject({ type: 'institution', id: 12 })
    expect(again.institution).toHaveBeenCalledWith('05dxps055')
    expect(again.job).not.toHaveBeenCalled()
  })

  it('finds nothing without a reference, or for a record that is not public', async () => {
    const records = lookup()
    expect(await findReportItem(null, records, now)).toBeNull()
    expect(records.job).not.toHaveBeenCalled()
    expect(records.institution).not.toHaveBeenCalled()
    const hidden: ItemLookup = {
      job: async () => job({ status: 'draft' }),
      institution: async () => null,
    }
    expect(await findReportItem({ type: 'job', shortId: 'test1' }, hidden, now)).toBeNull()
    expect(await findReportItem({ type: 'institution', id: 'k3f9a' }, hidden, now)).toBeNull()
  })
})
