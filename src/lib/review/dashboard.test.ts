import { describe, expect, it, vi } from 'vitest'

import { TRACKER_LIMIT, closingWhere, reviewSummary, whereQuery } from './dashboard'

const now = new Date('2026-09-28T09:00:00.000Z')
const user = { id: 1, email: 'editor@example.com', collection: 'users' }

const fakePayload = () => {
  const totals: Record<string, number> = {
    'candidates:new': 3,
    'candidates:triaged': 2,
    'jobs:in_review': 1,
    'submissions:new,queued': 5,
    'submissions:new': 2,
  }
  const count = vi.fn(
    async ({
      collection,
      where,
    }: {
      collection: string
      where: { status: Record<string, unknown> }
    }) => {
      const status = where.status.equals ?? (where.status.in as string[]).join(',')
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
      expect(Object.keys(args.where)).toEqual(['status'])
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
