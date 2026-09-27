import type { Metadata, Viewport } from 'next'
import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/routing'
import { CONTENT_PAGES } from '@/lib/content'
import { SITE_ORIGIN, translationsOf } from '@/lib/site'

// Metadata shared by every public page: the locale layouts and the global 404 page.

export async function localeMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'meta' })
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: { default: t('homeTitle'), template: t('titleTemplate', { title: '%s' }) },
    description: t('description'),
    icons: { icon: [{ url: '/brand/favicon.svg', type: 'image/svg+xml' }] },
    // PLAN §1: og:site_name keeps the descriptor.
    openGraph: {
      siteName: t('siteName'),
      type: 'website',
      locale: locale === 'tr' ? 'tr_TR' : 'en',
    },
  }
}

export const localeViewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#EEF0F4' },
    { media: '(prefers-color-scheme: dark)', color: '#161942' },
  ],
}

const DRAFTS = new Set<string>(
  Object.values(CONTENT_PAGES)
    .filter((page) => page.draft)
    .map((page) => page.path),
)
const isDraftPage = (path: string) => DRAFTS.has(path)

/**
 * The reviewed translations of a page (TRANSLATIONS in site.ts), keeping only published pages:
 * a draft is not indexed, so it neither gets nor receives hreflang links.
 */
export function publishedTranslationsOf(
  path: string,
  isDraft: (path: string) => boolean = isDraftPage,
): Partial<Record<Locale, string>> {
  if (isDraft(path)) return {}
  return Object.fromEntries(
    Object.entries(translationsOf(path)).filter(([, href]) => href && !isDraft(href)),
  )
}

/**
 * Canonical link of a page and, where a published translation exists, hreflang alternates with
 * x-default pointing to the English version (PLAN §2.1). Used by the pages and the sitemap.
 */
export function alternatesFor(
  path: string,
  isDraft?: (path: string) => boolean,
): Metadata['alternates'] {
  const translations = publishedTranslationsOf(path, isDraft)
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
