import { type NextRequest, NextResponse } from 'next/server'

import { GONE_PAGE, isGone } from '@/lib/gone'

// Runs before the pages under /en/ and /tr/ (Next.js "proxy", formerly middleware).
// Removed URLs get the removed-page with status 410 (PLAN §2.5); the removed-page itself is not
// a page of its own, so a direct request to it gets the 404 page.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
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
