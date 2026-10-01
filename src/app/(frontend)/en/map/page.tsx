import type { Metadata } from 'next'
import { unstable_rethrow } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { MapView } from '@/components/map/MapView'
import { MAP_LIBRARY, mapViewTexts } from '@/components/map/texts'
import { errorSummary } from '@/lib/errors'
import { emptyFilters } from '@/lib/filters/model'
import { JOB_FILTERS, jobsHref } from '@/lib/filters/jobs'
import { mapPageIndexed } from '@/lib/indexing'
import { MAP_DATA_PATH } from '@/lib/map/data'
import { type MapData, mapInstitutions } from '@/lib/records'
import { paths } from '@/lib/site'

// The world map (PLAN §2.2, §14): every institution with open positions. The map and its list of
// institutions in view are MapView; the page draws the same institutions as a plain list, which
// is what readers without JavaScript or WebGL get, and what the map's list starts from. Read from
// the database at request time.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'map' })
  return {
    title: t('title'),
    description: t('description'),
    alternates: { canonical: paths.section('map') },
    ...(mapPageIndexed() ? {} : { robots: { index: false, follow: true } }),
  }
}

export default async function Page() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en' })
  const filters = emptyFilters(JOB_FILTERS)
  let data: MapData | null = null
  try {
    data = await mapInstitutions(filters, 'en')
  } catch (error) {
    unstable_rethrow(error)
    // The list below says the data could not be read; the map tries again in the browser.
    console.error('Map page failed:', errorSummary(error))
  }
  const institutions = [...(data?.institutions ?? [])].sort(
    (a, b) => b.jobs.length - a.jobs.length || a.name.localeCompare(b.name),
  )

  return (
    <main id="main" className="page-frame grid flex-1 content-start gap-6 py-12">
      <div className="grid max-w-(--measure) gap-3">
        <h1 className="text-h1">{t('map.title')}</h1>
        <p>{t('map.intro')}</p>
        <p>
          <a href={jobsHref({ view: 'map' })}>{t('map.filterLink')}</a>
        </p>
      </div>
      <MapView dataPath={MAP_DATA_PATH} library={MAP_LIBRARY} texts={await mapViewTexts()}>
        <h2 id="map-list-title" className="text-h3">
          {t('map.listAll')}
        </h2>
        {data ? (
          <ul role="list">
            {institutions.map((institution) => (
              <li key={institution.id}>
                <a href={institution.path} className="map-list-item">
                  <span>{institution.name}</span>
                  <span className="text-muted">
                    {t('map.positions', { count: institution.jobs.length })}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('map.listFailed')}</p>
        )}
        <noscript>
          <p>{t('map.noJs')}</p>
        </noscript>
      </MapView>
      <p className="map-sources text-muted">
        {t.rich('map.sources', {
          osm: (chunks) => <a href="https://www.openstreetmap.org/copyright">{chunks}</a>,
          protomaps: (chunks) => <a href="https://protomaps.com/">{chunks}</a>,
          maplibre: (chunks) => <a href="https://maplibre.org/">{chunks}</a>,
          ror: (chunks) => <a href="https://ror.org/">{chunks}</a>,
        })}
      </p>
    </main>
  )
}
