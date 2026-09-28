import type { MetadataRoute } from 'next'

import { DISALLOW } from '@/lib/seo/robots'
import { SITE_ORIGIN } from '@/lib/site'

// /robots.txt (PLAN §2.2, §16.1): everything public may be crawled except the admin, the API,
// search results and addresses with a query string (src/lib/seo/robots.ts). Filtered lists are
// left out on purpose: the sitemaps list every page to index, and each page names its canonical
// address, so nothing is lost. No `Allow: /` line: crawlers that apply the first matching rule
// would read it as allowing everything.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: [...DISALLOW] }],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  }
}
