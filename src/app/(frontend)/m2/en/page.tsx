import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { HeroStage } from '@/components/home/HeroStage'
import { OrganizationJsonLd, WebSiteJsonLd } from '@/components/JsonLd'
import { m2SignupLink } from '@/lib/m2-links'
import { CONTACT_EMAIL } from '@/lib/site'

// The coming-soon page (M0's, D41): /en/ in the M2 state (src/lib/public-pages.ts, D50), in place
// of the home page, which stays private with the positions it shows (D39). English only (PLAN §12).
// Static HTML and CSS, with nothing from the database. The logo is in the header; the H1 is the
// tagline, as on the home page (PLAN §9.1). Glia Notes, while its signup is public (with the açık
// rıza metni, m2SignupLink), and the address to write to. Beside them, the home page's hero
// picture (M13, D60): the poster, and the 3D brain where the device allows, without the windows'
// links, which lead to private pages; its point file is among the M2 state's public files.
// The tagline as the H1 stays the largest paint.
export const metadata: Metadata = { alternates: { canonical: '/en/' } }

export default async function ComingSoonPage() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en' })
  const signup = m2SignupLink()

  return (
    <main id="main" className="grid flex-1 content-center">
      <OrganizationJsonLd />
      <WebSiteJsonLd />
      <section className="home-hero" aria-labelledby="coming-soon-title">
        <div className="page-frame home-hero-grid">
          <div className="home-hero-text grid gap-8">
            {/* 9.3em is 14ch of Commissioner Bold: ch is the width of "0" in the font in use, so a
                width in ch re-wrapped the heading when the web font replaced its fallback. */}
            <h1 id="coming-soon-title" className="max-w-[9.3em] text-hero leading-[1.02]">
              {t('brand.tagline')}
            </h1>
            <div className="grid max-w-measure gap-4 text-card">
              <p>{t('home.comingSoon')}</p>
              {signup && (
                <>
                  <p>{t('home.digest.short')}</p>
                  <p>
                    <a className="button button-primary" href={signup}>
                      {t('home.digest.button')}
                    </a>
                  </p>
                </>
              )}
              <p>
                {t.rich('home.writeToUs', {
                  email: (chunks) => <a href={`mailto:${CONTACT_EMAIL}`}>{chunks}</a>,
                })}
              </p>
            </div>
          </div>
          <HeroStage />
        </div>
      </section>
    </main>
  )
}
