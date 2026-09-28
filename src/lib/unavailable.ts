import { NextResponse } from 'next/server'

import messages from '../../messages/en.json'

/**
 * The answer while the database cannot be reached: a temporary state, so `503` with Retry-After
 * rather than `500`, never kept by caches. For the proxy and the route handlers that read the
 * database (sitemaps, jobs feed).
 */
export function unavailableResponse(): NextResponse {
  return new NextResponse(messages.unavailable.text, {
    status: 503,
    headers: {
      'Cache-Control': 'private, no-store',
      'Retry-After': '120',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}
