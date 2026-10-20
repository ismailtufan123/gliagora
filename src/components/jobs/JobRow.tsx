import { getTranslations } from 'next-intl/server'

import { SaveControl } from '@/components/account/SaveControl'
import type { Locale } from '@/i18n/routing'
import { deadlineView } from '@/lib/jobs/format'
import { textDirection } from '@/lib/jobs/languages'
import { type JobCard, rowTags } from '@/lib/jobs/view'
import type { SaveContext } from '@/lib/members/save-context'

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
  /** The page's Save context: a Save control in each row (the jobs list, the saved page). */
  save?: SaveContext | null
  /** The title as text, not a link: positions that are no longer open (the saved page). */
  plainTitle?: boolean
}

// A job in a list (PLAN §3.2 "Job card", §7.5 "Job row", §9.3): the title linking to the job
// page, institution, place, position type, deadline with days left and gauge, up to three tags
// (from 480px; phones leave them to the job page, PLAN §9.4), the original posting and, where the
// page has them, the Save control. The metadata are separate labelled elements (§7.6), with the
// labels for screen readers only.
export async function JobRow({
  job,
  now,
  locale,
  headingLevel,
  showInstitution = true,
  compact = false,
  brief = false,
  save,
  plainTitle = false,
}: JobRowOptions & { job: JobCard; now: Date; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'jobs' })
  const Heading = `h${headingLevel}` as const
  const deadline = deadlineView(job, now, locale)
  const { city, country } = job
  const place = city && country ? t('place', { city, country }) : (city ?? country)
  const tags = compact ? null : rowTags(job)
  const lang = job.originalLanguage !== locale ? job.originalLanguage : undefined
  const posting = !brief && job.originalUrl && deadline?.open !== false ? job.originalUrl : null

  return (
    <div className="job-row">
      <Heading className="font-display text-card leading-tight font-bold">
        {plainTitle ? (
          <span lang={lang} dir={textDirection(lang)}>
            {job.title}
          </span>
        ) : (
          <a href={job.path} lang={lang} dir={textDirection(lang)}>
            {job.title}
          </a>
        )}
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
        <ul
          role="list"
          aria-label={t('topics')}
          className="flex flex-wrap gap-2 max-[30rem]:hidden"
        >
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
      {(posting || save) && (
        <div className="job-row-actions">
          {posting && <OriginalPostingLink href={posting} locale={locale} />}
          {save && <SaveControl job={job} context={save} />}
        </div>
      )}
    </div>
  )
}
