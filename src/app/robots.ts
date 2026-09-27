import type { MetadataRoute } from 'next'

import { SITE_ORIGIN } from '@/lib/site'

// /robots.txt (PLAN §2.2, §16): everything public may be crawled except the admin and the API.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: ['/admin', '/api'] }],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  }
}
