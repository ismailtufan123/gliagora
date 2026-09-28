import { type NextRequest, NextResponse } from 'next/server'

import { type Resolution, matchDetailRoute, resolveDetailRoute } from '@/lib/detail-routes'
import { errorSummary } from '@/lib/errors'
import { canonicalListPath } from '@/lib/filters/canonical'
import { GONE_PAGE, isGone } from '@/lib/gone'
import { parseSitemapFileName } from '@/lib/seo/sitemap'
import { unavailableResponse } from '@/lib/unavailable'

// Answers about records depend on the database and the time, which change (the nightly ROR
// import adds institutions; a retired subfield can be reactivated; a withdrawn job can be published
// again), so they must not be kept by caches. This includes redirects: slugs follow names and
// titles, which can change back, and a stored A→B redirect would then meet a fresh B→A, a loop.
const NOT_STORED = { 'Cache-Control': 'private, no-store' }

// Redirects to the canonical address of a filtered list depend on the URL alone, so caches may
// keep them, as they keep the other permanent redirects. For a day only: should a later version
// write some filter differently, a stored redirect cannot point back and forth for long.
const LIST_REDIRECT_CACHE = 'public, max-age=86400'

// Runs before the pages under /en/ and /tr/ and the sitemap files (Next.js "proxy", formerly
// middleware). A name under /sitemaps/ that no sitemap file can have gets the 404 page, like any
// unknown URL; the sitemap route answers the names of files that do not exist now.
// Removed URLs get the removed-page with status 410 (PLAN §2.5); the removed-page itself is not
// a page of its own, so a direct request to it gets the 404 page. Pages that show a database
// record (institutions, subfield hubs, jobs) are checked here first, so an unknown record gets a
// real 404, an outdated URL a permanent redirect, and a withdrawn job or one that closed more than
// 30 days ago the removed-page with 410 (src/lib/detail-routes.ts). A list whose filters are
// written differently from the canonical form (src/lib/filters/canonical.ts), such as the
// repeated parameters of the filter form without JavaScript, gets a permanent redirect to it.
export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  if (pathname.startsWith('/sitemaps/')) {
    return parseSitemapFileName(pathname.slice('/sitemaps/'.length))
      ? NextResponse.next()
      : NextResponse.rewrite(new URL('/_not-found', request.url), {
          status: 404,
          headers: NOT_STORED,
        })
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    const canonical = canonicalListPath(pathname, searchParams)
    if (canonical) {
      const response = NextResponse.redirect(new URL(canonical, request.url), 308)
      response.headers.set('Cache-Control', LIST_REDIRECT_CACHE)
      return response
    }
  }
  const route = matchDetailRoute(pathname)
  if (route) {
    let resolution: Resolution
    try {
      const { detailLookup } = await import('@/lib/detail-lookup')
      resolution = await resolveDetailRoute(route, await detailLookup(), new Date())
    } catch (error) {
      // The database is unreachable: a temporary state, so say so rather than answer 500.
      console.error('Record lookup failed:', errorSummary(error))
      return unavailableResponse()
    }
    switch (resolution.action) {
      case 'notFound':
        return NextResponse.rewrite(new URL('/_not-found', request.url), {
          status: 404,
          headers: NOT_STORED,
        })
      case 'gone':
        return NextResponse.rewrite(new URL(GONE_PAGE, request.url), {
          status: 410,
          headers: NOT_STORED,
        })
      case 'redirect': {
        const target = new URL(resolution.to, request.url)
        target.search = request.nextUrl.search
        const response = NextResponse.redirect(target, 308)
        response.headers.set('Cache-Control', NOT_STORED['Cache-Control'])
        return response
      }
      case 'render':
        return NextResponse.next()
    }
  }
  if (isGone(pathname)) {
    return NextResponse.rewrite(new URL(GONE_PAGE, request.url), { status: 410 })
  }
  if (pathname === GONE_PAGE) {
    return NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/en/:path*', '/tr/:path*', '/sitemaps/:path*'],
}
