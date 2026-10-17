// Addresses of original postings (PLAN §3.2, §6.3). Listings link to the employer's own page; the
// canonical form of that address finds the same posting entered twice.

// Characters the URL parser drops or rewrites without complaint: whitespace (also tabs and line
// breaks inside an address), backslashes (read as "/"), control characters, and the invisible
// characters that reorder text. An address with any of them would be stored as typed but lead
// somewhere else than it reads, or break the database (PostgreSQL text cannot hold NUL).
const REWRITTEN_BY_PARSER = /[\s\\\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/

/** Whether an address has characters that the URL parser would silently drop or change. */
export function hasRewrittenCharacters(value: string): boolean {
  return REWRITTEN_BY_PARSER.test(value)
}

/**
 * A full http or https address with a host, e.g. https://www.example.org/jobs/123, exactly as the
 * browser will read it (nothing the parser would drop or change).
 */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value === '' || hasRewrittenCharacters(value)) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname !== ''
  } catch {
    return false
  }
}

/** The longest address stored, as typed and in its canonical form (which is indexed). */
export const MAX_URL_LENGTH = 2000

/**
 * Why an address cannot be stored as the address of a posting, or null. The canonical form is
 * checked too, because percent-encoding can make it much longer than the address as typed (a
 * character outside ASCII takes up to 12). The length as typed is the field's `maxLength`.
 */
export function addressProblem(value: string): string | null {
  if (!isHttpUrl(value)) return 'Enter a full address, e.g. https://www.example.org/jobs/123.'
  if ((canonicalUrl(value)?.length ?? 0) > MAX_URL_LENGTH) return 'This address is too long.'
  return null
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

/** A query parameter's name as the server reads it (`utm%5Fsource` is `utm_source`). */
function parameterName(pair: string): string {
  const name = pair.split('=', 1)[0] ?? ''
  try {
    return decodeURIComponent(name.replace(/\+/g, ' '))
  } catch {
    return name
  }
}

/**
 * A posting's address as Glia Notes links to it (PLAN §13: direct links to employers, without
 * tracking parameters): the address exactly as entered, with only the tracking parameters (those
 * `canonicalUrl` removes) taken out of its query; every other part, the other parameters'
 * spelling and order and the fragment included, stays byte for byte, since some application
 * systems read their addresses literally. An address that is not http(s) is returned unchanged
 * (a published job always has one that is).
 */
export function withoutTracking(value: string): string {
  if (!isHttpUrl(value)) return value
  const hashAt = value.indexOf('#')
  const beforeHash = hashAt === -1 ? value : value.slice(0, hashAt)
  const hash = hashAt === -1 ? '' : value.slice(hashAt)
  const queryAt = beforeHash.indexOf('?')
  if (queryAt === -1) return value
  const pairs = beforeHash.slice(queryAt + 1).split('&')
  const kept = pairs.filter((pair) => pair === '' || !isTracking(parameterName(pair)))
  if (kept.length === pairs.length) return value
  const query = kept.filter((pair) => pair !== '').join('&')
  return `${beforeHash.slice(0, queryAt)}${query ? `?${query}` : ''}${hash}`
}
