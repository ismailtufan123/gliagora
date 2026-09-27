import { siteLocale } from '@/i18n/routing'

// Pages whose URL names a database record: institutions (`/en/institutions/{slug}-{id}/`) and
// subfield hubs (`/en/subfields/{slug}/`). The proxy resolves them before rendering, because a
// page cannot answer 404 on the server by itself (Next.js 16.3 renders `notFound()` in a page only
// with JavaScript) and a permanent redirect must be sent before the page starts streaming.

/** ROR ID (9 characters, starts with 0) or the 5-character short ID of an institution added by hand. */
const INSTITUTION_SEGMENT = /^(?:([a-z0-9]+(?:-[a-z0-9]+)*)-)?(0[a-z0-9]{8}|[a-z0-9]{5})$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export type DetailRoute =
  | { kind: 'institution'; slug: string | null; id: string }
  | { kind: 'subfield'; slug: string }
  /** A URL under a detail route that cannot name any record. */
  | { kind: 'invalid' }

export const institutionPath = (slug: string, id: string) =>
  `/${siteLocale}/institutions/${slug}-${id}/`

export const subfieldPath = (slug: string) => `/${siteLocale}/subfields/${slug}/`

export const SUBFIELDS_PATH = `/${siteLocale}/subfields/`

/**
 * The detail route a path belongs to, or null for any other path. The trailing slash is optional
 * here: Next.js leaves it off segments that look like file names (`/en/subfields/wp-login.php`),
 * and those must get the 404 as well.
 */
export function matchDetailRoute(pathname: string): DetailRoute | null {
  const match = /^\/en\/(institutions|subfields)\/([^/]+)\/?$/.exec(pathname)
  if (!match) return null
  const [, section, segment = ''] = match
  if (section === 'subfields')
    return SLUG.test(segment) ? { kind: 'subfield', slug: segment } : { kind: 'invalid' }
  const parts = INSTITUTION_SEGMENT.exec(segment)
  if (!parts) return { kind: 'invalid' }
  return { kind: 'institution', slug: parts[1] ?? null, id: parts[2] as string }
}

/** Looks records up for `resolveDetailRoute`; the proxy implements it with Payload. */
export type DetailLookup = {
  /**
   * The current slug and URL ID of the institution with this ROR ID or short ID. The URL ID is
   * the ROR ID when there is one, so an institution added by hand that later got a ROR ID moves
   * to the ROR address.
   */
  institution: (id: string) => Promise<{ slug: string; id: string } | null>
  /** Whether the subfield exists and whether it is still active. */
  subfield: (slug: string) => Promise<{ isActive: boolean } | null>
}

export type Resolution =
  | { action: 'render' }
  | { action: 'notFound' }
  | { action: 'gone' }
  | { action: 'redirect'; to: string }

/**
 * What to answer for a detail route: render the page, 404 for an unknown record, 410 for a
 * subfield that was retired, or a permanent redirect to the canonical URL when the slug in the
 * URL is missing or out of date (the name changed, or a ROR ID was added; the ID in the URL
 * still finds the record).
 */
export async function resolveDetailRoute(
  route: DetailRoute,
  lookup: DetailLookup,
): Promise<Resolution> {
  if (route.kind === 'invalid') return { action: 'notFound' }
  if (route.kind === 'subfield') {
    const subfield = await lookup.subfield(route.slug)
    if (!subfield) return { action: 'notFound' }
    return subfield.isActive ? { action: 'render' } : { action: 'gone' }
  }
  const institution = await lookup.institution(route.id)
  if (!institution) return { action: 'notFound' }
  if (institution.slug !== route.slug || institution.id !== route.id) {
    return { action: 'redirect', to: institutionPath(institution.slug, institution.id) }
  }
  return { action: 'render' }
}
