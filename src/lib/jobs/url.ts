// Addresses of original postings (PLAN §3.2, §6.3). Listings link to the employer's own page; the
// canonical form of that address finds the same posting entered twice.

/** A full http or https address with a host, e.g. https://www.example.org/jobs/123. */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() !== value || value === '') return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname !== ''
  } catch {
    return false
  }
}

/** Query parameters that only track where a visitor came from. */
const TRACKING = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'gad_source',
  'srsltid',
  '_gl',
  '_ga',
  'msclkid',
  'yclid',
  'mc_cid',
  'mc_eid',
  'mkt_tok',
  '_hsenc',
  '_hsmi',
  'igshid',
  'ref_src',
])

const isTracking = (name: string) => {
  const lower = name.toLowerCase()
  return lower.startsWith('utm_') || lower.startsWith('hsa_') || TRACKING.has(lower)
}

/**
 * The canonical form of a posting's address, for finding duplicates (PLAN §6.3): always https,
 * so http and https copies of one posting match; host in lower case (and in punycode), no default
 * port, no fragment, no sign-in details, no tracking parameters, the other parameters sorted by
 * name, percent-escapes in upper case, and no trailing slash, so `/a` and `/a/` match. The path
 * keeps its case, because servers may treat `/Job` and `/job` as different pages. Only a
 * comparison key: the original address is kept as entered. Null for anything that is not an
 * http(s) address.
 */
export function canonicalUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!isHttpUrl(trimmed)) return null
  const url = new URL(trimmed)
  // The default port of either scheme was already dropped when the address was read.
  url.protocol = 'https:'
  url.hash = ''
  url.username = ''
  url.password = ''
  const params = new URLSearchParams([...url.searchParams].filter(([name]) => !isTracking(name)))
  params.sort()
  url.search = params.toString()
  url.pathname =
    url.pathname.replace(/\/+$/, '').replace(/%[0-9a-f]{2}/gi, (escape) => escape.toUpperCase()) ||
    '/'
  return url.href
}
