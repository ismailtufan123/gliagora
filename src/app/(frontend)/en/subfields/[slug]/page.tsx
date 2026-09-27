import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { Breadcrumbs } from '@/components/Breadcrumbs'
import { JobList } from '@/components/jobs/JobList'
import { NotFoundContent } from '@/components/NotFoundContent'
import { SUBFIELDS_PATH, subfieldPath } from '@/lib/detail-routes'
import { jobsListPath } from '@/lib/jobs/view'
import { activeSubfields, openJobsInSubfield, requestTime, subfieldBySlug } from '@/lib/records'
import { paths } from '@/lib/site'

// A subfield hub (PLAN §2.2, §16.3): the subfield, its written introduction once there is one,
// its open positions (from M4) and the other subfields. The other windows add their items in
// their milestones. The proxy has already answered 404 or 410 for unknown and retired subfields.
export const dynamic = 'force-dynamic'

/** Open positions shown here, nearest deadline first; the jobs list has the rest. */
const POSITIONS = 10

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const t = await getTranslations({ locale: 'en', namespace: 'subfields' })
  const subfield = await subfieldBySlug(slug, 'en')
  // Only a subfield from the database names the page; never text from the URL.
  if (!subfield?.label) return { robots: { index: false } }
  return {
    title: subfield.label,
    description: t('hubDescription', { subfield: subfield.label }),
    alternates: { canonical: subfieldPath(slug) },
    // Hubs are indexed once they have their written introductions (PLAN §16.3, M3).
    robots: { index: false },
  }
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en' })
  const subfield = await subfieldBySlug(slug, 'en')
  // Only if the subfield disappeared after the proxy checked it; notFound() would render on the
  // client only (CLAUDE.md), so show the 404 content directly.
  if (!subfield) return <NotFoundContent locale="en" kind="notFound" />
  const label = subfield.label ?? slug
  const others = (await activeSubfields('en')).filter((other) => other.slug !== slug)
  const intro = (subfield.hubIntro ?? '').split(/\n\s*\n/).filter((part) => part.trim())
  const positions = await openJobsInSubfield(subfield.id, 'en', POSITIONS)
  const allJobsLink = (chunks: ReactNode) => <a href={paths.window('jobs')}>{chunks}</a>

  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="prose">
        <Breadcrumbs
          locale="en"
          items={[
            { label: t('subfields.home'), href: paths.home() },
            { label: t('subfields.title'), href: SUBFIELDS_PATH },
            { label },
          ]}
        />
        <h1>{label}</h1>
        {subfield.description && <p className="text-card">{subfield.description}</p>}
        {intro.map((paragraph) => (
          <p key={paragraph}>{paragraph.trim()}</p>
        ))}
        <h2>{t('subfields.positions')}</h2>
        {positions.jobs.length > 0 ? (
          <>
            <JobList jobs={positions.jobs} now={requestTime()} locale="en" headingLevel={3} />
            {positions.total > POSITIONS && (
              <p>
                <a href={jobsListPath({ subfield: slug })}>
                  {t('subfields.allPositions', { count: positions.total, subfield: label })}
                </a>
              </p>
            )}
          </>
        ) : (
          <p>{t.rich('subfields.noPositions', { link: allJobsLink })}</p>
        )}
        <p className="text-text-muted">{t('subfields.comingSoon')}</p>
        <h2>{t('subfields.others')}</h2>
        <ul role="list">
          {others.map((other) => (
            <li key={other.slug}>
              <a href={subfieldPath(other.slug)}>{other.label}</a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
