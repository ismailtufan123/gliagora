import type { Metadata, Viewport } from 'next'
import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/routing'
import { SITE_ORIGIN, translationsOf } from '@/lib/site'

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

/**
 * Canonical link of a page and, where a reviewed translation exists (TRANSLATIONS in site.ts),
 * hreflang alternates with x-default pointing to the English version (PLAN §2.1).
 */
export function alternatesFor(path: string): Metadata['alternates'] {
  const translations = translationsOf(path)
  const locales = Object.entries(translations)
  if (locales.length < 2) return { canonical: path }
  return {
    canonical: path,
    languages: {
      ...Object.fromEntries(locales.map(([locale, href]) => [locale, `${SITE_ORIGIN}${href}`])),
      'x-default': `${SITE_ORIGIN}${translations.en ?? path}`,
    },
  }
}
