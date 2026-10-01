import { describe, expect, it, vi } from 'vitest'

import {
  TRACKER_LIMIT,
  closingWhere,
  dataRequestsDueWhere,
  dataRequestsOverdueWhere,
  personalRightsDueWhere,
  personalRightsOverdueWhere,
  reviewSummary,
  whereQuery,
} from './dashboard'

const now = new Date('2026-09-28T09:00:00.000Z')
const user = { id: 1, email: 'editor@example.com', collection: 'users' }

const fakePayload = () => {
  const totals: Record<string, number> = {
    'candidates:new': 3,
    'candidates:triaged': 2,
    'jobs:in_review': 1,
    'submissions:new,queued': 5,
    'submissions:new': 2,
    'reports:new': 4,
    'reports:personal-rights-due': 2,
    'reports:personal-rights-overdue': 1,
    'data-requests:due': 3,
    'data-requests:overdue': 1,
  }
  const count = vi.fn(
    async ({
      collection,
      where,
    }: {
      collection: string
      where: { status?: Record<string, unknown>; and?: Record<string, Record<string, unknown>>[] }
    }) => {
      if (where.and) {
        const late = where.and.some((part) => part.respondBy?.less_than !== undefined)
        const kind = collection === 'reports' ? 'personal-rights-' : ''
        return { totalDocs: totals[`${collection}:${kind}${late ? 'overdue' : 'due'}`] }
      }
      const status = where.status!.equals ?? (where.status!.in as string[]).join(',')
      return { totalDocs: totals[`${collection}:${status}`] ?? 0 }
    },
  )
  const find = vi.fn(async () => ({
    totalDocs: 12,
    docs: [
      {
        id: 7,
        title: 'Postdoc in glia',
        shortId: 'k3f9a',
        deadlineDate: '2026-10-02T12:00:00.000Z',
      },
    ],
  }))
  return { count, find }
}

describe('reviewSummary', () => {
  it('counts the queue, jobs in review, waiting suggestions and jobs closing soon', async () => {
    const payload = fakePayload()
    expect(await reviewSummary(payload as never, user as never, now)).toEqual({
      candidates: { new: 3, triaged: 2 },
      jobsInReview: 1,
      suggestions: { waiting: 5, notQueued: 2 },
      reports: { new: 4, personalRightsDue: 2, personalRightsOverdue: 1 },
      dataRequests: { due: 3, overdue: 1 },
      closing: {
        total: 12,
        next: [{ id: 7, title: 'Postdoc in glia', shortId: 'k3f9a', day: '2026-10-02' }],
      },
    })
  })

  it('reads with the editor’s access and a bounded, indexed query', async () => {
    const payload = fakePayload()
    await reviewSummary(payload as never, user as never, now)
    for (const [args] of payload.count.mock.calls) {
      expect(args).toMatchObject({ overrideAccess: false, user })
      // Counts only (never a list), on indexed fields.
      const fields = (args.where.and ?? [args.where]).flatMap((part) => Object.keys(part))
      for (const field of fields) expect(['status', 'kind', 'respondBy']).toContain(field)
    }
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'jobs',
        where: closingWhere(now),
        // The listed days stay in calendar order whatever their time zones.
        sort: ['deadlineDate', 'deadlineAt'],
        limit: TRACKER_LIMIT,
        depth: 0,
        overrideAccess: false,
        user,
      }),
    )
  })

  it('tracks published jobs whose deadline ends within 14 days', () => {
    expect(closingWhere(now)).toEqual({
      and: [
        { status: { equals: 'published' } },
        { deadlineAt: { greater_than: '2026-09-28T09:00:00.000Z' } },
        { deadlineAt: { less_than_equal: '2026-10-12T09:00:00.000Z' } },
      ],
    })
  })
})

describe('personal-rights requests on the dashboard', () => {
  it('are the unanswered ones due within 24 hours, overdue ones included', () => {
    expect(personalRightsDueWhere(now)).toEqual({
      and: [
        { kind: { equals: 'personal-rights' } },
        { status: { equals: 'new' } },
        { respondBy: { less_than_equal: '2026-09-29T09:00:00.000Z' } },
      ],
    })
    expect(personalRightsOverdueWhere(now)).toEqual({
      and: [
        { kind: { equals: 'personal-rights' } },
        { status: { equals: 'new' } },
        { respondBy: { less_than: '2026-09-28T09:00:00.000Z' } },
      ],
    })
  })
})

describe('data requests on the dashboard', () => {
  it('are the open ones whose answer is due within 7 days, overdue ones included', () => {
    expect(dataRequestsDueWhere(now)).toEqual({
      and: [
        { status: { in: ['new', 'in-progress'] } },
        { respondBy: { less_than_equal: '2026-10-05T09:00:00.000Z' } },
      ],
    })
    expect(dataRequestsOverdueWhere(now)).toEqual({
      and: [
        { status: { in: ['new', 'in-progress'] } },
        { respondBy: { less_than: '2026-09-28T09:00:00.000Z' } },
      ],
    })
  })

  it('never count a request nobody confirmed, nor a closed one', () => {
    for (const where of [dataRequestsDueWhere(now), dataRequestsOverdueWhere(now)]) {
      const statuses = (where.and as { status?: { in: string[] } }[]).find((part) => part.status)
      expect(statuses?.status?.in).not.toContain('unconfirmed')
      expect(statuses?.status?.in).not.toContain('closed')
    }
  })
})

describe('whereQuery', () => {
  it('writes a filter in the bracket form of the admin list', () => {
    expect(decodeURIComponent(whereQuery({ status: { equals: 'new' } }))).toBe(
      'where[status][equals]=new',
    )
    expect(decodeURIComponent(whereQuery({ status: { in: ['new', 'queued'] } }))).toBe(
      'where[status][in][0]=new&where[status][in][1]=queued',
    )
  })
})
