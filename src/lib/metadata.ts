import type { Metadata, Viewport } from 'next'
import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/routing'
import { SITE_ORIGIN } from '@/lib/site'

// Metadata shared by every public page: the locale layouts and the global 404 page.

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
