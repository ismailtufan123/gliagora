import type { CollectionSlug, ServerProps, Where } from 'payload'
import { formatAdminURL } from 'payload/shared'

import { CLOSING_SOON_DAYS } from '@/lib/jobs/deadline'
import { PERSONAL_RIGHTS_ANSWER_HOURS } from '@/lib/reports/status'
import {
  type ReviewSummary,
  WHERE,
  closingWhere,
  personalRightsDueWhere,
  personalRightsOverdueWhere,
  reviewSummary,
  whereQuery,
} from '@/lib/review/dashboard'

// The review queue at the top of the admin dashboard (PLAN §3.2, admin core): what waits for an
// editor, reports and removal requests with the personal-rights ones due soon, and the deadline
// tracker. A server component that reads through the local API. Admin
// text is plain English written here, like the labels in the collection configs: the admin is
// not translated through messages/*.json.

type Links = {
  list: (collection: CollectionSlug, where?: Where) => string
  doc: (collection: CollectionSlug, id: number | string) => string
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// "2 Oct 2026": the day of the deadline (a calendar day, the same in every time zone).
const DAY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const formatDay = (day: string) => DAY.format(new Date(`${day}T12:00:00Z`))

export function ReviewDashboardView({
  summary,
  links,
  now,
}: {
  summary: ReviewSummary
  links: Links
  now: Date
}) {
  const { candidates, jobsInReview, suggestions, reports, closing } = summary
  return (
    <section className="review-dashboard" aria-labelledby="review-dashboard-title">
      <h2 id="review-dashboard-title" className="review-dashboard__title">
        Waiting for an editor
      </h2>
      <ul className="review-dashboard__counts">
        <li>
          Review queue:{' '}
          <a href={links.list('candidates', WHERE.newCandidates)}>{candidates.new} new</a>,{' '}
          <a href={links.list('candidates', WHERE.triagedCandidates)}>
            {candidates.triaged} triaged
          </a>
        </li>
        <li>
          In review:{' '}
          <a href={links.list('jobs', WHERE.jobsInReview)}>{plural(jobsInReview, 'job', 'jobs')}</a>
        </li>
        <li>
          Suggestions waiting:{' '}
          <a href={links.list('submissions', WHERE.waitingSuggestions)}>
            {plural(suggestions.waiting, 'suggestion', 'suggestions')}
          </a>
          {suggestions.notQueued > 0 ? (
            <>
              {' '}
              (
              <a href={links.list('submissions', WHERE.notQueuedSuggestions)}>
                {suggestions.notQueued} not in the review queue
              </a>
              , to handle by hand)
            </>
          ) : null}
        </li>
        <li>
          Reports: <a href={links.list('reports', WHERE.newReports)}>{reports.new} new</a>
        </li>
        <li>
          Personal-rights requests due within {PERSONAL_RIGHTS_ANSWER_HOURS} hours:{' '}
          <a href={links.list('reports', personalRightsDueWhere(now))}>
            {reports.personalRightsDue}
          </a>
          {reports.personalRightsOverdue > 0 ? (
            <>
              {' '}
              (
              <a href={links.list('reports', personalRightsOverdueWhere(now))}>
                <strong>{reports.personalRightsOverdue} overdue</strong>
              </a>
              )
            </>
          ) : null}
        </li>
      </ul>
      <h3 className="review-dashboard__subtitle">
        Closing within {CLOSING_SOON_DAYS} days: {closing.total}
      </h3>
      {closing.next.length > 0 ? (
        <ol className="review-dashboard__deadlines">
          {closing.next.map((job) => (
            <li key={job.id}>
              <a href={links.doc('jobs', job.id)}>{job.title}</a>
              {job.day ? (
                <>
                  {' – '}
                  <time dateTime={job.day}>{formatDay(job.day)}</time>
                </>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p>No published job closes within the next {CLOSING_SOON_DAYS} days.</p>
      )}
      {closing.total > closing.next.length ? (
        <p>
          <a href={links.list('jobs', closingWhere(now))}>
            All {closing.total} jobs closing within {CLOSING_SOON_DAYS} days
          </a>
        </p>
      ) : null}
    </section>
  )
}

export async function ReviewDashboard({ payload, user }: ServerProps) {
  if (!user) return null
  const now = new Date()
  const summary = await reviewSummary(payload, user, now)
  const adminRoute = payload.config.routes.admin
  const url = (path: `/${string}`) => formatAdminURL({ adminRoute, path, relative: true })
  const links: Links = {
    // Dashboard links never set a sort: Payload's list view saves the sort of its URL as the
    // editor's lasting preference for that collection.
    list: (collection, where) =>
      url(`/collections/${collection}${where ? `?${whereQuery(where)}` : ''}`),
    doc: (collection, id) => url(`/collections/${collection}/${id}`),
  }
  return <ReviewDashboardView summary={summary} links={links} now={now} />
}
