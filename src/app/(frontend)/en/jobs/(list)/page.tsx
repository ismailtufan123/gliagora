import { Icon } from '@/components/Icon'
import type { Metadata } from 'next'
import { unstable_rethrow } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { SaveRegion } from '@/components/account/SaveControl'
import { JobList } from '@/components/jobs/JobList'
import { JobFilterForm } from '@/components/jobs/list/JobFilterForm'
import { JobsListEnhancer } from '@/components/jobs/list/JobsListEnhancer'
import { ListError } from '@/components/jobs/list/ListError'
import { FILTER_FORM_ID, RESULTS_HEADING_ID, RESULTS_ID } from '@/components/jobs/list/ids'
import { LazyMapView } from '@/components/map/LazyMapView'
import { MAP_LIBRARY, mapViewTexts } from '@/components/map/texts'
import { Pagination } from '@/components/Pagination'
import { errorSummary } from '@/lib/errors'
import { JOB_FILTERS, invalidDeadlineRange, jobsHref, parseJobFilters } from '@/lib/filters/jobs'
import {
  activeFilters,
  emptyFilters,
  filtersHref,
  pageHref,
  serializeFilters,
} from '@/lib/filters/model'
import { jobsListIndexed } from '@/lib/indexing'
import { MAP_DATA_PATH, mapQuery } from '@/lib/map/data'
import { jobChips } from '@/lib/jobs/chips'
import { formatDay } from '@/lib/jobs/format'
import { preferredView } from '@/lib/jobs/preferred'
import { ACCOUNT_SECTIONS, MEMBER_PATHS } from '@/lib/members/paths'
import { memberPreferredSubfields } from '@/lib/members/preferences'
import { saveContext } from '@/lib/members/save-context'
import { type JobsList, jobsList, requestTime } from '@/lib/records'
import { FEED_PATH } from '@/lib/seo/feed'
import { paths } from '@/lib/site'

// The jobs list (PLAN §3.2 "Jobs list", §9.3, §9.4): server-rendered, 25 per page, with the shared
// filters in the URL (src/lib/filters). The proxy has already redirected any other spelling of the
// filters to the canonical address, except a range of days with a mistake, which the form shows
// again with an error. Only the unfiltered first page is indexed; filtered addresses point to it
// as their canonical page (PLAN §2.1, §16.1), and only it is in the sitemaps (the same rule,
// src/lib/indexing.ts). Every variant links to the jobs feed. A top-level window page: no
// breadcrumbs, like the other windows. The map view (`view=map`, M5) shows the list until then.
// Each row has a Save control once a way of signing in is on (src/lib/members/save-context.ts),
// which returns to this address. A signed-in member's preferred subfields apply to the list
// without filters, with a notice that names them (D35, src/lib/jobs/preferred.ts): the page then
// queries, shows and links from those filters (`effective`, `links`), while its address and
// canonical page stay those of the request. The Save controls return to the list that was shown:
// the bare list says `prefs=off` there unless the default applied, so a visitor who signs in to
// save (and may have preferences) comes back to the same rows, not to their default.
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

async function queryOf(searchParams: Props['searchParams']): Promise<URLSearchParams> {
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(await searchParams)) {
    for (const item of [value ?? []].flat()) query.append(name, item)
  }
  return query
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = await queryOf(searchParams)
  const filters = parseJobFilters(query)
  const t = await getTranslations({ locale: 'en', namespace: 'jobs' })
  return {
    title: filters.page > 1 ? t('list.titlePage', { page: filters.page }) : t('list.title'),
    description: t('list.description'),
    alternates: {
      canonical: JOB_FILTERS.path,
      types: { 'application/rss+xml': [{ url: FEED_PATH, title: t('feed.title') }] },
    },
    ...(jobsListIndexed(query) ? {} : { robots: { index: false, follow: true } }),
  }
}

export default async function Page({ searchParams }: Props) {
  setRequestLocale('en')
  const query = await queryOf(searchParams)
  const filters = parseJobFilters(query)
  const rangeInput = invalidDeadlineRange(query)
  const t = await getTranslations({ locale: 'en', namespace: 'jobs' })
  const { effective, links, applied, escape } = preferredView(
    filters,
    await memberPreferredSubfields(),
    { shownAsSent: rangeInput !== null },
  )
  let list: JobsList
  try {
    list = await jobsList(effective, 'en')
  } catch (error) {
    unstable_rethrow(error)
    // The error state is drawn here, on the server, so it shows without JavaScript (error.tsx is
    // drawn only in the browser). A page cannot set its status in Next.js, so this answers 200:
    // never stored (the page is dynamic) and kept out of search engines.
    const reference = crypto.randomUUID().slice(0, 8)
    // Class and code only: a failed query's message quotes its parameters, the words searched for.
    console.error(`Jobs list failed (reference ${reference}):`, errorSummary(error))
    return (
      <>
        <meta name="robots" content="noindex" />
        <ListError
          title={t('error.title')}
          text={t('error.text')}
          reference={t('error.reference', { digest: reference })}
          retry={
            <a href={filtersHref(JOB_FILTERS, filters)} className="button button-primary">
              {t('error.retry')}
            </a>
          }
        />
      </>
    )
  }
  const { chips, known } = jobChips(links, list, {
    region: (region) => t(`filters.regions.${region}`),
    deadline: (deadline) =>
      deadline.kind === 'within'
        ? t('filters.within', { days: deadline.days })
        : deadline.kind === 'this-month'
          ? t('filters.thisMonth')
          : t('filters.chipRange', {
              from: formatDay(deadline.from, 'en'),
              to: formatDay(deadline.to, 'en'),
            }),
    search: (q) => t('filters.chipSearch', { q }),
  })
  const active = activeFilters(JOB_FILTERS, links)
  // The empty state's way back, besides "Clear all". Values that name nothing (a retired term, an
  // unknown country or institution) have no chip and match nothing, so it drops those. Otherwise
  // it removes the last value with a chip in the address: the canonical address keeps no record
  // of the order in which filters were added, and the chips remove any other one.
  const last = chips.at(-1)
  let back: { href: string; label: string } | undefined
  if (active.length > chips.length) {
    if (chips.length > 0) {
      back = { href: filtersHref(JOB_FILTERS, known), label: t('list.removeUnknown') }
    }
  } else if (last && chips.length > 1) {
    back = { href: last.href, label: t('list.removeLast', { label: last.label }) }
  }
  const pastEnd = list.matches > 0 && filters.page > list.pages
  // "Clear all" removes the filters and keeps the view: the map stays open. For a member with
  // preferred subfields it says `prefs=off`, or it would lead back to the default (D35).
  const clearHref = filtersHref(JOB_FILTERS, {
    ...emptyFilters(JOB_FILTERS),
    view: filters.view,
    prefs: links.prefs,
  })
  const mapView = filters.view === 'map'
  // What the list shows, which the filter form's script brings the form in line with.
  const canonicalQuery = serializeFilters(JOB_FILTERS, effective)
  // The preferred subfields the default applies, by name, in the subfields' order (the chips').
  const appliedNames = applied
    ? chips.filter((chip) => chip.name === 'subfield').map((chip) => chip.label)
    : []
  // The address of the list that was shown (see above): with any filter set, the filter model
  // drops `prefs=off` again.
  const save =
    list.jobs.length > 0
      ? await saveContext(
          filtersHref(JOB_FILTERS, applied ? filters : { ...filters, prefs: 'off' }),
          list.jobs.map((job) => job.id),
        )
      : null

  const results = (
    <section
      id={RESULTS_ID}
      aria-labelledby={RESULTS_HEADING_ID}
      className="job-results grid gap-6"
    >
      <div className="results-head">
        {/* A live region: with JavaScript, the new count is announced when the results change. */}
        <div role="status">
          <h2 id={RESULTS_HEADING_ID} className="text-h3" tabIndex={-1}>
            {t('list.matches', { count: list.matches })}
          </h2>
        </div>
        <div className="sort">
          <label htmlFor="job-sort">{t('filters.sort')}</label>
          <select
            id="job-sort"
            name="sort"
            form={FILTER_FORM_ID}
            className="input"
            defaultValue={filters.sort}
          >
            <option value="deadline">{t('filters.sortDeadline')}</option>
            <option value="newest">{t('filters.sortNewest')}</option>
          </select>
          {/* With JavaScript the order changes as soon as it is chosen. */}
          <noscript>
            <button type="submit" form={FILTER_FORM_ID} className="button button-secondary">
              {t('filters.apply')}
            </button>
          </noscript>
        </div>
      </div>

      {/* New for each address: when a change arrives, its chips and rows replace the old ones
              instead of moving them about, and nothing above them changes size, so an answer that
              arrives late shifts nothing on the page (CLS, PLAN §17.1). */}
      <div key={canonicalQuery} className="grid gap-6">
        {appliedNames.length > 0 && (
          <div className="notice" data-preferred>
            <p>
              {t('list.preferred.text', {
                subfields: new Intl.ListFormat('en', { type: 'conjunction' }).format(appliedNames),
              })}
            </p>
            <ul role="list" className="flex flex-wrap gap-x-6 gap-y-2">
              <li>
                <a href={jobsHref({ ...filters, prefs: 'off', page: 1 })} data-soft>
                  {t('list.preferred.all')}
                </a>
              </li>
              <li>
                <a href={`${MEMBER_PATHS.account}#${ACCOUNT_SECTIONS.subfields}`}>
                  {t('list.preferred.change')}
                </a>
              </li>
            </ul>
          </div>
        )}
        {chips.length > 0 && (
          <div className="filter-status">
            <ul role="list" aria-label={t('filters.chips')} className="chips">
              {chips.map((chip) => (
                <li key={`${chip.name}:${chip.value}`}>
                  <a
                    href={chip.href}
                    className="chip chip-remove"
                    aria-label={t('filters.removeFilter', { label: chip.label })}
                    data-soft
                    data-chip
                  >
                    {chip.label}
                    <Icon name="close" size={14} className="flex-none" />
                  </a>
                </li>
              ))}
            </ul>
            <a href={clearHref} data-soft>
              {t('filters.clearAll')}
            </a>
          </div>
        )}

        {list.jobs.length > 0 && (
          <JobList jobs={list.jobs} now={requestTime()} locale="en" headingLevel={3} save={save} />
        )}

        {list.matches === 0 && (
          <div className="grid max-w-(--measure) gap-4">
            <p>{t('list.emptyText')}</p>
            <ul role="list" className="flex flex-wrap gap-3">
              {back && (
                <li>
                  <a
                    href={back.href}
                    className="button button-secondary whitespace-normal"
                    data-soft
                  >
                    {back.label}
                  </a>
                </li>
              )}
              {active.length > 0 && (
                <li>
                  <a
                    href={clearHref}
                    className="button button-secondary whitespace-normal"
                    data-soft
                  >
                    {t('list.clearAll')}
                  </a>
                </li>
              )}
              <li>
                <a
                  href={paths.section('suggest')}
                  className="button button-secondary whitespace-normal"
                >
                  {t('list.suggest')}
                </a>
              </li>
            </ul>
          </div>
        )}

        {pastEnd && (
          <p className="flex flex-wrap gap-x-2">
            <span>{t('list.pastEnd', { pages: list.pages })}</span>
            <a href={pageHref(JOB_FILTERS, links, 1)}>{t('list.firstPage')}</a>
          </p>
        )}

        <Pagination
          locale="en"
          page={filters.page}
          pages={list.pages}
          href={(page) => pageHref(JOB_FILTERS, links, page)}
        />
      </div>
    </section>
  )

  return (
    <main id="main" className="page-frame grid flex-1 content-start gap-4 py-12 sm:gap-6">
      <SaveRegion context={save} />
      <div className="jobs-head flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h1 className="jobs-title text-h1">{t('list.title')}</h1>
        <p className="text-card">{t('list.open', { count: list.open })}</p>
      </div>

      <JobFilterForm
        filters={known}
        options={list.options}
        active={chips.filter((chip) => chip.name !== 'q').length}
        matches={list.matches}
        rangeInput={rangeInput}
        clearHref={filtersHref(JOB_FILTERS, { ...emptyFilters(JOB_FILTERS), prefs: links.prefs })}
        showAll={escape}
        aside={
          <p className="filter-aside">
            <a href={jobsHref({ ...links, view: mapView ? 'list' : 'map' })} data-soft>
              {t(mapView ? 'view.hideMap' : 'view.showMap')}
            </a>
          </p>
        }
      />

      {mapView ? (
        <div className="jobs-split">
          {results}
          <div className="jobs-split-map">
            <LazyMapView
              dataPath={`${MAP_DATA_PATH}?${mapQuery(effective)}`}
              library={MAP_LIBRARY}
              texts={await mapViewTexts()}
              hoverScope={`#${RESULTS_ID}`}
              layout="column"
            >
              <h2 id="map-list-title" className="text-h3">
                {t('view.institutions')}
              </h2>
              <noscript>
                <p>{t('view.noJs')}</p>
              </noscript>
            </LazyMapView>
          </div>
        </div>
      ) : (
        results
      )}

      <JobsListEnhancer query={canonicalQuery} />
    </main>
  )
}
