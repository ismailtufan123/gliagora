import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { ReducedHeader } from '@/components/header/ReducedHeader'
import { SiteHeader } from '@/components/header/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import type { Locale } from '@/i18n/routing'
import type { SiteStage } from '@/lib/site-stage'

// Skip link, header, page content and footer, shared by every public page and the global 404 page.
// The M2 versions of the public pages (src/app/(frontend)/m2/, D50) have the reduced header and
// footer, which link only to public pages (D41 (4)).
export async function SiteShell({
  locale,
  stage = 'private',
  children,
}: {
  locale: Locale
  stage?: SiteStage
  children: ReactNode
}) {
  const t = await getTranslations({ locale })
  return (
    <>
      <a className="skip-link" href="#main">
        {t('a11y.skipLink')}
      </a>
      {stage === 'm2' ? <ReducedHeader locale={locale} /> : <SiteHeader locale={locale} />}
      {children}
      <SiteFooter locale={locale} stage={stage} />
    </>
  )
}
