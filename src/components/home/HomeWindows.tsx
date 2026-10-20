import { getTranslations } from 'next-intl/server'

import { jobsHref } from '@/lib/filters/jobs'
import type { HomeData } from '@/lib/home'
import { LIVE_WINDOWS, paths } from '@/lib/site'

// The windows overview (PLAN §9.1): each window that is built (LIVE_WINDOWS) with a short
// description, a few live ways in and its link; Jobs takes the full width. Each window gets its
// card here in the milestone that builds it; until M8, Jobs is the only one, with its position
// types as the ways in: every type with open positions, in the taxonomy's order (MSc to industry),
// so a reader looking for a PhD finds one whatever the counts.

export async function HomeWindows({ data }: { data: HomeData }) {
  const t = await getTranslations({ locale: 'en' })
  const { types } = data
  return (
    <section className="home-windows page-frame" aria-labelledby="home-windows-title">
      <h2 id="home-windows-title" className="text-h2">
        {t('home.windows.title')}
      </h2>
      <ul role="list">
        {LIVE_WINDOWS.includes('jobs') && (
          <li className="home-window home-window-wide">
            <h3 className="text-h3">
              <a href={paths.window('jobs')}>{t('windows.jobs')}</a>
            </h3>
            <p>{t('home.windows.jobsText')}</p>
            {types.length > 0 && (
              <ul role="list" className="home-window-items">
                {types.map((type) => (
                  <li key={type.slug}>
                    <a href={jobsHref({ type: [type.slug] })}>
                      {t('home.windows.type', { label: type.label, count: type.jobs })}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p>
              <a href={paths.window('jobs')}>{t('home.windows.jobsAll')}</a>
            </p>
          </li>
        )}
      </ul>
    </section>
  )
}
