import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import type { Locale } from '@/i18n/routing'
import { paths } from '@/lib/site'

// Skip link, page content and footer, shared by every public page and the global 404 page.
export async function SiteShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = await getTranslations({ locale })
  return (
    <>
      <a className="skip-link" href="#main">
        {t('a11y.skipLink')}
      </a>
      {children}
      <footer className="border-t border-line text-caption text-text-muted">
        <div className="page-frame py-6">
          <a href={paths.contact(locale)}>{t('footer.contact')}</a>
        </div>
      </footer>
    </>
  )
}
