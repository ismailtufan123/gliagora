// URLs that were removed on purpose answer "410 Gone" instead of 404 (PLAN §2.5), so search
// engines drop them quickly. src/proxy.ts checks every request under /en/ and /tr/ against
// isGone() and shows the removed-page (GONE_PAGE) with status 410.
// This list is for fixed paths only. Listings that were withdrawn or closed more than 30 days ago
// are answered from the database by the detail-route resolver (src/lib/detail-routes.ts), which
// shows the same removed-page with 410.

/** The page shown for removed URLs. Requested directly, it is a 404. */
export const GONE_PAGE = '/en/gone/'

/** Removed URLs, with a trailing slash. */
const GONE_PATHS: ReadonlySet<string> = new Set([
  // Never existed; kept so the end-to-end tests can check the 410 response (tests/e2e/http.spec.ts).
  '/en/gone-example/',
])

export function isGone(pathname: string): boolean {
  return GONE_PATHS.has(pathname.endsWith('/') ? pathname : `${pathname}/`)
}
