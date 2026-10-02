import { CONTENT_PAGES } from '@/lib/content'
import { SUBFIELDS_PATH, institutionPath, jobPath, subfieldPath } from '@/lib/detail-routes'
import { JOB_FILTERS } from '@/lib/filters/jobs'
import {
  contentPageIndexed,
  hubIndexed,
  institutionIndexed,
  jobIndexed,
  jobsListIndexed,
  mapPageIndexed,
  subfieldIndexIndexed,
} from '@/lib/indexing'
import { type ListingDates, isOpen, listingState } from '@/lib/jobs/deadline'
import { alternatesFor } from '@/lib/metadata'
import { type PublicPage, indexedPublicPages } from '@/lib/public-pages'
import { paths } from '@/lib/site'

import type { SitemapEntry } from './sitemap'
import type { DateValue } from './xml'

// What each sitemap lists (PLAN §2.2, §2.5, §16.1): exactly the pages that are indexed, at their
// canonical addresses. Whether a page is indexed comes from the same functions its robots
// metadata uses (src/lib/indexing.ts), so a page is listed exactly when it has no `noindex`.
// Pure: src/lib/seo/sitemap-data.ts reads the records from the database.

/** A relationship read at depth 0 (an ID), or populated. */
type Ref = number | { id: number } | null | undefined

const refId = (ref: Ref): number | null =>
  typeof ref === 'number' ? ref : typeof ref === 'object' && ref ? ref.id : null

/** A job as the sitemaps read it: its address, what decides its state, and its relations. */
export type SitemapJob = ListingDates & {
  slug?: string | null
  shortId?: string | null
  updatedAt: string
  institution?: Ref
  subfields?: Ref[] | null
}

export type SitemapInstitution = {
  id: number
  slug: string
  rorId?: string | null
  shortId?: string | null
}

export type SitemapSubfield = {
  slug: string
  hubIntro?: string | null
}

/** An entry with the hreflang alternates its page has (only real, published translations). */
function entry(path: string, lastmod?: DateValue | null): SitemapEntry {
  const languages = alternatesFor(path)?.languages
  return {
    path,
    ...(lastmod ? { lastmod } : {}),
    ...(languages ? { alternates: languages as Record<string, string> } : {}),
  }
}

/**
 * Pages that are not records: the home page, the content pages that are no longer drafts (D28),
 * the unfiltered jobs list and, once one of its hubs is indexed, the subfield index. `lastmod`
 * only where the date of the last change is known: the content pages record it; the home page
 * and the lists change with the listings and have none.
 */
export function pageEntries(subfields: readonly SitemapSubfield[]): SitemapEntry[] {
  return [
    entry(paths.home()),
    ...(jobsListIndexed(new URLSearchParams()) ? [entry(JOB_FILTERS.path)] : []),
    ...(mapPageIndexed() ? [entry(paths.section('map'))] : []),
    // "Suggest a listing" is indexed (PLAN §2.2); its confirmation page is not.
    entry(paths.section('suggest')),
    ...(subfieldIndexIndexed(subfields) ? [entry(SUBFIELDS_PATH)] : []),
    ...Object.values(CONTENT_PAGES)
      .filter(contentPageIndexed)
      .map((page) => entry(page.path, page.updated)),
  ]
}

/**
 * The pages sitemap of the M2 state (D41, D50): its public pages that are indexed
 * (src/lib/public-pages.ts), in that list's order; a text from content/ with the date of its last
 * change, as above.
 */
export function m2PageEntries(pages: readonly PublicPage[] = indexedPublicPages()): SitemapEntry[] {
  const updated = new Map<string, string>(
    Object.values(CONTENT_PAGES).map((page) => [page.path, page.updated]),
  )
  return pages.map((page) => entry(page.path, updated.get(page.path)))
}

/** Open jobs, at their canonical addresses, last changed when the job was last saved. */
export function jobEntries(jobs: readonly SitemapJob[], now: Date): SitemapEntry[] {
  return jobs.flatMap((job) =>
    job.slug && job.shortId && jobIndexed(listingState(job, now))
      ? [entry(jobPath(job.slug, job.shortId), job.updatedAt)]
      : [],
  )
}

/** Per record (an institution): how many open jobs it has. */
export type OpenJobs = Map<number, number>

/** Counts the open jobs of each record that `refs` names for a job. */
export function openJobsPer(
  jobs: readonly SitemapJob[],
  now: Date,
  refs: (job: SitemapJob) => readonly Ref[],
): OpenJobs {
  const per: OpenJobs = new Map()
  for (const job of jobs) {
    if (!isOpen(job, now)) continue
    for (const id of new Set(refs(job).map(refId))) {
      if (id !== null) per.set(id, (per.get(id) ?? 0) + 1)
    }
  }
  return per
}

/**
 * Institutions with open positions (PLAN §2.5). No `lastmod`: the page lists its open positions
 * with the days left, so, like the jobs list, it changes as deadlines pass, and the date of the
 * last save would move back in time when the job saved last closes.
 */
export function institutionEntries(
  institutions: readonly SitemapInstitution[],
  openJobs: OpenJobs,
): SitemapEntry[] {
  return institutions.flatMap((institution) => {
    const urlId = institution.rorId ?? institution.shortId
    if (!urlId || !institutionIndexed(openJobs.get(institution.id) ?? 0)) return []
    return [entry(institutionPath(institution.slug, urlId))]
  })
}

/**
 * Subfield hubs that are indexed (their written introductions have at least 150 words, PLAN §16.3,
 * D40). No `lastmod`, for the same reason as institutions: a hub lists the open jobs of its
 * subfield.
 */
export function subfieldEntries(subfields: readonly SitemapSubfield[]): SitemapEntry[] {
  return subfields.flatMap((subfield) =>
    hubIndexed(subfield) ? [entry(subfieldPath(subfield.slug))] : [],
  )
}
