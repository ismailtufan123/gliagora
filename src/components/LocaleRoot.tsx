import type { Metadata, Viewport } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { bodyFont, displayFont } from '@/app/(frontend)/fonts'
import '@/app/(frontend)/global.css'
import { SiteShell } from '@/components/SiteShell'
import type { Locale } from '@/i18n/routing'
import { SITE_ORIGIN } from '@/lib/site'

// Root layout of one locale (src/app/(frontend)/{en,tr}/layout.tsx). Each locale is a static folder,
// not a dynamic [locale] segment, so unknown URLs match no route and get the server-rendered
// global 404 page (src/app/global-not-found.tsx).

export async function localeMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'meta' })
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: { default: t('homeTitle'), template: t('titleTemplate', { title: '%s' }) },
    description: t('description'),
    icons: { icon: [{ url: '/brand/favicon.svg', type: 'image/svg+xml' }] },
  }
}

export const localeViewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#EEF0F4' },
    { media: '(prefers-color-scheme: dark)', color: '#161942' },
  ],
}

export function LocaleRoot({ locale, children }: { locale: Locale; children: ReactNode }) {
  setRequestLocale(locale)
  return (
    <html lang={locale} className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>
        <SiteShell locale={locale}>{children}</SiteShell>
      </body>
    </html>
  )
}
