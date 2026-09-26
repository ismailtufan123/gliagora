import type { ReactNode } from 'react'

import '@/app/(frontend)/global.css'
import { SiteShell } from '@/components/SiteShell'
import type { Locale } from '@/i18n/routing'

// The <html> and <body> of every public page and of the global 404 page. `fontVariables` comes from
// (frontend)/fonts.ts.
export function RootDocument({
  locale,
  fontVariables,
  children,
}: {
  locale: Locale
  fontVariables: string
  children: ReactNode
}) {
  return (
    <html lang={locale} className={fontVariables}>
      <body>
        <SiteShell locale={locale}>{children}</SiteShell>
      </body>
    </html>
  )
}
