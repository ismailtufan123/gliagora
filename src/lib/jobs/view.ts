import { institutionPath, jobPath, subfieldPath } from '@/lib/detail-routes'
import { paths } from '@/lib/site'

import { type DeadlineKind, calendarDay } from './deadline'
import type { DeadlineFacts } from './format'
import type { JobStatus } from './status'

// What the public pages show of a job (PLAN §3.2 "Job card", "Job detail"): the Payload document,
// read with its institution, terms and country, reduced to plain values. Nothing else of the
// document (internal notes, checklist, duplicate check) reaches a page.

/** A relationship as Payload returns it: an ID, or the document when populated. */
type Rel<T> = number | string | T | null | undefined

type TermDoc = {
  id: number
  slug?: string | null
  label?: string | null
  isActive?: boolean | null
}
type InstitutionDoc = {
  id: number
  name?: string | null
  slug?: string | null
  rorId?: string | null
  shortId?: string | null
}

/** A job document read with depth 1 (relationships populated). */
export type JobDoc = {
  id: number
  title?: string | null
  slug?: string | null
  shortId?: string | null
  status: JobStatus
  originalLanguage?: string | null
  institution?: Rel<InstitutionDoc>
  city?: string | null
  country?: Rel<{ name?: string | null }>
  positionType?: Rel<TermDoc>
  careerStages?: Rel<TermDoc>[] | null
  subfields?: Rel<TermDoc>[] | null
  methods?: Rel<TermDoc>[] | null
  modelSystems?: Rel<TermDoc>[] | null
  deadlineKind?: DeadlineKind | null
  deadlineDate?: string | null
  deadlineTz?: string | null
  deadlineAt?: string | null
  expiredAt?: string | null
  withdrawnAt?: string | null
  originalUrl?: string | null
  startText?: string | null
  summary?: string | null
  verifiedAt?: string | null
}

export type TermRef = {
  id: number
  slug: string
  label: string
  /** False for a retired term: it stays on the jobs that have it, but cannot be chosen again. */
  isActive: boolean
}

export type JobCard = DeadlineFacts & {
  id: number
  shortId: string
  /** The canonical address of the job page. */
  path: string
  title: string
  /** ISO 639-1 code of the posting's language. */
  originalLanguage: string
  institution: { id: number; name: string; path: string; urlId: string } | null
  city: string | null
  country: string | null
  positionType: TermRef | null
  subfields: TermRef[]
  methods: TermRef[]
  modelSystems: TermRef[]
  originalUrl: string | null
}

export type JobDetail = JobCard & {
  careerStages: TermRef[]
  startText: string | null
  summary: string | null
  /** "Last verified", as a calendar day (YYYY-MM-DD). */
  verifiedDay: string | null
}

const populated = <T extends object>(value: Rel<T>): T | null =>
  typeof value === 'object' && value !== null ? value : null

function term(value: Rel<TermDoc>): TermRef | null {
  const doc = populated(value)
  // Unset counts as active, as in src/lib/detail-lookup.ts.
  return doc?.slug
    ? { id: doc.id, slug: doc.slug, label: doc.label || doc.slug, isActive: doc.isActive !== false }
    : null
}

const terms = (values: Rel<TermDoc>[] | null | undefined): TermRef[] =>
  (values ?? []).flatMap((value) => term(value) ?? [])

/** The job as a list row shows it, or null if it lacks what every saved job has. */
export function toJobCard(doc: JobDoc): JobCard | null {
  if (!doc.title || !doc.slug || !doc.shortId) return null
  const institution = populated(doc.institution)
  const urlId = institution?.rorId ?? institution?.shortId
  return {
    id: doc.id,
    shortId: doc.shortId,
    path: jobPath(doc.slug, doc.shortId),
    title: doc.title,
    originalLanguage: doc.originalLanguage || 'en',
    institution:
      institution?.name && institution.slug && urlId
        ? {
            id: institution.id,
            name: institution.name,
            path: institutionPath(institution.slug, urlId),
            urlId,
          }
        : null,
    city: doc.city || null,
    country: populated(doc.country)?.name || null,
    positionType: term(doc.positionType),
    subfields: terms(doc.subfields),
    methods: terms(doc.methods),
    modelSystems: terms(doc.modelSystems),
    status: doc.status,
    deadlineKind: doc.deadlineKind ?? 'fixed',
    deadlineDate: doc.deadlineDate ?? null,
    deadlineTz: doc.deadlineTz ?? null,
    deadlineAt: doc.deadlineAt ?? null,
    expiredAt: doc.expiredAt ?? null,
    withdrawnAt: doc.withdrawnAt ?? null,
    originalUrl: doc.originalUrl || null,
  }
}

/** The job as its own page shows it. */
export function toJobDetail(doc: JobDoc): JobDetail | null {
  const card = toJobCard(doc)
  if (!card) return null
  return {
    ...card,
    careerStages: terms(doc.careerStages),
    startText: doc.startText?.trim() || null,
    summary: doc.summary?.trim() || null,
    verifiedDay: calendarDay(doc.verifiedAt),
  }
}

/**
 * The tags a list row shows (PLAN §3.2): up to `max`, subfields first, then methods and model
 * systems, and how many more there are ("+2"). Position type and career stage are facts, not tags.
 */
export function rowTags(job: JobCard, max = 3): { shown: TermRef[]; more: number } {
  const all = [...job.subfields, ...job.methods, ...job.modelSystems]
  return { shown: all.slice(0, max), more: Math.max(0, all.length - max) }
}

/**
 * The hub a subfield on a job links to, or null for a retired subfield: the job keeps it, but its
 * hub answers 410 (src/lib/detail-routes.ts), so it is shown without a link.
 */
export const subfieldHubPath = (term: TermRef): string | null =>
  term.isActive ? subfieldPath(term.slug) : null

/** Filters of the jobs list, in the shared filter model (PLAN §2.4). */
export type JobsFilter = Partial<
  Record<'type' | 'subfield' | 'method' | 'model' | 'institution', string>
>

/**
 * The jobs list with these filters, e.g. `/en/jobs/?type=phd&subfield=glia`. Parameters keep the
 * order of PLAN §2.4, so the same filters always give the same address. The list itself is built
 * in M4.3.
 */
export function jobsListPath(filter: JobsFilter = {}): string {
  const order = ['type', 'subfield', 'method', 'model', 'institution'] as const
  const query = new URLSearchParams(
    order.flatMap((key) => (filter[key] ? [[key, filter[key]] as [string, string]] : [])),
  ).toString()
  return query ? `${paths.window('jobs')}?${query}` : paths.window('jobs')
}
