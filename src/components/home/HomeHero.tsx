import { getTranslations } from 'next-intl/server'

import type { HomeData } from '@/lib/home'
import { LIVE_WINDOWS, paths } from '@/lib/site'

import { HeroStage } from './HeroStage'

// The hero (PLAN §9.1, §10): the tagline as the H1 (the largest paint, so LCP is text), the
// subline, "Find positions" and "Explore the map", and the static poster (L1) with the built
// windows as real links around the brain, each with its live count. Server-rendered and complete
// without JavaScript. The 3D layer (PLAN §10, L2; M13, D60) builds on it where the device allows
// (HeroStage).

export async function HomeHero({ data }: { data: HomeData | null }) {
  const t = await getTranslations({ locale: 'en' })
  const counts: Partial<Record<(typeof LIVE_WINDOWS)[number], string>> = data
    ? { jobs: t('jobs.list.open', { count: data.open }) }
    : {}
  return (
    <section className="home-hero" aria-labelledby="home-title">
      <div className="page-frame home-hero-grid">
        <div className="home-hero-text">
          <h1 id="home-title" className="text-hero">
            {t('brand.tagline')}
          </h1>
          <p className="home-subline">{t('home.subline')}</p>
          <p className="home-actions">
            <a className="button button-primary" href={paths.window('jobs')}>
              {t('home.findPositions')}
            </a>
            <a href={paths.section('map')}>{t('home.exploreMap')}</a>
          </p>
        </div>
        <HeroStage>
          <ul role="list" aria-label={t('home.windowsLabel')} className="home-poster-links">
            {LIVE_WINDOWS.map((key) => (
              <li key={key} data-window={key}>
                <a href={paths.window(key)}>
                  <span className="home-poster-name">{t(`windows.${key}`)}</span>
                  {counts[key] && (
                    <>
                      <span className="sr-only">,</span>{' '}
                      <span className="home-poster-count">{counts[key]}</span>
                    </>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </HeroStage>
      </div>
    </section>
  )
}
