// The M2 versions of the public pages live under /m2/ (src/app/(frontend)/m2/, D50): the proxy
// shows them in place of the public pages when the site's stage is `m2` (src/proxy.ts), and
// answers a direct request to /m2/… with the 404 page. No imports: the header's client components
// read it, and every byte they load counts (PLAN §17.3).

/** The folder of the M2 versions (twins) of the public pages. */
export const M2_PREFIX = '/m2'

/**
 * The address a visitor sees for a page: a twin's own path without `/m2`. Where a component
 * reads the path (`usePathname()`), the server renders a twin under its own path (`/m2/en/about/`)
 * and the browser under the address it asked for (`/en/about/`); both must give the same, or
 * React renders the page again.
 */
export function publicPathname(pathname: string): string {
  if (pathname === M2_PREFIX || pathname === `${M2_PREFIX}/`) return '/'
  return pathname.startsWith(`${M2_PREFIX}/`) ? pathname.slice(M2_PREFIX.length) : pathname
}
