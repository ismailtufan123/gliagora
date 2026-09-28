import { errorSummary } from '@/lib/errors'
import { xmlResponse } from '@/lib/seo/responses'
import { SITEMAP_TYPES, sitemapIndexXml, splitSitemap } from '@/lib/seo/sitemap'
import { sitemapSource } from '@/lib/seo/sitemap-data'
import { unavailableResponse } from '@/lib/unavailable'

// /sitemap.xml (PLAN §2.2, §16.1): the index of the sitemap files under /sitemaps/ that list at
// least one page. Read from the database at request time (the build has none); crawlers may
// keep it for an hour. A route handler rather than Next.js's sitemap convention, which cannot
// write an index with these addresses.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const source = sitemapSource(new Date())
    const files = await Promise.all(
      SITEMAP_TYPES.map(async (type) => splitSitemap(type, await source[type]())),
    )
    return xmlResponse(sitemapIndexXml(files.flat()))
  } catch (error) {
    console.error('Sitemap index failed:', errorSummary(error))
    return unavailableResponse()
  }
}
