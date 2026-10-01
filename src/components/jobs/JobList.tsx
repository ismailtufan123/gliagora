import type { Locale } from '@/i18n/routing'
import type { JobCard } from '@/lib/jobs/view'
import { jobRowId } from '@/lib/members/saved'

import { JobRow, type JobRowOptions } from './JobRow'

// Dense rows between hairlines, no cards or shadows (PLAN §7.6). `now` is the request time
// (requestTime in src/lib/records.ts), so every row counts its days from the same moment. Rows
// with a Save control (`save`: the jobs list, the saved page) have an ID, `job-{shortId}`, which
// a Save without JavaScript returns to; other lists have none, so no ID repeats on a page that
// shows a job twice (the job page's lists, the home page).
export function JobList({
  jobs,
  now,
  locale,
  ...options
}: JobRowOptions & { jobs: JobCard[]; now: Date; locale: Locale }) {
  return (
    <ul role="list" className="job-list">
      {jobs.map((job) => (
        // The map view highlights the pin of the row under the pointer (src/components/map).
        <li
          key={job.id}
          id={options.save ? jobRowId(job.shortId) : undefined}
          data-institution={job.institution?.id}
        >
          <JobRow job={job} now={now} locale={locale} {...options} />
        </li>
      ))}
    </ul>
  )
}
