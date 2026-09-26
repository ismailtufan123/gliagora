import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { NotFoundContent } from '@/components/NotFoundContent'
import { SiteShell } from '@/components/SiteShell'
import { defaultLocale } from '@/i18n/routing'

import { bodyFont, displayFont } from './(frontend)/fonts'
import './(frontend)/global.css'

// 404 for URLs outside every locale, e.g. /xyz/ (PLAN §2.5). Rendered without any layout, so it
// brings its own <html>, fonts and styles; it is always in English.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: defaultLocale })
  return { title: `${t('notFound.title')} – Gliagora | Neuroscience`, robots: { index: false } }
}

export default function GlobalNotFound() {
  return (
    <html lang={defaultLocale} className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>
        <SiteShell locale={defaultLocale}>
          <NotFoundContent locale={defaultLocale} />
        </SiteShell>
      </body>
    </html>
  )
}
