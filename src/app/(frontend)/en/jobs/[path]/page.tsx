import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { Breadcrumbs } from '@/components/Breadcrumbs'
import { DeadlineText } from '@/components/jobs/DeadlineText'
import { JobList } from '@/components/jobs/JobList'
import { OriginalPostingLink } from '@/components/jobs/OriginalPostingLink'
import { NotFoundContent } from '@/components/NotFoundContent'
import { matchDetailRoute } from '@/lib/detail-routes'
import { jobIndexed } from '@/lib/indexing'
import { listingState } from '@/lib/jobs/deadline'
import { deadlineView, formatDay, languageName, listOf } from '@/lib/jobs/format'
import { textDirection } from '@/lib/jobs/languages'
import { jobsHref } from '@/lib/filters/jobs'
import { type TermRef, subfieldHubPath } from '@/lib/jobs/view'
import { jobByShortId, openJobsAtInstitution, requestTime, similarOpenJobs } from '@/lib/records'
import { reportHref } from '@/lib/reports/item'

// A job (PLAN §3.2 "Job detail", §9.5): facts only, our own summary and the way to the employer's
// posting. No JobPosting markup (§16.2). Indexed while open; once closed (the deadline day has
// ended, or the job was marked expired) it shows the closed notice and similar open positions
// first, without the way to apply, and is not indexed (§2.5). The proxy has already answered 404
// for unknown jobs, drafts and jobs in review, 410 for withdrawn jobs and jobs closed 30 days
// ago, and redirected outdated slugs.
export const dynamic = 'force-dynamic'

const MORE_AT_INSTITUTION = 3
const SIMILAR = 6

type Props = { params: Promise<{ path: string }> }

async function load(params: Props['params']) {
  const { path } = await params
  const route = matchDetailRoute(`/en/jobs/${path}/`)
  const job = route?.kind === 'job' ? await jobByShortId(route.shortId, 'en') : null
  if (!job) return null
  const now = requestTime()
  return { job, now, state: listingState(job, now) }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loaded = await load(params)
  if (!loaded || loaded.state === 'hidden' || loaded.state === 'gone') {
    return { robots: { index: false } }
  }
  const { job, state } = loaded
  const t = await getTranslations({ locale: 'en', namespace: 'job' })
  return {
    title: job.title,
    description:
      job.summary ??
      t('description', { title: job.title, institution: job.institution?.name ?? '' }),
    alternates: { canonical: job.path },
    // Indexed only while open (PLAN §2.5, §16.1), and listed in the sitemaps by the same rule.
    ...(jobIndexed(state) ? {} : { robots: { index: false } }),
  }
}

/** Topic chips, each linking to `href(term)`; plain text where that is null. */
const topicLinks = (terms: TermRef[], href: (term: TermRef) => string | null) => (
  <ul role="list" className="flex flex-wrap gap-2">
    {terms.map((term) => {
      const url = href(term)
      return (
        <li key={term.id}>
          {url ? (
            <a href={url} className="chip">
              {term.label}
            </a>
          ) : (
            <span className="chip">{term.label}</span>
          )}
        </li>
      )
    })}
  </ul>
)

export default async function Page({ params }: Props) {
  setRequestLocale('en')
  const loaded = await load(params)
  // Only if the job changed after the proxy checked it; notFound() would render on the client
  // only (CLAUDE.md), so show the 404 or 410 content directly.
  if (!loaded || loaded.state === 'hidden') return <NotFoundContent locale="en" kind="notFound" />
  if (loaded.state === 'gone') return <NotFoundContent locale="en" kind="gone" />

  const { job, now, state } = loaded
  const open = state === 'open'
  const t = await getTranslations({ locale: 'en' })
  const lang = job.originalLanguage !== 'en' ? job.originalLanguage : undefined
  const { institution, positionType: type, city, country } = job
  const place = city && country ? t('jobs.place', { city, country }) : (city ?? country)
  const deadline = deadlineView(job, now, 'en')
  const zone = deadline?.kind === 'fixed' && deadline.open ? deadline.zone : null
  // The breadcrumb filters the list by the first subfield still in use; a retired one stays on
  // the job but is no longer a filter.
  const firstSubfield = job.subfields.find((term) => term.isActive)
  // A closed position has no way to apply (PLAN §2.5).
  const postingUrl = open ? job.originalUrl : null
  const allJobsLink = (chunks: ReactNode) => <a href={jobsHref()}>{chunks}</a>
  // "Report a problem" (PLAN §7.5) opens the form with this job filled in, also once it closed.
  const report = reportHref({ type: 'job', shortId: job.shortId })

  const atInstitution = institution
    ? await openJobsAtInstitution(institution.id, 'en', MORE_AT_INSTITUTION, job.id)
    : { jobs: [], total: 0 }
  const similar = await similarOpenJobs(
    job,
    [job.id, ...atInstitution.jobs.map((other) => other.id)],
    'en',
    SIMILAR,
  )

  const similarSection = (
    <section aria-labelledby="similar" className="grid max-w-(--measure) content-start gap-4">
      <h2 id="similar" className="text-h3">
        {t('job.similar')}
      </h2>
      {similar.length > 0 ? (
        <JobList jobs={similar} now={now} locale="en" headingLevel={3} />
      ) : (
        <p>{t.rich('job.noSimilar', { link: allJobsLink })}</p>
      )}
    </section>
  )
  const institutionSection = institution && atInstitution.jobs.length > 0 && (
    <section
      aria-labelledby="institution-jobs"
      className="grid max-w-(--measure) content-start gap-4"
    >
      <h2 id="institution-jobs" className="text-h3">
        {t('job.moreAtInstitution')}
      </h2>
      <JobList
        jobs={atInstitution.jobs}
        now={now}
        locale="en"
        headingLevel={3}
        showInstitution={false}
        compact
      />
      {atInstitution.total > MORE_AT_INSTITUTION && (
        <p>
          <a href={jobsHref({ institution: [institution.urlId] })}>
            {t('job.allAtInstitution', {
              // The list shows this job too while it is open.
              count: atInstitution.total + (open ? 1 : 0),
              institution: institution.name,
            })}
          </a>
        </p>
      )}
    </section>
  )

  return (
    <main id="main" className="page-frame grid flex-1 content-start gap-12 py-12">
      <div className="grid gap-4">
        <Breadcrumbs
          locale="en"
          items={[
            { label: t('windows.jobs'), href: jobsHref() },
            ...(type ? [{ label: type.label, href: jobsHref({ type: [type.slug] }) }] : []),
            ...(firstSubfield
              ? [
                  {
                    label: firstSubfield.label,
                    href: jobsHref({
                      type: type ? [type.slug] : [],
                      subfield: [firstSubfield.slug],
                    }),
                  },
                ]
              : []),
            { label: job.title, lang },
          ]}
        />
        <h1 className="text-h1" lang={lang} dir={textDirection(lang)}>
          {job.title}
        </h1>
        <p className="flex flex-wrap gap-x-6 gap-y-1 text-card">
          {institution && <a href={institution.path}>{institution.name}</a>}
          {place && <span>{place}</span>}
        </p>
      </div>

      {!open && (
        <section aria-labelledby="closed" className="notice max-w-(--measure)">
          <h2 id="closed" className="text-h3">
            {t('job.closedTitle')}
          </h2>
          <p>{t('job.closedText')}</p>
        </section>
      )}
      {!open && similarSection}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section aria-labelledby="facts" className="border border-line bg-surface p-6">
          <h2 id="facts" className="sr-only">
            {t('job.facts')}
          </h2>
          <dl className="job-facts">
            {deadline && (
              <div>
                <dt>{t('job.deadline')}</dt>
                <dd>
                  <DeadlineText view={deadline} locale="en" detail />
                  {zone && (
                    <span className="block text-caption text-text-muted">
                      {zone.name
                        ? t('job.deadlineZone', { zone: zone.name, offset: zone.offset })
                        : t('job.deadlineOffset', { offset: zone.offset })}
                    </span>
                  )}
                </dd>
              </div>
            )}
            {type && (
              <div>
                <dt>{t('job.positionType')}</dt>
                <dd>{type.label}</dd>
              </div>
            )}
            {job.careerStages.length > 0 && (
              <div>
                <dt>{t('job.careerStages')}</dt>
                <dd>
                  {listOf(
                    job.careerStages.map((stage) => stage.label),
                    'en',
                  )}
                </dd>
              </div>
            )}
            {job.startText && (
              <div>
                <dt>{t('job.start')}</dt>
                <dd>{job.startText}</dd>
              </div>
            )}
            <div>
              <dt>{t('job.originalLanguage')}</dt>
              <dd>{languageName(job.originalLanguage, 'en')}</dd>
            </div>
            {place && (
              <div>
                <dt>{t('job.location')}</dt>
                <dd>{place}</dd>
              </div>
            )}
          </dl>
        </section>

        <section aria-labelledby="posting" className="grid gap-3 border border-line bg-surface p-6">
          {/* Named by what it holds: once the posting link is gone, only the verification is left. */}
          <h2 id="posting" className="sr-only">
            {t(postingUrl ? 'job.posting' : 'job.verification')}
          </h2>
          {postingUrl && (
            <>
              <div className="action-bar">
                <OriginalPostingLink href={postingUrl} locale="en" primary />
              </div>
              <p>{t('job.authoritative')}</p>
            </>
          )}
          {job.verifiedDay && (
            <p className="text-caption text-text-muted">
              {t('job.lastVerified', { date: formatDay(job.verifiedDay, 'en') })}
            </p>
          )}
          <p>
            <a href={report}>{t('job.reportProblem')}</a>
          </p>
        </section>
      </div>

      {job.summary && (
        <section aria-labelledby="summary" className="grid max-w-(--measure) gap-4">
          <h2 id="summary" className="text-h3">
            {t('job.summary')}
          </h2>
          <p>{job.summary}</p>
        </section>
      )}

      {job.subfields.length + job.methods.length + job.modelSystems.length > 0 && (
        <section aria-labelledby="topics" className="grid max-w-(--measure) gap-4">
          <h2 id="topics" className="text-h3">
            {t('job.topics')}
          </h2>
          <dl className="job-facts">
            {job.subfields.length > 0 && (
              <div>
                <dt>{t('job.subfields')}</dt>
                <dd>{topicLinks(job.subfields, subfieldHubPath)}</dd>
              </div>
            )}
            {job.methods.length > 0 && (
              <div>
                <dt>{t('job.methods')}</dt>
                <dd>{topicLinks(job.methods, (term) => jobsHref({ method: [term.slug] }))}</dd>
              </div>
            )}
            {job.modelSystems.length > 0 && (
              <div>
                <dt>{t('job.modelSystems')}</dt>
                <dd>{topicLinks(job.modelSystems, (term) => jobsHref({ model: [term.slug] }))}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {open ? (
        <div className={`grid gap-12 ${institutionSection ? 'lg:grid-cols-2' : ''}`}>
          {institutionSection}
          {similarSection}
        </div>
      ) : (
        institutionSection
      )}
    </main>
  )
}
