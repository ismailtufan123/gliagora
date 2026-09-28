import type { MetadataRoute } from 'next'

import { CONTENT_PAGES } from '@/lib/content'
import { alternatesFor } from '@/lib/metadata'
import { SITE_ORIGIN, paths } from '@/lib/site'

// /sitemap.xml (PLAN §16): only pages meant to be indexed, so no placeholders and no draft
// texts; hreflang alternates as on the pages themselves (alternatesFor). From M4, when listings
// arrive, this becomes a sitemap index with one file per type.
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: { path: string; lastModified?: string }[] = [
    { path: '/en/' },
    { path: paths.section('suggest') },
    ...Object.values(CONTENT_PAGES)
      .filter((page) => !page.draft)
      .map((page) => ({ path: page.path, lastModified: page.updated })),
  ]
  return pages.map(({ path, lastModified }) => {
    const languages = alternatesFor(path)?.languages
    return {
      url: `${SITE_ORIGIN}${path}`,
      ...(lastModified ? { lastModified } : {}),
      ...(languages ? { alternates: { languages: languages as Record<string, string> } } : {}),
    }
  })
}
