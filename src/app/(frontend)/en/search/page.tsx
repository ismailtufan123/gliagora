import type { Metadata } from 'next'
import { unstable_rethrow } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { JobList } from '@/components/jobs/JobList'
import { ListError } from '@/components/jobs/list/ListError'
import { SearchForm } from '@/components/search/SearchForm'
import { SUBFIELDS_PATH } from '@/lib/detail-routes'
import { errorSummary } from '@/lib/errors'
import { jobsHref } from '@/lib/filters/jobs'
import { type SiteSearch, requestTime, siteSearch } from '@/lib/records'
import { normaliseQuery } from '@/lib/search/parse'
import { LIVE_WINDOWS, paths } from '@/lib/site'

// The search page (PLAN §2.2, §3.2, §7.5): a GET form and the results in groups (positions,
// institutions, subfields), each with its count; the hints and the windows when there is no query,
// suggestions when nothing matches. Server-rendered, so it works without JavaScript; the header's
// search dialog (Ctrl/Cmd+K) sends its query here. Not indexed, with /en/search/ as the canonical
// address whatever the query (PLAN §16.1).
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

async function queryOf(searchParams: Props['searchParams']): Promise<string> {
  const q = (await searchParams).q
  return normaliseQuery([q ?? []].flat().join(' '))
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = await queryOf(searchParams)
  const t = await getTranslations({ locale: 'en', namespace: 'search' })
  return {
    title: q ? t('titleQuery', { q }) : t('title'),
    description: t('description'),
    alternates: { canonical: paths.search() },
    robots: { index: false, follow: true },
  }
}

export default async function Page({ searchParams }: Props) {
  setRequestLocale('en')
  const q = await queryOf(searchParams)
  const t = await getTranslations({ locale: 'en' })

  let results: SiteSearch | null = null
  if (q) {
    try {
      results = await siteSearch(q, 'en')
    } catch (error) {
      unstable_rethrow(error)
      // Drawn on the server, so it shows without JavaScript; as on the jobs list, the page answers
      // 200 and is neither stored nor indexed.
      const reference = crypto.randomUUID().slice(0, 8)
      // Class and code only: a failed query's message quotes its parameters, the words searched for.
      console.error(`Search failed (reference ${reference}):`, errorSummary(error))
      return (
        <ListError
          title={t('search.error.title')}
          text={t('search.error.text')}
          reference={t('search.error.reference', { digest: reference })}
          retry={
            <a
              href={`${paths.search()}?${new URLSearchParams({ q })}`}
              className="button button-primary"
            >
              {t('search.error.retry')}
            </a>
          }
        />
      )
    }
  }
  const total = results
    ? results.positions.total + results.institutions.total + results.subfields.total
    : 0

  return (
    <main id="main" className="page-frame grid flex-1 content-start gap-8 py-12">
      <div className="grid max-w-(--measure) gap-6">
        <h1 className="text-h1">{t('search.title')}</h1>
        <SearchForm
          inputId="search-q"
          label={t('search.label')}
          submit={t('search.submit')}
          defaultValue={q}
        />
        {/* The number of results, in a status region (PLAN §7.5). The query may be one long word
            (a pasted address), so it may break anywhere rather than widen the page. */}
        <div role="status">
          {q && (
            <p className="text-card wrap-anywhere">{t('search.results', { count: total, q })}</p>
          )}
        </div>
      </div>

      {!q && (
        <section aria-labelledby="search-empty" className="grid max-w-(--measure) gap-4">
          <h2 id="search-empty" className="text-h3">
            {t('search.emptyTitle')}
          </h2>
          <p>{t('search.emptyText')}</p>
          <p>{t('search.hintSyntax')}</p>
          <h3 className="text-card">{t('search.browse')}</h3>
          <ul role="list" className="flex flex-wrap gap-3">
            {/* The windows that are built (D55); the subfields lead into every one. */}
            {LIVE_WINDOWS.map((key) => (
              <li key={key}>
                <a href={paths.window(key)} className="button button-secondary">
                  {t(`windows.${key}`)}
                </a>
              </li>
            ))}
            <li>
              <a href={SUBFIELDS_PATH} className="button button-secondary">
                {t('search.allSubfields')}
              </a>
            </li>
          </ul>
        </section>
      )}

      {q && total === 0 && (
        <section aria-labelledby="search-none" className="grid max-w-(--measure) gap-4">
          <h2 id="search-none" className="text-h3">
            {t('search.noResultsTips')}
          </h2>
          <ul className="grid list-disc gap-2 ps-6">
            <li>{t('search.tipSpelling')}</li>
            <li>{t('search.tipFewer')}</li>
            <li>{t('search.hintSyntax')}</li>
          </ul>
          <ul role="list" className="flex flex-wrap gap-3">
            <li>
              <a href={jobsHref()} className="button button-secondary whitespace-normal">
                {t('search.browsePositions')}
              </a>
            </li>
            <li>
              <a
                href={paths.section('suggest')}
                className="button button-secondary whitespace-normal"
              >
                {t('search.suggest')}
              </a>
            </li>
          </ul>
        </section>
      )}

      {results && results.positions.total > 0 && (
        <section aria-labelledby="search-positions" className="grid gap-4">
          <div className="result-head">
            <h2 id="search-positions" className="text-h2">
              {t('search.positions')}
            </h2>
            <p>{t('search.positionsCount', { count: results.positions.total })}</p>
          </div>
          <JobList jobs={results.positions.jobs} now={requestTime()} locale="en" headingLevel={3} />
          <p className="wrap-anywhere">
            <a href={jobsHref({ q: results.q })}>
              {t('search.seeAll', { count: results.positions.total, q: results.q })}
            </a>
          </p>
        </section>
      )}

      {results && results.institutions.total > 0 && (
        <section aria-labelledby="search-institutions" className="grid gap-4">
          <div className="result-head">
            <h2 id="search-institutions" className="text-h2">
              {t('search.institutions')}
            </h2>
            <p>{t('search.institutionsCount', { count: results.institutions.total })}</p>
          </div>
          <ul role="list" className="result-list">
            {results.institutions.items.map((institution) => {
              const { city, country } = institution
              const place =
                city && country ? t('institution.location', { city, country }) : (city ?? country)
              const open = t('search.openPositions', { count: institution.openJobs })
              return (
                <li key={institution.id}>
                  <a href={institution.href} className="font-bold">
                    {institution.name}
                  </a>
                  <p className="result-meta">
                    {place && <span>{place}</span>}
                    {institution.openJobs > 0 ? (
                      <a href={institution.jobsHref}>{open}</a>
                    ) : (
                      <span>{open}</span>
                    )}
                  </p>
                </li>
              )
            })}
          </ul>
          {results.institutions.total > results.institutions.items.length && (
            <p className="text-caption text-text-muted">
              {t('search.institutionsMore', { shown: results.institutions.items.length })}
            </p>
          )}
        </section>
      )}

      {results && results.subfields.total > 0 && (
        <section aria-labelledby="search-subfields" className="grid gap-4">
          <div className="result-head">
            <h2 id="search-subfields" className="text-h2">
              {t('search.subfields')}
            </h2>
            <p>{t('search.subfieldsCount', { count: results.subfields.total })}</p>
          </div>
          <ul role="list" className="result-list">
            {results.subfields.items.map((subfield) => (
              <li key={subfield.slug}>
                <a href={subfield.href} className="font-bold">
                  {subfield.label}
                </a>
                {subfield.description && (
                  <p className="result-meta text-text-muted">{subfield.description}</p>
                )}
              </li>
            ))}
          </ul>
          {results.subfields.total > results.subfields.items.length && (
            <p>
              {t.rich('search.subfieldsMore', {
                shown: results.subfields.items.length,
                link: (chunks) => <a href={SUBFIELDS_PATH}>{chunks}</a>,
              })}
            </p>
          )}
        </section>
      )}
    </main>
  )
}
