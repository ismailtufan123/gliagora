import { setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { fontVariables } from '@/app/(frontend)/fonts'
import { RootDocument } from '@/components/RootDocument'
import type { Locale } from '@/i18n/routing'

// Root layout of one locale (src/app/(frontend)/{en,tr}/layout.tsx). Each locale is a static folder,
// not a dynamic [locale] segment, so unknown URLs match no route and get the server-rendered
// global 404 page (src/app/global-not-found.tsx).
export function LocaleRoot({ locale, children }: { locale: Locale; children: ReactNode }) {
  setRequestLocale(locale)
  return (
    <RootDocument locale={locale} fontVariables={fontVariables}>
      {children}
    </RootDocument>
  )
}
