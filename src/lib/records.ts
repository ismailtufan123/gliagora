import config from '@payload-config'
import { type Where, getPayload } from 'payload'
import { cache } from 'react'

import type { Locale } from '@/i18n/routing'
import { type JobCard, type JobDoc, toJobCard, toJobDetail } from '@/lib/jobs/view'

// Reads for the pages that show database records. The proxy has already checked that the record
// exists (src/lib/detail-routes.ts); these return null only if it disappeared in between.
// `cache` shares each read between a page and its metadata within one request.

export const activeSubfields = cache(async (locale: Locale) => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'terms',
    where: { vocabulary: { equals: 'subfield' }, isActive: { equals: true } },
    sort: 'sortOrder',
    select: { slug: true, label: true, description: true },
    locale,
    pagination: false,
    depth: 0,
  })
  return docs
})

export const subfieldBySlug = cache(async (slug: string, locale: Locale) => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'terms',
    where: { vocabulary: { equals: 'subfield' }, slug: { equals: slug } },
    select: { slug: true, label: true, description: true, hubIntro: true, isActive: true },
    locale,
    limit: 1,
    pagination: false,
    depth: 0,
  })
  return docs[0] ?? null
})

/** The institution at the end of an institution URL: a ROR ID (9 characters) or a short ID. */
export const institutionByUrlId = cache(async (id: string, locale: Locale) => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'institutions',
    where: id.length === 9 ? { rorId: { equals: id } } : { shortId: { equals: id } },
    locale,
    limit: 1,
    pagination: false,
    // Includes the country, for its localized name.
    depth: 1,
  })
  return docs[0] ?? null
})

/**
 * The moment the current request is answered, read once, so that every part of a page (lists,
 * deadlines, days left, robots) and its metadata agree.
 */
export const requestTime = cache(() => new Date())

// What job pages and job rows read: public facts only, never internal notes, the checklist or
// the duplicate check. Relationships are read one level deep, with only the fields shown.
const JOB_CARD_SELECT = {
  title: true,
  slug: true,
  shortId: true,
  status: true,
  originalLanguage: true,
  institution: true,
  city: true,
  country: true,
  positionType: true,
  subfields: true,
  methods: true,
  modelSystems: true,
  deadlineKind: true,
  deadlineDate: true,
  deadlineTz: true,
  deadlineAt: true,
  expiredAt: true,
  withdrawnAt: true,
  originalUrl: true,
} as const

const JOB_DETAIL_SELECT = {
  ...JOB_CARD_SELECT,
  careerStages: true,
  startText: true,
  summary: true,
  verifiedAt: true,
} as const

const JOB_POPULATE = {
  institutions: { name: true, slug: true, rorId: true, shortId: true },
  // `isActive`: a retired subfield stays on its jobs, but its hub answers 410, so it gets no link.
  terms: { slug: true, label: true, isActive: true },
  countries: { name: true },
} as const

/** The job at the end of a job URL, in any status (the page decides what to show). */
export const jobByShortId = cache(async (shortId: string, locale: Locale) => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'jobs',
    where: { shortId: { equals: shortId } },
    select: JOB_DETAIL_SELECT,
    populate: JOB_POPULATE,
    locale,
    limit: 1,
    pagination: false,
    depth: 1,
  })
  return docs[0] ? toJobDetail(docs[0] as JobDoc) : null
})

/**
 * Open jobs (PLAN §2.5): published, and before the end of the deadline day when the deadline is
 * fixed. The same rule as `isOpen` in src/lib/jobs/deadline.ts, as a query.
 */
export function openJobsWhere(now: Date): Where {
  return {
    and: [
      { status: { equals: 'published' } },
      {
        or: [
          { deadlineKind: { not_equals: 'fixed' } },
          { deadlineAt: { greater_than: now.toISOString() } },
        ],
      },
    ],
  }
}

/**
 * Open jobs matching `where`, in deadline order (the nearest first; rolling and until-filled
 * ones after them, newest first), at most `limit`. `total` counts all matches when `count` is
 * set, otherwise only the ones returned.
 */
async function findOpenJobs({
  where,
  limit,
  locale,
  count = false,
}: {
  where: Where[]
  limit: number
  locale: Locale
  count?: boolean
}): Promise<{ jobs: JobCard[]; total: number }> {
  const payload = await getPayload({ config })
  const { docs, totalDocs } = await payload.find({
    collection: 'jobs',
    where: { and: [openJobsWhere(requestTime()), ...where] },
    // PostgreSQL puts empty deadlines (rolling, until filled) last in ascending order.
    sort: ['deadlineAt', '-publishedAt'],
    select: JOB_CARD_SELECT,
    populate: JOB_POPULATE,
    locale,
    limit,
    pagination: count,
    depth: 1,
  })
  const jobs = docs.flatMap((doc) => toJobCard(doc as JobDoc) ?? [])
  return { jobs, total: count ? totalDocs : jobs.length }
}

/** Open jobs at an institution, and how many there are; `exceptId` leaves one job out. */
export const openJobsAtInstitution = cache(
  (institutionId: number, locale: Locale, limit: number, exceptId?: number) =>
    findOpenJobs({
      where: [
        { institution: { equals: institutionId } },
        ...(exceptId === undefined ? [] : [{ id: { not_equals: exceptId } }]),
      ],
      limit,
      locale,
      count: true,
    }),
)

/** Open jobs tagged with a subfield, and how many there are. */
export const openJobsInSubfield = cache((subfieldId: number, locale: Locale, limit: number) =>
  findOpenJobs({ where: [{ subfields: { in: [subfieldId] } }], limit, locale, count: true }),
)

/**
 * Open jobs that share a subfield with `job`, those of the same position type first, leaving out
 * the jobs in `exclude` (the job itself and those already shown on its page).
 */
export async function similarOpenJobs(
  job: JobCard,
  exclude: number[],
  locale: Locale,
  limit: number,
): Promise<JobCard[]> {
  const subfields = job.subfields.map((subfield) => subfield.id)
  if (subfields.length === 0) return []
  const base = (excluded: number[]): Where[] => [
    { subfields: { in: subfields } },
    { id: { not_in: excluded } },
  ]
  const type = job.positionType?.id
  const sameType =
    type === undefined
      ? []
      : (
          await findOpenJobs({
            where: [...base(exclude), { positionType: { equals: type } }],
            limit,
            locale,
          })
        ).jobs
  if (sameType.length >= limit) return sameType
  const others = await findOpenJobs({
    where: [...base([...exclude, ...sameType.map((other) => other.id)])],
    limit: limit - sameType.length,
    locale,
  })
  return [...sameType, ...others.jobs]
}
