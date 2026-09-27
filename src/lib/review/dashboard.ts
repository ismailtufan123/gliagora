import type { CollectionSlug, Payload, TypedUser, Where } from 'payload'

import { CLOSING_SOON_DAYS, calendarDay } from '@/lib/jobs/deadline'

// The counts on the admin dashboard (src/admin/ReviewDashboard.tsx): the review queue, jobs in
// review, suggestions waiting for a decision and the deadline tracker (PLAN §3.2, admin core).
// Every count filters on indexed fields (status, deadlineAt), so each is one index scan.

const DAY_MS = 86_400_000

/** How many of the jobs closing soonest the deadline tracker lists. */
export const TRACKER_LIMIT = 10

export type ClosingJob = { id: number; title: string; shortId: string | null; day: string | null }

export type ReviewSummary = {
  candidates: { new: number; triaged: number }
  jobsInReview: number
  suggestions: { waiting: number; notQueued: number }
  closing: { total: number; next: ClosingJob[] }
}

/** Published jobs whose deadline ends within the next 14 days ("Closing soon", PLAN §3.2). */
export const closingWhere = (now: Date): Where => ({
  and: [
    { status: { equals: 'published' } },
    { deadlineAt: { greater_than: now.toISOString() } },
    {
      deadlineAt: {
        less_than_equal: new Date(now.getTime() + CLOSING_SOON_DAYS * DAY_MS).toISOString(),
      },
    },
  ],
})

export const WHERE = {
  newCandidates: { status: { equals: 'new' } },
  triagedCandidates: { status: { equals: 'triaged' } },
  jobsInReview: { status: { equals: 'in_review' } },
  waitingSuggestions: { status: { in: ['new', 'queued'] } },
  notQueuedSuggestions: { status: { equals: 'new' } },
} satisfies Record<string, Where>

/** The dashboard's counts, read with the editor's own access rights. */
export async function reviewSummary(
  payload: Payload,
  user: TypedUser,
  now: Date,
): Promise<ReviewSummary> {
  const asEditor = { overrideAccess: false, user } as const
  const count = async (collection: CollectionSlug, where: Where) =>
    (await payload.count({ collection, where, ...asEditor })).totalDocs
  const [newCandidates, triaged, jobsInReview, waiting, notQueued, closing] = await Promise.all([
    count('candidates', WHERE.newCandidates),
    count('candidates', WHERE.triagedCandidates),
    count('jobs', WHERE.jobsInReview),
    count('submissions', WHERE.waitingSuggestions),
    count('submissions', WHERE.notQueuedSuggestions),
    payload.find({
      collection: 'jobs',
      where: closingWhere(now),
      // By the day shown, then by when that day ends: a day in a zone east of UTC can end before
      // the day before it ends in another zone (or Anywhere on Earth).
      sort: ['deadlineDate', 'deadlineAt'],
      select: { title: true, shortId: true, deadlineDate: true },
      depth: 0,
      limit: TRACKER_LIMIT,
      ...asEditor,
    }),
  ])
  return {
    candidates: { new: newCandidates, triaged },
    jobsInReview,
    suggestions: { waiting, notQueued },
    closing: {
      total: closing.totalDocs,
      next: closing.docs.map((job) => ({
        id: job.id,
        title: job.title,
        shortId: job.shortId ?? null,
        day: calendarDay(job.deadlineDate),
      })),
    },
  }
}

/**
 * The query string of an admin list filtered by `where`, in the bracket form the admin reads
 * (`where[status][equals]=new`).
 */
export function whereQuery(where: Where): string {
  const params = new URLSearchParams()
  const add = (prefix: string, value: unknown) => {
    if (value !== null && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value)) add(`${prefix}[${key}]`, inner)
    } else {
      params.append(prefix, String(value))
    }
  }
  add('where', where)
  return params.toString()
}
