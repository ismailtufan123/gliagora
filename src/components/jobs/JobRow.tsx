import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/routing'
import { deadlineView } from '@/lib/jobs/format'
import { textDirection } from '@/lib/jobs/languages'
import { type JobCard, rowTags } from '@/lib/jobs/view'

import { DeadlineText } from './DeadlineText'
import { OriginalPostingLink } from './OriginalPostingLink'

export type JobRowOptions = {
  /** The heading level of the job titles, one below the heading of the list. */
  headingLevel: 2 | 3 | 4
  /** Leave the institution out where the page is about it. */
  showInstitution?: boolean
  /** Leave the tags out, for short lists next to other content. */
  compact?: boolean
  /** Leave the original posting's link out, for short lists that lead to the job pages. */
  brief?: boolean
}

// A job in a list (PLAN §3.2 "Job card", §7.5 "Job row", §9.3): the title linking to the job
// page, institution, place, position type, deadline with days left and gauge, up to three tags
// and the original posting. The metadata are separate labelled elements (§7.6), with the labels
// for screen readers only.
export async function JobRow({
  job,
  now,
  locale,
  headingLevel,
  showInstitution = true,
  compact = false,
  brief = false,
}: JobRowOptions & { job: JobCard; now: Date; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'jobs' })
  const Heading = `h${headingLevel}` as const
  const deadline = deadlineView(job, now, locale)
  const { city, country } = job
  const place = city && country ? t('place', { city, country }) : (city ?? country)
  const tags = compact ? null : rowTags(job)
  const lang = job.originalLanguage !== locale ? job.originalLanguage : undefined

  return (
    <div className="job-row">
      <Heading className="font-display text-card leading-tight font-bold">
        <a href={job.path} lang={lang} dir={textDirection(lang)}>
          {job.title}
        </a>
      </Heading>
      <dl className="job-meta">
        {showInstitution && job.institution && (
          <div className="basis-full">
            <dt className="sr-only">{t('institution')}</dt>
            <dd>{job.institution.name}</dd>
          </div>
        )}
        {place && (
          <div className="basis-full text-text-muted">
            <dt className="sr-only">{t('location')}</dt>
            <dd>{place}</dd>
          </div>
        )}
        {job.positionType && (
          <div>
            <dt className="sr-only">{t('positionType')}</dt>
            <dd className="font-bold">{job.positionType.label}</dd>
          </div>
        )}
        {deadline && (
          <div>
            <dt className="sr-only">{t('deadline')}</dt>
            <dd>
              <DeadlineText view={deadline} locale={locale} />
            </dd>
          </div>
        )}
      </dl>
      {tags && tags.shown.length > 0 && (
        <ul role="list" aria-label={t('topics')} className="flex flex-wrap gap-2">
          {tags.shown.map((tag) => (
            <li key={tag.id} className="chip">
              {tag.label}
            </li>
          ))}
          {tags.more > 0 && (
            <li className="chip">
              <span aria-hidden="true">{t('moreTopics', { count: tags.more })}</span>
              <span className="sr-only">{t('moreTopicsLabel', { count: tags.more })}</span>
            </li>
          )}
        </ul>
      )}
      {!brief && job.originalUrl && deadline?.open !== false && (
        <OriginalPostingLink
          href={job.originalUrl}
          locale={locale}
          className="justify-self-start"
        />
      )}
    </div>
  )
}
