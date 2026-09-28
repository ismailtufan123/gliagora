import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { Breadcrumbs } from '@/components/Breadcrumbs'
import { JobList } from '@/components/jobs/JobList'
import { NotFoundContent } from '@/components/NotFoundContent'
import { institutionPath, matchDetailRoute } from '@/lib/detail-routes'
import { jobsHref } from '@/lib/filters/jobs'
import { institutionIndexed } from '@/lib/indexing'
import { institutionByUrlId, openJobsAtInstitution, requestTime } from '@/lib/records'
import { reportHref } from '@/lib/reports/item'
import { rorUrl } from '@/lib/ror/ror-id'
import { paths } from '@/lib/site'

// An institution (PLAN §3.2 "Institution page", §9.6): ROR name, city, country, website, ROR
// link, "Report a problem" (D40), open positions and upcoming events. Events arrive with M8 and
// the mini map with M5.
// Breadcrumbs (Home › institution; there is no institution index) give the BreadcrumbList data
// every deep page has (§16.2).
// Indexed only while it has open positions (PLAN §2.5; events count too from M8). No
// institution logos. The proxy has already answered 404 for unknown IDs and redirected outdated
// slugs.
export const dynamic = 'force-dynamic'

/** Open positions shown here, nearest deadline first; the jobs list has the rest. */
const POSITIONS = 10

type Props = { params: Promise<{ path: string }> }

async function load(params: Props['params']) {
  const { path } = await params
  const route = matchDetailRoute(`/en/institutions/${path}/`)
  return route?.kind === 'institution' ? institutionByUrlId(route.id, 'en') : null
}

const urlId = (institution: { rorId?: string | null; shortId?: string | null }) =>
  institution.rorId ?? institution.shortId ?? ''

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const institution = await load(params)
  if (!institution) return { robots: { index: false } }
  const t = await getTranslations({ locale: 'en', namespace: 'institution' })
  const positions = await openJobsAtInstitution(institution.id, 'en', POSITIONS)
  return {
    title: institution.name,
    description: t('description', { name: institution.name }),
    alternates: { canonical: institutionPath(institution.slug, urlId(institution)) },
    // Indexed only while it has open positions (PLAN §2.5); upcoming events count too from M8.
    // The sitemaps list it by the same rule.
    ...(institutionIndexed(positions.total) ? {} : { robots: { index: false } }),
  }
}

export default async function Page({ params }: Props) {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'institution' })
  const institution = await load(params)
  // Only if the institution disappeared after the proxy checked it; notFound() would render on
  // the client only (CLAUDE.md), so show the 404 content directly.
  if (!institution) return <NotFoundContent locale="en" kind="notFound" />

  const positions = await openJobsAtInstitution(institution.id, 'en', POSITIONS)
  const country = typeof institution.country === 'object' ? institution.country?.name : null
  const { city } = institution
  const place = city && country ? t('location', { city, country }) : (city ?? country)
  const link = (href: string) =>
    function Link(chunks: ReactNode) {
      return <a href={href}>{chunks}</a>
    }

  return (
    <main id="main" className="page-frame flex-1 py-12">
      <article className="prose">
        <Breadcrumbs
          locale="en"
          items={[{ label: t('home'), href: paths.home() }, { label: institution.name }]}
        />
        <h1>{institution.name}</h1>
        {place && <p className="text-card">{place}</p>}
        {institution.status !== 'active' && <p role="note">{t('notActive')}</p>}
        <ul role="list" className="flex list-none flex-wrap gap-x-6 gap-y-2 ps-0">
          {institution.website && (
            <li>
              <a href={institution.website}>{t('website')}</a>
            </li>
          )}
          {institution.rorId && (
            <li>
              <a href={rorUrl(institution.rorId)}>{t('rorRecord')}</a>
            </li>
          )}
        </ul>
        {(institution.aliases ?? []).length > 0 && (
          <p className="text-caption text-text-muted">
            {t('otherNames', { names: (institution.aliases ?? []).slice(0, 6).join(', ') })}
          </p>
        )}
        {/* As on a job page: after the facts, the form with this institution filled in, named by
            the ID its address ends with. */}
        <p>
          <a href={reportHref({ type: 'institution', id: urlId(institution) })}>
            {t('reportProblem')}
          </a>
        </p>

        <h2>{t('positions')}</h2>
        {positions.jobs.length > 0 ? (
          <>
            <JobList
              jobs={positions.jobs}
              now={requestTime()}
              locale="en"
              headingLevel={3}
              showInstitution={false}
            />
            {positions.total > POSITIONS && (
              <p>
                <a href={jobsHref({ institution: [urlId(institution)] })}>
                  {t('allPositions', { count: positions.total, name: institution.name })}
                </a>
              </p>
            )}
          </>
        ) : (
          <p>{t.rich('noPositions', { link: link(paths.window('jobs')) })}</p>
        )}

        <h2>{t('events')}</h2>
        <p>{t.rich('noEvents', { link: link(paths.window('events')) })}</p>

        {institution.origin === 'ror' && (
          <p className="text-caption text-text-muted">
            {t.rich('source', { link: link('https://ror.org/') })}
          </p>
        )}
      </article>
    </main>
  )
}
