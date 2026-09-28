import { JOB_FILTERS, invalidDeadlineRange, parseJobFilters } from '@/lib/filters/jobs'
import { isUnfiltered } from '@/lib/filters/model'
import type { ListingState } from '@/lib/jobs/deadline'

// Which pages search engines may index (PLAN §2.2, §2.5, §16.1). Each page's robots metadata and
// its entry in the sitemaps (src/lib/seo/sitemap-data.ts) come from the same function here, so
// the two cannot disagree: a page is listed exactly when it is indexed.

/** A long-form page from content/ (About, legal texts): indexed once it is no longer a draft (D28). */
export const contentPageIndexed = (page: { draft: boolean }) => !page.draft

/**
 * The jobs list: only its unfiltered first page. Filtered and later pages point to it as their
 * canonical page (PLAN §2.1, §16.1), and so does a range of days the form shows again with an
 * error.
 */
export const jobsListIndexed = (query: URLSearchParams) =>
  isUnfiltered(JOB_FILTERS, parseJobFilters(query)) && !invalidDeadlineRange(query)

/** A job: while it is open; closed jobs are `noindex` until they answer 410 (PLAN §2.5). */
export const jobIndexed = (state: ListingState) => state === 'open'

/**
 * An institution: while it has at least one open position (PLAN §2.5; upcoming events count too
 * from M8). Without one it answers 200 with `noindex`.
 */
export const institutionIndexed = (openJobs: number) => openJobs > 0

/**
 * A subfield hub: once it has its human-written introduction (PLAN §2.2, §16.3). Until then the
 * hub is a skeleton of lists and stays `noindex`.
 */
export const hubIndexed = (subfield: { hubIntro?: string | null }) =>
  Boolean(subfield.hubIntro?.trim())

/** The subfield index: once at least one of its hubs is indexed. */
export const subfieldIndexIndexed = (subfields: readonly { hubIntro?: string | null }[]) =>
  subfields.some(hubIndexed)
