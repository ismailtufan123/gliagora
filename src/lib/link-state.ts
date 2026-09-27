// Whether a navigation link leads to the current page (aria-current="page") or to the section
// the current page is in (styling only). Used by NavLink.

const withoutSlash = (path: string) => path.replace(/\/+$/, '')

export type LinkState = 'page' | 'section' | undefined

/**
 * A link is the current page when its path and query string both match the address, e.g. "PhD"
 * (/en/jobs/?type=phd) on /en/jobs/?type=phd. A link without a query string to the same path
 * with another query, or to a parent path, marks the current section.
 */
export function linkState(pathname: string, search: string, href: string): LinkState {
  const [path = '', query = ''] = href.split('?')
  const here = withoutSlash(pathname)
  const target = withoutSlash(path)
  if (here === target && (query ? `?${query}` : '') === search) return 'page'
  if (!query && (here === target || here.startsWith(`${target}/`))) return 'section'
  return undefined
}
