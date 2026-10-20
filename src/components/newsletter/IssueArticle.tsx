import { jobsHref } from '@/lib/filters/jobs'
import type { IssueContent, IssueJob } from '@/lib/newsletter/issue/content'
import {
  type IssueText,
  dayText,
  deadlineText,
  issueText,
  jobFactParts,
  jobPlace,
  paragraphsOf,
} from '@/lib/newsletter/issue/words'

// An issue of Glia Notes on its archive page (M11, D53; PLAN §13 "Archive"): the content it was
// sent with and the same words as its email (src/lib/newsletter/issue/email.tsx), drawn with the
// site's own styles, without the email's footer (nothing about a subscriber) and without UTM tags
// (the reader is on the site already). Employers' links as in the email, without tracking.

function DeadlineItem({ job, t }: { job: IssueJob; t: IssueText }) {
  const place = jobPlace(job)
  return (
    <li className="grid gap-1">
      <span className="font-semibold">{deadlineText(job, t)}</span>
      <a href={job.path}>{job.title}</a>
      {place && <span className="text-text-muted">{place}</span>}
    </li>
  )
}

function SelectedItem({ job, t }: { job: IssueJob; t: IssueText }) {
  const place = jobPlace(job)
  return (
    <li className="grid gap-1">
      <h3>
        <a href={job.path}>{job.title}</a>
      </h3>
      {place && <p className="text-text-muted">{place}</p>}
      {/* Separate elements, not one line joined by dots as in the email (PLAN §7.6). */}
      <p className="flex flex-wrap gap-x-4">
        {jobFactParts(job, t).map((part) => (
          <span key={part}>{part}</span>
        ))}
      </p>
      {job.summary && <p>{job.summary}</p>}
      {job.originalUrl && (
        <p>
          <a href={job.originalUrl}>{t('job.original')}</a>{' '}
          <span className="text-text-muted">{t('job.originalHint')}</span>
        </p>
      )}
    </li>
  )
}

export function IssueArticle({ content }: { content: IssueContent }) {
  const t = issueText()
  const { deadlines, selected } = content
  return (
    <>
      {paragraphsOf(content.intro).map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <h2>{t('deadlines.heading')}</h2>
      <p className="text-text-muted">
        {t('deadlines.intro', { from: dayText(deadlines.from), to: dayText(deadlines.to) })}
      </p>
      {deadlines.jobs.length === 0 ? (
        <p>{t('deadlines.none')}</p>
      ) : (
        <ul role="list" className="grid gap-4 p-0">
          {deadlines.jobs.map((job) => (
            <DeadlineItem key={job.id} job={job} t={t} />
          ))}
        </ul>
      )}
      {deadlines.more > 0 && (
        <p>
          <a href={jobsHref({ deadline: `${deadlines.from}..${deadlines.to}` })}>
            {t('deadlines.more', { count: deadlines.more })}
          </a>
        </p>
      )}
      <h2>{t('selected.heading')}</h2>
      <p className="text-text-muted">
        {selected.length > 0 ? t('selected.intro') : t('selected.none')}
      </p>
      {selected.length > 0 && (
        <ul role="list" className="grid gap-6 p-0">
          {selected.map((job) => (
            <SelectedItem key={job.id} job={job} t={t} />
          ))}
        </ul>
      )}
    </>
  )
}
