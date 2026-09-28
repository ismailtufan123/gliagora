import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { OrganizationJsonLd, WebSiteJsonLd } from '@/components/JsonLd'
import { CONTACT_EMAIL } from '@/lib/site'

// Coming-soon page (M0), until the home page of M6. English only (PLAN §12). Static HTML and CSS.
// The logo is in the header; the H1 is the tagline, as on the future home page (PLAN §9.1).
export const metadata: Metadata = { alternates: { canonical: '/en/' } }

export default async function ComingSoonPage() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en' })

  return (
    <main id="main" className="page-frame grid flex-1 content-center gap-8 py-16">
      <OrganizationJsonLd />
      <WebSiteJsonLd />
      {/* 9.3em is 14ch of Commissioner Bold: ch is the width of "0" in the font in use, so a width
          in ch re-wrapped the heading when the web font replaced its fallback. */}
      <h1 className="max-w-[9.3em] text-hero leading-[1.02]">{t('brand.tagline')}</h1>
      <div className="grid max-w-measure gap-4 text-card">
        <p>{t('home.comingSoon')}</p>
        <p>
          {t.rich('home.writeToUs', {
            email: (chunks) => <a href={`mailto:${CONTACT_EMAIL}`}>{chunks}</a>,
          })}
        </p>
      </div>
    </main>
  )
}
