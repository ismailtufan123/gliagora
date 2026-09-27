import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { NotFoundContent } from '@/components/NotFoundContent'
import { institutionPath, matchDetailRoute } from '@/lib/detail-routes'
import { institutionByUrlId } from '@/lib/records'
import { rorUrl } from '@/lib/ror/ror-id'
import { paths } from '@/lib/site'

// An institution (PLAN §3.2 "Institution page", §9.6): ROR name, city, country, website, ROR
// link, open positions and upcoming events. Positions arrive with M4, events with M8 and the mini
// map with M5. Not indexed while it has no active items (PLAN §2.5). No institution logos.
// The proxy has already answered 404 for unknown IDs and redirected outdated slugs.
export const dynamic = 'force-dynamic'

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
  return {
    title: institution.name,
    description: t('description', { name: institution.name }),
    alternates: { canonical: institutionPath(institution.slug, urlId(institution)) },
    // Institutions are indexed only while they have active positions or events (from M4).
    robots: { index: false },
  }
}

export default async function Page({ params }: Props) {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'institution' })
  const institution = await load(params)
  // Only if the institution disappeared after the proxy checked it; notFound() would render on
  // the client only (CLAUDE.md), so show the 404 content directly.
  if (!institution) return <NotFoundContent locale="en" kind="notFound" />

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
        <h1>{institution.name}</h1>
        {place && <p className="text-card">{place}</p>}
        {institution.status !== 'active' && <p role="note">{t('notActive')}</p>}
        <ul role="list" className="flex flex-wrap gap-x-6 gap-y-2">
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

        <h2>{t('positions')}</h2>
        <p>{t.rich('noPositions', { link: link(paths.window('jobs')) })}</p>

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
