import type { Locale } from '@/i18n/routing'
import type { JobCard } from '@/lib/jobs/view'

import { JobRow, type JobRowOptions } from './JobRow'

// Dense rows between hairlines, no cards or shadows (PLAN §7.6). `now` is the request time
// (requestTime in src/lib/records.ts), so every row counts its days from the same moment.
export function JobList({
  jobs,
  now,
  locale,
  ...options
}: JobRowOptions & { jobs: JobCard[]; now: Date; locale: Locale }) {
  return (
    <ul role="list" className="job-list">
      {jobs.map((job) => (
        <li key={job.id}>
          <JobRow job={job} now={now} locale={locale} {...options} />
        </li>
      ))}
    </ul>
  )
}
