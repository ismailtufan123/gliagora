import { notFoundResponse, xmlResponse } from '@/lib/seo/responses'
import {
  parseSitemapFileName,
  sitemapFileEntries,
  sitemapXml,
  splitSitemap,
} from '@/lib/seo/sitemap'
import { sitemapSource } from '@/lib/seo/sitemap-data'
import { unavailableResponse } from '@/lib/unavailable'

// /sitemaps/{type}.xml (PLAN §2.2, §16.1): the pages of one type that are indexed, at their
// canonical addresses (src/lib/seo/sitemap-entries.ts). A file exists only while it lists a page:
// a type with none (`subfields.xml` until a hub has its introduction) answers 404, and so does
// a Turkish file (`pages-tr.xml`) until Turkish pages are indexed. `jobs-2.xml` and further files
// exist when a type has more than 50,000 pages; the file right after a type's last one repeats
// that file's last page, so a file listed by an index read shortly before still answers after
// jobs close (`sitemapFileEntries`). Names that are no sitemap file never get here: the proxy
// answers them with the 404 page.
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const key = parseSitemapFileName((await params).file)
  if (!key) return notFoundResponse()
  let files
  try {
    files = splitSitemap(key.type, await sitemapSource(new Date())[key.type]())
  } catch (error) {
    console.error('Sitemap failed:', error instanceof Error ? error.message : error)
    return unavailableResponse()
  }
  const entries = sitemapFileEntries(files, key)
  return entries ? xmlResponse(sitemapXml(entries)) : notFoundResponse()
}
