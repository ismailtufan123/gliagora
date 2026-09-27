import type { MetadataRoute } from 'next'

import { CONTENT_PAGES } from '@/lib/content'
import { SITE_ORIGIN, translationsOf } from '@/lib/site'

// /sitemap.xml (PLAN §16): only pages meant to be indexed, so no placeholders and no draft
// texts. From M4, when listings arrive, this becomes a sitemap index with one file per type.
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: { path: string; lastModified?: string }[] = [
    { path: '/en/' },
    ...Object.values(CONTENT_PAGES)
      .filter((page) => !page.draft)
      .map((page) => ({ path: page.path, lastModified: page.updated })),
  ]
  return pages.map(({ path, lastModified }) => {
    const translations = Object.entries(translationsOf(path))
    return {
      url: `${SITE_ORIGIN}${path}`,
      ...(lastModified ? { lastModified } : {}),
      ...(translations.length > 1
        ? {
            alternates: {
              languages: Object.fromEntries(
                translations.map(([locale, href]) => [locale, `${SITE_ORIGIN}${href}`]),
              ),
            },
          }
        : {}),
    }
  })
}
