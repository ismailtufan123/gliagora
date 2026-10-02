import type { ReactNode } from 'react'

import '@/app/(frontend)/global.css'
import { SiteShell } from '@/components/SiteShell'
import type { Locale } from '@/i18n/routing'
import type { SiteStage } from '@/lib/site-stage'

// The <html> and <body> of every public page and of the global 404 page. `fontVariables` comes from
// (frontend)/fonts.ts. `stage`: the M2 versions of the public pages have the reduced shell.
export function RootDocument({
  locale,
  fontVariables,
  stage,
  children,
}: {
  locale: Locale
  fontVariables: string
  stage?: SiteStage
  children: ReactNode
}) {
  return (
    <html lang={locale} className={fontVariables}>
      <body>
        <SiteShell locale={locale} stage={stage}>
          {children}
        </SiteShell>
      </body>
    </html>
  )
}
