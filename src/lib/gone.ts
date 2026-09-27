// URLs that were removed on purpose answer "410 Gone" instead of 404 (PLAN §2.5), so search
// engines drop them quickly. src/proxy.ts checks every request under /en/ and /tr/ against
// isGone() and shows the removed-page (GONE_PAGE) with status 410.
// M4 extends isGone() with listings that closed more than 30 days ago or were withdrawn.

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
