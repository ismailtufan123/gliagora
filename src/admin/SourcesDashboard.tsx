import type { CollectionSlug, Where } from 'payload'

import { FAILURES_FLAGGED } from '@/lib/sources/kinds'
import {
  type SourcesSummary,
  attentionWhere,
  linkProblemWhere,
  manualDueWhere,
  newFromSourcesWhere,
} from '@/lib/sources/dashboard'

// The sources' part of the admin dashboard (M7, D52), below the review queue: the new candidates
// the sources gave, the sources that need an editor, the manual sources due for a look, and the
// weekly link check's findings. Admin text is plain English, like the rest of the admin.

type Links = {
  list: (collection: CollectionSlug, where?: Where) => string
  doc: (collection: CollectionSlug, id: number | string) => string
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function SourcesDashboardView({
  summary,
  links,
  now,
}: {
  summary: SourcesSummary
  links: Links
  now: Date
}) {
  const { found, attention, manualDue, links: checked } = summary
  return (
    <section className="review-dashboard" aria-labelledby="sources-dashboard-title">
      <h2 id="sources-dashboard-title" className="review-dashboard__title">
        Sources
      </h2>
      <h3 className="review-dashboard__subtitle">
        New candidates from sources:{' '}
        <a href={links.list('candidates', newFromSourcesWhere)}>{found.total}</a>
      </h3>
      {found.bySource.length > 0 ? (
        <ul className="review-dashboard__counts">
          {found.bySource.map((row) => (
            <li key={row.id}>
              <a
                href={links.list('candidates', {
                  and: [{ status: { equals: 'new' } }, { source: { equals: row.id } }],
                })}
              >
                {row.name}
              </a>
              : {row.count}
            </li>
          ))}
        </ul>
      ) : null}
      <h3 className="review-dashboard__subtitle">
        Sources that need attention:{' '}
        <a href={links.list('sources', attentionWhere)}>{attention.total}</a>
      </h3>
      {attention.rows.length > 0 ? (
        <ul className="review-dashboard__counts">
          {attention.rows.map((row) => (
            <li key={row.id}>
              <a href={links.doc('sources', row.id)}>{row.name}</a>
              {row.note ? ` – ${row.note}` : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          None: no source failed {FAILURES_FLAGGED} runs in a row, was refused by robots.txt or has
          changed terms.
        </p>
      )}
      <h3 className="review-dashboard__subtitle">
        Manual sources due for a look:{' '}
        <a href={links.list('sources', manualDueWhere(now))}>{manualDue.total}</a>
      </h3>
      {manualDue.rows.length > 0 ? (
        <ul className="review-dashboard__counts">
          {manualDue.rows.map((row) => (
            <li key={row.id}>
              <a href={links.doc('sources', row.id)}>{row.name}</a>
              {row.url ? (
                <>
                  {' '}
                  (<a href={row.url}>open the page</a>)
                </>
              ) : null}
              {row.note ? ` – ${row.note}` : null}
            </li>
          ))}
        </ul>
      ) : null}
      <h3 className="review-dashboard__subtitle">Weekly link check of published jobs</h3>
      <ul className="review-dashboard__counts">
        <li>
          Page gone:{' '}
          <a href={links.list('jobs', linkProblemWhere('gone'))}>
            {plural(checked.gone, 'job', 'jobs')}
          </a>
        </li>
        <li>
          Page not answering:{' '}
          <a href={links.list('jobs', linkProblemWhere('broken'))}>
            {plural(checked.broken, 'job', 'jobs')}
          </a>
        </li>
        <li>
          Page says the position is filled or closed:{' '}
          <a href={links.list('jobs', linkProblemWhere('says-closed'))}>
            {plural(checked.saysClosed, 'job', 'jobs')}
          </a>
        </li>
      </ul>
    </section>
  )
}
