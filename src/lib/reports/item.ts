import { institutionPath, jobPath } from '@/lib/detail-routes'
import { type ListingDates, listingState } from '@/lib/jobs/deadline'
import { SHORT_ID_CHAR } from '@/lib/short-id'

// The item a report is about (PLAN §7.5: "prefilled item reference"). Every "Report a problem"
// link names its item in the form's address: `/en/report/?item=job:{shortId}` on a job page,
// `/en/report/?item=institution:{id}` on an institution page (the ID at the end of its address:
// the ROR ID, or the short ID of an institution added by hand; D40); events (M8) and the other
// windows add their own types. The form shows the item only when it is a public one (an open or
// closed job, not a draft and not a job whose page answers 410; an institution that exists), and
// stores the link to it; any other value is ignored, and the form works as a general report.

/** The form's address. */
export const REPORT_PATH = '/en/report/'

/** The query parameter, and the form's hidden input, that name the item. */
export const ITEM_PARAM = 'item'

/** What a report can be about. */
export type ItemType = 'job' | 'institution'

export type ItemRef = { type: 'job'; shortId: string } | { type: 'institution'; id: string }

/** A ROR ID in its short form ("0", six characters of the short IDs' alphabet, two digits). */
const ROR_ID = `0${SHORT_ID_CHAR}{6}[0-9]{2}`
const ITEM_REF = new RegExp(
  `^(?:job:(${SHORT_ID_CHAR}{5})|institution:(${ROR_ID}|${SHORT_ID_CHAR}{5}))$`,
)

/**
 * The item named by a query parameter or form field, or null for anything else: a missing,
 * repeated or malformed value, or a type that has no reports yet.
 */
export function parseItemRef(value: unknown): ItemRef | null {
  if (typeof value !== 'string') return null
  const match = ITEM_REF.exec(value)
  if (!match) return null
  return match[1]
    ? { type: 'job', shortId: match[1] }
    : { type: 'institution', id: match[2] as string }
}

export const itemRefText = (ref: ItemRef) =>
  ref.type === 'job' ? `job:${ref.shortId}` : `institution:${ref.id}`

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

/** What the form needs of an institution to show it and link the report to it. */
export type ReportableInstitution = {
  id: number
  name: string
  slug?: string | null
  rorId?: string | null
  shortId?: string | null
}

/** A public item a report can be about: shown on the form, and stored with the report. */
export type ReportItem = {
  /** As the form's hidden input holds it (`job:{shortId}`, `institution:{id}`). */
  ref: string
  type: ItemType
  /** The job's or institution's database ID, stored in the report's field of that type. */
  id: number
  title: string
  path: string
  /** The title's language, when it is not English. */
  lang?: string
}

/**
 * The job a report can name, or null: a job whose page shows it (open, or closed within the
 * last 30 days). Drafts and jobs in review were never public, so their titles are not shown; a
 * withdrawn job, or one closed longer, answers 410.
 */
export function jobItem(job: ReportableJob | null, now: Date): ReportItem | null {
  if (!job?.slug || !job.shortId) return null
  const state = listingState(job, now)
  if (state !== 'open' && state !== 'closed') return null
  return {
    ref: itemRefText({ type: 'job', shortId: job.shortId }),
    type: 'job',
    id: job.id,
    title: job.title,
    path: jobPath(job.slug, job.shortId),
    ...(job.originalLanguage && job.originalLanguage !== 'en'
      ? { lang: job.originalLanguage }
      : {}),
  }
}

/**
 * The institution a report can name, or null. Every institution has a public page while it
 * exists (the proxy renders it whatever its ROR status), at the address its ROR ID or short ID
 * ends: the reference uses that ID, so an institution added by hand that later got a ROR ID is
 * named by its ROR ID, as its address is.
 */
export function institutionItem(institution: ReportableInstitution | null): ReportItem | null {
  const urlId = institution?.rorId ?? institution?.shortId
  if (!institution?.slug || !urlId) return null
  return {
    ref: itemRefText({ type: 'institution', id: urlId }),
    type: 'institution',
    id: institution.id,
    title: institution.name,
    path: institutionPath(institution.slug, urlId),
  }
}

/** Finds the records an item reference names, in any state (the functions above decide). */
export type ItemLookup = {
  job: (shortId: string) => Promise<ReportableJob | null>
  /** By the ID at the end of its address: a ROR ID (9 characters) or a short ID. */
  institution: (id: string) => Promise<ReportableInstitution | null>
}

/** The public item a reference names, or null. */
export async function findReportItem(
  ref: ItemRef | null,
  lookup: ItemLookup,
  now: Date,
): Promise<ReportItem | null> {
  if (!ref) return null
  return ref.type === 'job'
    ? jobItem(await lookup.job(ref.shortId), now)
    : institutionItem(await lookup.institution(ref.id))
}
