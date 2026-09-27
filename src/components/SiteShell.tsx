import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { SiteHeader } from '@/components/header/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import type { Locale } from '@/i18n/routing'

// Skip link, header, page content and footer, shared by every public page and the global 404 page.
export async function SiteShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = await getTranslations({ locale })
  return (
    <>
      <a className="skip-link" href="#main">
        {t('a11y.skipLink')}
      </a>
      <SiteHeader locale={locale} />
      {children}
      <SiteFooter locale={locale} />
    </>
  )
}
