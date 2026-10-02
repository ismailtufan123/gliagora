import type { MetadataRoute } from 'next'

import { PUBLIC_ASSET_PREFIXES, indexedPublicPages, publicMachineFiles } from '@/lib/public-pages'
import { DISALLOW, exactlyAllowed } from '@/lib/seo/robots'
import { siteStage } from '@/lib/site-stage'
import { SITE_ORIGIN } from '@/lib/site'

// /robots.txt (PLAN §2.2, §16.1): everything public may be crawled except the admin, the API,
// search results, sign-in and the account pages, and addresses with a query string
// (src/lib/seo/robots.ts). Filtered lists are left out on purpose: the sitemaps list every page to
// index, and each page names its canonical address, so nothing is lost. No `Allow: /` line:
// crawlers that apply the first matching rule would read it as allowing everything.
// In the M2 state (D41, D50) everything is disallowed but the public pages that are indexed, the
// redirect of `/` to them, the sitemaps and the assets that render them (src/lib/public-pages.ts);
// Next.js writes the Allow lines first, for crawlers that apply the first matching rule. Read for
// each request, since the stage is a setting of the server (src/lib/site-stage.ts).
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  const sitemap = `${SITE_ORIGIN}/sitemap.xml`
  if (siteStage() === 'm2') {
    const files = publicMachineFiles().filter((file) => file !== '/robots.txt')
    const rules = exactlyAllowed(
      ['/', ...indexedPublicPages().map((page) => page.path), ...files],
      PUBLIC_ASSET_PREFIXES,
    )
    return {
      rules: [{ userAgent: '*', allow: [...rules.allow], disallow: [...rules.disallow] }],
      sitemap,
    }
  }
  return {
    rules: [{ userAgent: '*', disallow: [...DISALLOW] }],
    sitemap,
  }
}
