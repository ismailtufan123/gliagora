import { jobPath } from '@/lib/detail-routes'
import { type ListingDates, listingState } from '@/lib/jobs/deadline'
import { SHORT_ID_CHAR } from '@/lib/short-id'

// The item a report is about (PLAN §7.5: "prefilled item reference"). Every "Report a problem"
// link names its item in the form's address, `/en/report/?item=job:{shortId}`; events (M8) and
// the other windows add their own types. The form shows the item only when it is a public one
// (an open or closed job, not a draft and not a job whose page answers 410), and stores the link
// to it; any other value is ignored, and the form works as a general report.

/** The form's address. */
export const REPORT_PATH = '/en/report/'

/** The query parameter, and the form's hidden input, that name the item. */
export const ITEM_PARAM = 'item'

export type ItemRef = { type: 'job'; shortId: string }

const ITEM_REF = new RegExp(`^job:(${SHORT_ID_CHAR}{5})$`)

/**
 * The item named by a query parameter or form field, or null for anything else: a missing,
 * repeated or malformed value, or a type that has no reports yet.
 */
export function parseItemRef(value: unknown): ItemRef | null {
  if (typeof value !== 'string') return null
  const match = ITEM_REF.exec(value)
  return match ? { type: 'job', shortId: match[1] as string } : null
}

export const itemRefText = (ref: ItemRef) => `${ref.type}:${ref.shortId}`

/** The "Report a problem" link of an item. */
export const reportHref = (ref: ItemRef) => `${REPORT_PATH}?${ITEM_PARAM}=${itemRefText(ref)}`

/** What the form needs of a job to show it and link the report to it. */
export type ReportableJob = ListingDates & {
  id: number
  title: string
  slug?: string | null
  shortId?: string | null
  originalLanguage?: string | null
}

/** A public item a report can be about: shown on the form, and stored with the report. */
export type ReportItem = {
  ref: string
  jobId: number
  title: string
  path: string
  /** The title's language, when it is not English. */
  lang?: string
}

/**
 * The item a report can name, or null: a job whose page shows it (open, or closed within the
 * last 30 days). Drafts and jobs in review were never public, so their titles are not shown; a
 * withdrawn job, or one closed longer, answers 410.
 */
export function reportItem(job: ReportableJob | null, now: Date): ReportItem | null {
  if (!job?.slug || !job.shortId) return null
  const state = listingState(job, now)
  if (state !== 'open' && state !== 'closed') return null
  return {
    ref: itemRefText({ type: 'job', shortId: job.shortId }),
    jobId: job.id,
    title: job.title,
    path: jobPath(job.slug, job.shortId),
    ...(job.originalLanguage && job.originalLanguage !== 'en'
      ? { lang: job.originalLanguage }
      : {}),
  }
}
