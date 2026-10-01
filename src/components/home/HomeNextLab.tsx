import { getTranslations } from 'next-intl/server'

import { jobsHref } from '@/lib/filters/jobs'
import type { HomeData } from '@/lib/home'
import { paths } from '@/lib/site'

import { COUNTRIES_ID } from './HomeFigures'

// "Where is your next lab?" (PLAN §9.1): the way to the map, and the countries with open
// positions, each linking to its list. No picture of the map: one made earlier would not show
// today's positions (D45).

/** Countries listed here; the rest are on the map. */
const SHOWN = 12

export async function HomeNextLab({ data }: { data: HomeData }) {
  const t = await getTranslations({ locale: 'en', namespace: 'home.nextLab' })
  const shown = data.countries.slice(0, SHOWN)
  const more = data.countries.length - shown.length
  return (
    <section className="home-next-lab" aria-labelledby="home-next-lab-title">
      <div className="page-frame">
        <div>
          <h2 id="home-next-lab-title" className="text-h2">
            {t('title')}
          </h2>
          <p>{t('text')}</p>
          <a className="button button-secondary" href={paths.section('map')}>
            {t('link')}
          </a>
        </div>
        {/* Always there: the countries figure links to its heading. */}
        <div>
          <h3 id={COUNTRIES_ID} tabIndex={-1} className="text-card">
            {t('countries')}
          </h3>
          {shown.length > 0 ? (
            <ul role="list">
              {shown.map((country) => (
                <li key={country.code}>
                  <a href={jobsHref({ country: [country.code] })}>
                    {t('country', { name: country.name, count: country.jobs })}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted">{t('noCountries')}</p>
          )}
          {more > 0 && (
            <p className="text-text-muted">
              <a href={paths.section('map')}>{t('more', { count: more })}</a>
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
