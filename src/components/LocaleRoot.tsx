import { setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { fontVariables } from '@/app/(frontend)/fonts'
import { RootDocument } from '@/components/RootDocument'
import type { Locale } from '@/i18n/routing'
import type { SiteStage } from '@/lib/site-stage'

// Root layout of one locale (src/app/(frontend)/{en,tr}/layout.tsx). Each locale is a static folder,
// not a dynamic [locale] segment, so unknown URLs match no route and get the server-rendered
// global 404 page (src/app/global-not-found.tsx). The M2 versions of the public pages have root
// layouts of their own (src/app/(frontend)/m2/{en,tr}/layout.tsx, `stage="m2"`, D50).
export function LocaleRoot({
  locale,
  stage,
  children,
}: {
  locale: Locale
  stage?: SiteStage
  children: ReactNode
}) {
  setRequestLocale(locale)
  return (
    <RootDocument locale={locale} fontVariables={fontVariables} stage={stage}>
      {children}
    </RootDocument>
  )
}
