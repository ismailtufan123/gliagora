import { type NextRequest, NextResponse } from 'next/server'

import { type Resolution, matchDetailRoute, resolveDetailRoute } from '@/lib/detail-routes'
import { GONE_PAGE, isGone } from '@/lib/gone'

import messages from '../messages/en.json'

// Answers about records depend on the database, which changes (the nightly ROR import adds
// institutions; a retired subfield can be reactivated), so they must not be kept by caches.
const NOT_STORED = { 'Cache-Control': 'private, no-store' }
// Slugs follow names, which can change back; a day keeps browsers from holding an old redirect.
const REDIRECT_CACHE = { 'Cache-Control': 'public, max-age=86400' }

// Runs before the pages under /en/ and /tr/ (Next.js "proxy", formerly middleware).
// Removed URLs get the removed-page with status 410 (PLAN §2.5); the removed-page itself is not
// a page of its own, so a direct request to it gets the 404 page. Pages that show a database
// record (institutions, subfield hubs) are checked here first, so an unknown record gets a real
// 404 and an outdated URL a permanent redirect (src/lib/detail-routes.ts).
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const route = matchDetailRoute(pathname)
  if (route) {
    let resolution: Resolution
    try {
      const { detailLookup } = await import('@/lib/detail-lookup')
      resolution = await resolveDetailRoute(route, await detailLookup())
    } catch (error) {
      // The database is unreachable: a temporary state, so say so rather than answer 500.
      console.error('Record lookup failed:', error instanceof Error ? error.message : error)
      return new NextResponse(messages.unavailable.text, {
        status: 503,
        headers: {
          ...NOT_STORED,
          'Retry-After': '120',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      })
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
        response.headers.set('Cache-Control', REDIRECT_CACHE['Cache-Control'])
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
  matcher: ['/en/:path*', '/tr/:path*'],
}
