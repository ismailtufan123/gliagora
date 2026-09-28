import { siteLocale } from '@/i18n/routing'
import { type ListingDates, listingState } from '@/lib/jobs/deadline'
import { SHORT_ID_CHAR } from '@/lib/short-id'

// Pages whose URL names a database record: institutions (`/en/institutions/{slug}-{id}/`),
// subfield hubs (`/en/subfields/{slug}/`) and jobs (`/en/jobs/{slug}-{shortId}/`). The proxy
// resolves them before rendering, because a page cannot answer 404 on the server by itself
// (Next.js 16.3 renders `notFound()` in a page only with JavaScript) and a permanent redirect or a
// 410 must be sent before the page starts streaming.

/** ROR ID (9 characters, starts with 0) or the 5-character short ID of an institution added by hand. */
const INSTITUTION_SEGMENT = /^(?:([a-z0-9]+(?:-[a-z0-9]+)*)-)?(0[a-z0-9]{8}|[a-z0-9]{5})$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** A job's slug (optional in the URL) and its short ID (PLAN §2.1). */
const JOB_SEGMENT = new RegExp(`^(?:([a-z0-9]+(?:-[a-z0-9]+)*)-)?(${SHORT_ID_CHAR}{5})$`)

/**
 * Names under /en/jobs/ that belong to a route of their own rather than to a job; the proxy lets
 * them through untouched: the jobs feed (`feed.xml`, src/lib/seo/feed.ts). A name not listed here
 * answers 404 like every other segment that cannot be a job URL.
 */
export const JOBS_RESERVED_SEGMENTS: ReadonlySet<string> = new Set<string>(['feed.xml'])

export type DetailRoute =
  | { kind: 'institution'; slug: string | null; id: string }
  | { kind: 'subfield'; slug: string }
  | { kind: 'job'; slug: string | null; shortId: string }
  /** A URL under a detail route that cannot name any record. */
  | { kind: 'invalid' }

export const institutionPath = (slug: string, id: string) =>
  `/${siteLocale}/institutions/${slug}-${id}/`

export const subfieldPath = (slug: string) => `/${siteLocale}/subfields/${slug}/`

export const jobPath = (slug: string, shortId: string) => `/${siteLocale}/jobs/${slug}-${shortId}/`

export const SUBFIELDS_PATH = `/${siteLocale}/subfields/`

/**
 * The detail route a path belongs to, or null for any other path. The trailing slash is optional
 * here: Next.js leaves it off segments that look like file names (`/en/subfields/wp-login.php`),
 * and those must get the 404 as well.
 */
export function matchDetailRoute(pathname: string): DetailRoute | null {
  const match = /^\/en\/(institutions|subfields|jobs)\/([^/]+)\/?$/.exec(pathname)
  if (!match) return null
  const [, section, segment = ''] = match
  if (section === 'subfields')
    return SLUG.test(segment) ? { kind: 'subfield', slug: segment } : { kind: 'invalid' }
  if (section === 'jobs') {
    if (JOBS_RESERVED_SEGMENTS.has(segment)) return null
    const parts = JOB_SEGMENT.exec(segment)
    if (!parts) return { kind: 'invalid' }
    return { kind: 'job', slug: parts[1] ?? null, shortId: parts[2] as string }
  }
  const parts = INSTITUTION_SEGMENT.exec(segment)
  if (!parts) return { kind: 'invalid' }
  return { kind: 'institution', slug: parts[1] ?? null, id: parts[2] as string }
}

/** What the resolver needs to know about a job: its address and what decides its state. */
export type JobRecord = ListingDates & { slug: string; shortId: string }

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
  /** The job with this short ID, in any status. */
  job: (shortId: string) => Promise<JobRecord | null>
  /**
   * Whether a job with this short ID was retired: deleted 12 months after it went offline, with
   * only its address and ID kept (D34, `retired-listings`). Asked only when no job has the ID.
   */
  retiredJob: (shortId: string) => Promise<boolean>
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
 *
 * Jobs (PLAN §2.5): drafts and jobs in review were never public, so they are unknown (404); a
 * withdrawn job, and a closed one from 30 days after it closed, are gone (410) whatever the slug,
 * also once the job has been retired (only its address and ID kept, D34); a closed job before
 * then renders with the closed notice. `now` is the moment of the request.
 */
export async function resolveDetailRoute(
  route: DetailRoute,
  lookup: DetailLookup,
  now: Date = new Date(),
): Promise<Resolution> {
  if (route.kind === 'invalid') return { action: 'notFound' }
  if (route.kind === 'subfield') {
    const subfield = await lookup.subfield(route.slug)
    if (!subfield) return { action: 'notFound' }
    return subfield.isActive ? { action: 'render' } : { action: 'gone' }
  }
  if (route.kind === 'job') {
    const job = await lookup.job(route.shortId)
    if (!job) {
      return (await lookup.retiredJob(route.shortId)) ? { action: 'gone' } : { action: 'notFound' }
    }
    const state = listingState(job, now)
    if (state === 'hidden') return { action: 'notFound' }
    if (state === 'gone') return { action: 'gone' }
    if (job.slug !== route.slug) return { action: 'redirect', to: jobPath(job.slug, job.shortId) }
    return { action: 'render' }
  }
  const institution = await lookup.institution(route.id)
  if (!institution) return { action: 'notFound' }
  if (institution.slug !== route.slug || institution.id !== route.id) {
    return { action: 'redirect', to: institutionPath(institution.slug, institution.id) }
  }
  return { action: 'render' }
}
