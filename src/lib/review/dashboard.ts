import type { CollectionSlug, Payload, TypedUser, Where } from 'payload'

import { CLOSING_SOON_DAYS, calendarDay } from '@/lib/jobs/deadline'
import { PERSONAL_RIGHTS, PERSONAL_RIGHTS_ANSWER_HOURS } from '@/lib/reports/status'

// The counts on the admin dashboard (src/admin/ReviewDashboard.tsx): the review queue, jobs in
// review, suggestions waiting for a decision, reports and requests, data requests whose answer is
// due (M4b), and the deadline tracker (PLAN §3.2, admin core). Every count filters on indexed fields (status, kind, respondBy,
// deadlineAt) and is a count, not a list, so each stays bounded however many records there are.

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

/** How many of the jobs closing soonest the deadline tracker lists. */
export const TRACKER_LIMIT = 10

/** How many days ahead the dashboard counts the data requests whose answer is due. */
export const DATA_REQUEST_DUE_DAYS = 7

export type ClosingJob = { id: number; title: string; shortId: string | null; day: string | null }

export type ReviewSummary = {
  candidates: { new: number; triaged: number }
  jobsInReview: number
  suggestions: { waiting: number; notQueued: number }
  reports: { new: number; personalRightsDue: number; personalRightsOverdue: number }
  dataRequests: { due: number; overdue: number }
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

/**
 * Personal-rights requests (Law 5651 Art. 9) nobody has answered yet whose answer is due within
 * the next 24 hours, or overdue: each is answered within 24 hours of arriving (PLAN §3.2, §15.1).
 * Once an editor has answered, the report is In progress and leaves this count.
 */
export const personalRightsDueWhere = (now: Date): Where => ({
  and: [
    { kind: { equals: PERSONAL_RIGHTS } },
    { status: { equals: 'new' } },
    {
      respondBy: {
        less_than_equal: new Date(
          now.getTime() + PERSONAL_RIGHTS_ANSWER_HOURS * HOUR_MS,
        ).toISOString(),
      },
    },
  ],
})

/** The same requests whose answer is already late. */
export const personalRightsOverdueWhere = (now: Date): Where => ({
  and: [
    { kind: { equals: PERSONAL_RIGHTS } },
    { status: { equals: 'new' } },
    { respondBy: { less_than: now.toISOString() } },
  ],
})

/**
 * Data requests still open (New or In progress) whose answer is due within the next 7 days, or
 * overdue: each confirmed request is answered within 30 days of receipt (KVKK Art. 13; M4b, D49).
 * A request nobody confirmed is never counted: there is nothing to answer until the person
 * confirms it, and it holds no address to answer to.
 */
export const dataRequestsDueWhere = (now: Date): Where => ({
  and: [
    { status: { in: ['new', 'in-progress'] } },
    {
      respondBy: {
        less_than_equal: new Date(now.getTime() + DATA_REQUEST_DUE_DAYS * DAY_MS).toISOString(),
      },
    },
  ],
})

/** The same requests whose answer is already late. */
export const dataRequestsOverdueWhere = (now: Date): Where => ({
  and: [
    { status: { in: ['new', 'in-progress'] } },
    { respondBy: { less_than: now.toISOString() } },
  ],
})

export const WHERE = {
  newCandidates: { status: { equals: 'new' } },
  triagedCandidates: { status: { equals: 'triaged' } },
  jobsInReview: { status: { equals: 'in_review' } },
  waitingSuggestions: { status: { in: ['new', 'queued'] } },
  notQueuedSuggestions: { status: { equals: 'new' } },
  newReports: { status: { equals: 'new' } },
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
  const [
    newCandidates,
    triaged,
    jobsInReview,
    waiting,
    notQueued,
    newReports,
    personalRightsDue,
    personalRightsOverdue,
    dataRequestsDue,
    dataRequestsOverdue,
    closing,
  ] = await Promise.all([
    count('candidates', WHERE.newCandidates),
    count('candidates', WHERE.triagedCandidates),
    count('jobs', WHERE.jobsInReview),
    count('submissions', WHERE.waitingSuggestions),
    count('submissions', WHERE.notQueuedSuggestions),
    count('reports', WHERE.newReports),
    count('reports', personalRightsDueWhere(now)),
    count('reports', personalRightsOverdueWhere(now)),
    count('data-requests', dataRequestsDueWhere(now)),
    count('data-requests', dataRequestsOverdueWhere(now)),
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
    reports: { new: newReports, personalRightsDue, personalRightsOverdue },
    dataRequests: { due: dataRequestsDue, overdue: dataRequestsOverdue },
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
