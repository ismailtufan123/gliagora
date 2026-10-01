import { getTranslations } from 'next-intl/server'

import { jobsHref } from '@/lib/filters/jobs'
import type { HomeData } from '@/lib/home'
import { paths } from '@/lib/site'

// The live figures under the hero (PLAN §3.2 "Home", §9.1): open positions, deadlines this month,
// institutions and countries, each from the database and each linking to the list it counts (the
// countries to the list of them further down the page).

export const COUNTRIES_ID = 'countries'

export async function HomeFigures({ data }: { data: HomeData }) {
  const t = await getTranslations({ locale: 'en', namespace: 'home.figures' })
  const figures = [
    { key: 'open', count: data.open, href: jobsHref() },
    {
      key: 'deadlines',
      count: data.deadlinesThisMonth,
      href: jobsHref({ deadline: 'this-month' }),
    },
    { key: 'institutions', count: data.institutions, href: paths.section('map') },
    { key: 'countries', count: data.countries.length, href: `#${COUNTRIES_ID}` },
  ] as const
  return (
    <section className="home-figures" aria-labelledby="home-figures-title">
      <h2 id="home-figures-title" className="sr-only">
        {t('title')}
      </h2>
      <ul role="list" className="page-frame">
        {figures.map(({ key, count, href }) => (
          <li key={key}>
            <a href={href}>
              {t.rich(key, {
                count,
                n: (chunks) => <span className="home-figure">{chunks}</span>,
              })}
            </a>
            <p>{t(`${key}Note`)}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
