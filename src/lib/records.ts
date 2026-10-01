import config from '@payload-config'
import { type Where, getPayload } from 'payload'
import { cache } from 'react'

import type { Locale } from '@/i18n/routing'
import { institutionPath, subfieldPath } from '@/lib/detail-routes'
import { type JobFilters, TERM_PARAMS, jobsHref, parseJobFilters } from '@/lib/filters/jobs'
import type { Region } from '@/lib/geography'
import { intlLocale } from '@/lib/jobs/format'
import {
  type FilterCountry,
  type FilterTerm,
  JOBS_PER_PAGE,
  JOBS_SORT,
  type JobFilterOptions,
  filterOptions,
  jobsWhere,
  locationCodes,
  openJobsWhere,
  termIds,
} from '@/lib/jobs/query'
import { type JobCard, type JobDoc, toJobCard, toJobDetail } from '@/lib/jobs/view'
import type { ItemLookup } from '@/lib/reports/item'
import type { FeedJob } from '@/lib/seo/feed'
import { matchingJobIds, prepareSearch, searchRows } from '@/lib/search/database'
import type { MethodGroup } from '@/lib/taxonomy'

// Reads for the pages that show database records. The proxy has already checked that the record
// exists (src/lib/detail-routes.ts); these return null only if it disappeared in between.
// `cache` shares each read between a page and its metadata within one request.

/**
 * Subfields whose hubs answer: unset counts as active, as in src/lib/detail-lookup.ts (the proxy
 * renders such a hub), so the subfield index links it and the sitemaps can list it. Payload's
 * Postgres adapter turns `not_equals` into `IS NULL OR <>`.
 */
const ACTIVE_SUBFIELDS: Where = {
  vocabulary: { equals: 'subfield' },
  isActive: { not_equals: false },
}

export const activeSubfields = cache(async (locale: Locale) => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'terms',
    where: ACTIVE_SUBFIELDS,
    sort: 'sortOrder',
    select: { slug: true, label: true, description: true },
    locale,
    pagination: false,
    depth: 0,
  })
  return docs
})

/**
 * The active subfields with what decides whether their hubs are indexed (src/lib/indexing.ts):
 * the written introduction. For the subfield index's robots rule and the sitemaps.
 */
export const subfieldsForIndexing = cache(async () => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'terms',
    where: ACTIVE_SUBFIELDS,
    sort: 'sortOrder',
    select: { slug: true, hubIntro: true },
    // Hubs exist in English only (PLAN §12).
    locale: 'en',
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
 * The open jobs published last, newest first, at most `limit`: the jobs feed (PLAN §2.2). `now`
 * is passed in, since a route handler has no request cache for `requestTime`.
 */
export async function latestOpenJobs(now: Date, limit: number, locale: Locale): Promise<FeedJob[]> {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'jobs',
    where: openJobsWhere(now),
    sort: JOBS_SORT.newest,
    select: { ...JOB_CARD_SELECT, summary: true, publishedAt: true },
    populate: JOB_POPULATE,
    locale,
    limit,
    pagination: false,
    depth: 1,
  })
  return docs.flatMap((doc) => {
    const card = toJobCard(doc as JobDoc)
    return card
      ? [
          {
            ...card,
            summary: doc.summary?.trim() || null,
            publishedAt: doc.publishedAt ?? null,
          },
        ]
      : []
  })
}

/**
 * What "Report a problem" needs of the job named in its address (src/lib/reports/item.ts): its
 * title and address, and the dates that say whether its page is public. Any status; the form
 * decides.
 */
export const jobForReport = cache(async (shortId: string) => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'jobs',
    where: { shortId: { equals: shortId } },
    select: {
      title: true,
      slug: true,
      shortId: true,
      originalLanguage: true,
      status: true,
      deadlineKind: true,
      deadlineAt: true,
      expiredAt: true,
      withdrawnAt: true,
    },
    limit: 1,
    pagination: false,
    depth: 0,
  })
  return docs[0] ?? null
})

/**
 * What "Report a problem" needs of the institution named in its address: its name and address.
 * Found as the institution page finds it (institutionByUrlId), by its ROR ID or short ID.
 */
export const institutionForReport = cache(async (id: string) => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'institutions',
    where: id.length === 9 ? { rorId: { equals: id } } : { shortId: { equals: id } },
    select: { name: true, slug: true, rorId: true, shortId: true },
    limit: 1,
    pagination: false,
    depth: 0,
  })
  return docs[0] ?? null
})

/** How "Report a problem" finds the item named in its address, on the page and when stored. */
export const reportItemLookup: ItemLookup = { job: jobForReport, institution: institutionForReport }

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
    sort: JOBS_SORT.deadline,
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

/** What the jobs list shows for its filters (PLAN §3.2). */
export type JobsList = {
  /** The rows of the requested page. */
  jobs: JobCard[]
  /** Open jobs that match the filters. */
  matches: number
  /** Pages of matches (0 when nothing matches). */
  pages: number
  /** All open jobs ("412 open positions"). */
  open: number
  options: JobFilterOptions
  /** The institutions of the institution filter that exist, by the ID in the URL. */
  institutions: { id: string; name: string }[]
}

/**
 * The jobs list's filters resolved against the database, shared by the list and the map (so both
 * always show the same positions): one query each for the taxonomy terms (options, slugs and
 * their descendants), the countries with open jobs, the chosen institutions and countries, and the
 * free text. `where` is the query for the matching open jobs, or null when nothing can match:
 * unknown and retired values match nothing (PLAN §2.4).
 */
async function resolveJobFilters(filters: JobFilters, locale: Locale, now: Date) {
  const payload = await getPayload({ config })
  const open = openJobsWhere(now)
  const rorIds = filters.institution.filter((id) => id.length === 9)
  const shortIds = filters.institution.filter((id) => id.length !== 9)
  const [terms, openCountries, institutions, chosenCountries, search] = await Promise.all([
    payload.find({
      collection: 'terms',
      where: {
        vocabulary: { in: Object.values(TERM_PARAMS) },
        // Unset counts as active, as in src/lib/detail-lookup.ts.
        isActive: { not_equals: false },
      },
      select: { vocabulary: true, slug: true, label: true, parent: true, group: true },
      sort: ['sortOrder', 'id'],
      locale,
      pagination: false,
      depth: 0,
    }),
    payload.findDistinct({
      collection: 'jobs',
      field: 'country',
      where: open,
      locale,
      depth: 1,
      populate: { countries: { name: true, region: true } },
    }),
    filters.institution.length > 0
      ? payload.find({
          collection: 'institutions',
          where: {
            or: [
              ...(rorIds.length > 0 ? [{ rorId: { in: rorIds } }] : []),
              ...(shortIds.length > 0 ? [{ shortId: { in: shortIds } }] : []),
            ],
          },
          select: { name: true, rorId: true, shortId: true },
          locale,
          pagination: false,
          depth: 0,
        })
      : null,
    filters.country.length > 0
      ? payload.find({
          collection: 'countries',
          where: { id: { in: filters.country } },
          select: { name: true, region: true },
          locale,
          pagination: false,
          depth: 0,
        })
      : null,
    // Free text: the open positions the site search finds (src/lib/search), by ID.
    filters.q ? matchingJobIds(filters.q, now) : null,
  ])

  const filterTerms: FilterTerm[] = terms.docs.map((term) => ({
    id: term.id,
    vocabulary: term.vocabulary,
    slug: term.slug,
    label: term.label || term.slug,
    parent: typeof term.parent === 'object' ? (term.parent?.id ?? null) : (term.parent ?? null),
    group: (term.group as MethodGroup | null | undefined) ?? null,
  }))
  const withOpenJobs: FilterCountry[] = openCountries.values.flatMap(({ country }) =>
    typeof country === 'object' && country
      ? [
          {
            code: country.id,
            name: country.name || country.id,
            region: (country.region as Region | null | undefined) ?? null,
          },
        ]
      : [],
  )
  // Chosen countries without open jobs stay in the options, so they can be unticked.
  const chosenOnly: FilterCountry[] = (chosenCountries?.docs ?? [])
    .filter((doc) => !withOpenJobs.some((country) => country.code === doc.id))
    .map((doc) => ({
      code: doc.id,
      name: doc.name || doc.id,
      region: (doc.region as Region | null | undefined) ?? null,
    }))

  const where = jobsWhere(
    filters,
    {
      terms: termIds(filters, filterTerms),
      countries: locationCodes(filters, withOpenJobs),
      institutions: institutions ? institutions.docs.map((doc) => doc.id) : null,
      search,
    },
    now,
  )
  return { payload, where, filterTerms, countries: [...withOpenJobs, ...chosenOnly], institutions }
}

/**
 * The jobs list for these filters: the resolved filters (above), the number of open jobs, and the
 * page of matching jobs with their total. A filter with no known value skips the jobs query.
 */
export async function jobsList(filters: JobFilters, locale: Locale): Promise<JobsList> {
  const now = requestTime()
  const [resolved, openCount] = await Promise.all([
    resolveJobFilters(filters, locale, now),
    getPayload({ config }).then((payload) =>
      payload.count({ collection: 'jobs', where: openJobsWhere(now) }),
    ),
  ])
  const { payload, where, filterTerms, countries, institutions } = resolved
  const found = where
    ? await payload.find({
        collection: 'jobs',
        where,
        sort: JOBS_SORT[filters.sort],
        select: JOB_CARD_SELECT,
        populate: JOB_POPULATE,
        locale,
        limit: JOBS_PER_PAGE,
        page: filters.page,
        depth: 1,
      })
    : null
  // A page past the end has no rows, and then Payload's Postgres adapter reports 0 matches when
  // the query joins another table (the terms a job has several of), so such a page counts them
  // separately.
  const matches =
    where && found && found.docs.length === 0 && filters.page > 1
      ? (await payload.count({ collection: 'jobs', where, locale })).totalDocs
      : (found?.totalDocs ?? 0)

  return {
    jobs: (found?.docs ?? []).flatMap((doc) => toJobCard(doc as JobDoc) ?? []),
    matches,
    pages: Math.ceil(matches / JOBS_PER_PAGE),
    open: openCount.totalDocs,
    options: filterOptions(
      filterTerms,
      countries,
      filters.region,
      new Intl.Collator(intlLocale(locale)),
    ),
    institutions: (institutions?.docs ?? []).flatMap((doc) =>
      [doc.rorId, doc.shortId].flatMap((id) =>
        id && filters.institution.includes(id) ? [{ id, name: doc.name }] : [],
      ),
    ),
  }
}

/**
 * How many open jobs match these filters: the number the jobs list shows for them ("38 positions
 * match"), from the same resolution of the filters. Unset filters take the list's defaults.
 */
export async function countOpenJobs(
  filters: Partial<JobFilters>,
  locale: Locale,
  now: Date,
): Promise<number> {
  const all = { ...parseJobFilters(new URLSearchParams()), ...filters }
  const { payload, where } = await resolveJobFilters(all, locale, now)
  return where ? (await payload.count({ collection: 'jobs', where, locale })).totalDocs : 0
}

/** Open jobs with a fixed deadline, the nearest first ("Deadlines coming up" on the home page). */
export async function nextDeadlines(locale: Locale, limit: number): Promise<JobCard[]> {
  const { jobs } = await findOpenJobs({
    where: [{ deadlineKind: { equals: 'fixed' } }],
    limit,
    locale,
  })
  return jobs
}

/** What the open jobs cover (the home page's figures, PLAN §3.2 "Home"). */
export type OpenJobsCoverage = {
  /** All open jobs. */
  open: number
  /** Institutions with open jobs that the map shows (those with a place, as mapInstitutions). */
  institutions: number
  /** Countries with open jobs, the most jobs first. */
  countries: { code: string; name: string; jobs: number }[]
}

export async function openJobsCoverage(locale: Locale, now: Date): Promise<OpenJobsCoverage> {
  const payload = await getPayload({ config })
  // Two small fields of every open job: a few thousand rows at most (PLAN §3.4 expects hundreds).
  const { docs } = await payload.find({
    collection: 'jobs',
    where: openJobsWhere(now),
    select: { institution: true, country: true },
    locale,
    pagination: false,
    depth: 0,
  })
  const institutions = new Set<number>()
  const byCountry = new Map<string, number>()
  for (const doc of docs) {
    const institution = typeof doc.institution === 'object' ? doc.institution?.id : doc.institution
    if (typeof institution === 'number') institutions.add(institution)
    const country = typeof doc.country === 'object' ? doc.country?.id : doc.country
    if (country) byCountry.set(country, (byCountry.get(country) ?? 0) + 1)
  }
  const [names, places] = await Promise.all([
    byCountry.size > 0
      ? payload.find({
          collection: 'countries',
          where: { id: { in: [...byCountry.keys()] } },
          select: { name: true },
          locale,
          pagination: false,
          depth: 0,
        })
      : null,
    institutions.size > 0
      ? payload.find({
          collection: 'institutions',
          where: { id: { in: [...institutions] } },
          select: { slug: true, rorId: true, shortId: true, lat: true, lng: true },
          pagination: false,
          depth: 0,
        })
      : null,
  ])
  // The institutions the map pins (mapInstitutions): with a place and an address of their own.
  const mapped = (places?.docs ?? []).filter(
    (doc) =>
      typeof doc.lat === 'number' &&
      typeof doc.lng === 'number' &&
      !!(doc.rorId || doc.shortId) &&
      !!doc.slug,
  )
  const collator = new Intl.Collator(intlLocale(locale))
  const countries = [...byCountry]
    .map(([code, jobs]) => ({
      code,
      name: names?.docs.find((doc) => doc.id === code)?.name || code,
      jobs,
    }))
    .sort((a, b) => b.jobs - a.jobs || collator.compare(a.name, b.name))
  return { open: docs.length, institutions: mapped.length, countries }
}

/** The position types (PLAN §4.5), each with its open jobs, as the jobs list counts them. */
export async function openJobsByType(
  locale: Locale,
  now: Date,
): Promise<{ slug: string; label: string; jobs: number }[]> {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'terms',
    where: { vocabulary: { equals: TERM_PARAMS.type }, isActive: { not_equals: false } },
    select: { slug: true, label: true },
    sort: ['sortOrder', 'id'],
    locale,
    pagination: false,
    depth: 0,
  })
  const counted = await Promise.all(
    docs.map(async (doc) => ({
      slug: doc.slug,
      label: doc.label || doc.slug,
      jobs: await countOpenJobs({ type: [doc.slug] }, locale, now),
    })),
  )
  return counted.filter((type) => type.jobs > 0)
}

/** At most this many matching positions go on the map (PLAN §3.4 expects hundreds). */
export const MAP_MAX_JOBS = 5000

/** An institution on the map (PLAN §14): where it is, and its positions that match the filters. */
export type MapInstitution = {
  id: number
  /** The value of the `institution` filter: the ROR ID, or the short ID of one added by hand. */
  key: string
  name: string
  city: string | null
  country: string | null
  lng: number
  lat: number
  /** The institution page. */
  path: string
  website: string | null
  rorId: string | null
  /** Its matching open positions, soonest deadline first. */
  jobs: JobCard[]
}

export type MapData = {
  institutions: MapInstitution[]
  /** Matching positions at institutions without coordinates: in the list, not on the map. */
  unmapped: number
}

/**
 * The map's data for these filters (PLAN §14): the institutions with matching open positions, each
 * with its positions. Pins are institutions only, never individuals; a position is pinned at its
 * institution even when it names another place.
 */
export async function mapInstitutions(filters: JobFilters, locale: Locale): Promise<MapData> {
  const now = requestTime()
  const { payload, where } = await resolveJobFilters(filters, locale, now)
  if (!where) return { institutions: [], unmapped: 0 }
  const found = await payload.find({
    collection: 'jobs',
    where,
    sort: JOBS_SORT.deadline,
    select: JOB_CARD_SELECT,
    populate: JOB_POPULATE,
    locale,
    limit: MAP_MAX_JOBS,
    depth: 1,
  })
  if (found.totalDocs > MAP_MAX_JOBS) {
    console.warn(`The map shows ${MAP_MAX_JOBS} of ${found.totalDocs} matching positions.`)
  }
  const jobsByInstitution = new Map<number, JobCard[]>()
  for (const doc of found.docs) {
    const card = toJobCard(doc as JobDoc)
    if (!card?.institution) continue
    const jobs = jobsByInstitution.get(card.institution.id) ?? []
    jobs.push(card)
    jobsByInstitution.set(card.institution.id, jobs)
  }
  if (jobsByInstitution.size === 0) return { institutions: [], unmapped: 0 }
  const places = await payload.find({
    collection: 'institutions',
    where: { id: { in: [...jobsByInstitution.keys()] } },
    select: {
      name: true,
      slug: true,
      rorId: true,
      shortId: true,
      city: true,
      country: true,
      lat: true,
      lng: true,
      website: true,
    },
    populate: { countries: { name: true } },
    locale,
    pagination: false,
    depth: 1,
  })
  const institutions: MapInstitution[] = []
  let unmapped = 0
  for (const doc of places.docs) {
    const jobs = jobsByInstitution.get(doc.id) ?? []
    const key = doc.rorId || doc.shortId
    if (typeof doc.lat !== 'number' || typeof doc.lng !== 'number' || !key || !doc.slug) {
      unmapped += jobs.length
      continue
    }
    institutions.push({
      id: doc.id,
      key,
      name: doc.name,
      city: doc.city ?? null,
      country: typeof doc.country === 'object' && doc.country ? doc.country.name || null : null,
      lng: doc.lng,
      lat: doc.lat,
      path: institutionPath(doc.slug, key),
      website: doc.website ?? null,
      rorId: doc.rorId ?? null,
      jobs,
    })
  }
  return { institutions, unmapped }
}

/** Job rows for these IDs, in the same order (the search's ranking). */
async function jobCardsByIds(ids: number[], locale: Locale): Promise<JobCard[]> {
  if (ids.length === 0) return []
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'jobs',
    where: { id: { in: ids } },
    select: JOB_CARD_SELECT,
    populate: JOB_POPULATE,
    locale,
    limit: ids.length,
    pagination: false,
    depth: 1,
  })
  const cards = new Map(
    docs.flatMap((doc) => {
      const card = toJobCard(doc as JobDoc)
      return card ? [[card.id, card] as const] : []
    }),
  )
  return ids.flatMap((id) => cards.get(id) ?? [])
}

export type InstitutionHit = {
  id: number
  name: string
  href: string
  city: string | null
  country: string | null
  openJobs: number
  /** The jobs list filtered to this institution. */
  jobsHref: string
}

export type SubfieldHit = { slug: string; label: string; description: string | null; href: string }

/** The search page's groups (PLAN §3.2): each with its best results and the number of matches. */
export type SiteSearch = {
  /** The query as searched (trimmed, at most 100 characters). */
  q: string
  positions: { jobs: JobCard[]; total: number }
  institutions: { items: InstitutionHit[]; total: number }
  subfields: { items: SubfieldHit[]; total: number }
}

/**
 * The site search (PLAN §3.2, "basic" in Phase 1a): open positions, institutions and subfields;
 * the other windows join as they are built (1d). Null when the query has no letter or digit.
 */
export async function siteSearch(q: string, locale: Locale): Promise<SiteSearch | null> {
  const search = await prepareSearch(q)
  if (!search) return null
  const rows = await searchRows(search, requestTime(), locale)
  return {
    q: search.text,
    positions: { jobs: await jobCardsByIds(rows.jobs.ids, locale), total: rows.jobs.total },
    institutions: {
      items: rows.institutions.rows.flatMap((row) => {
        const urlId = row.ror_id ?? row.short_id
        return urlId
          ? [
              {
                id: row.id,
                name: row.name,
                href: institutionPath(row.slug, urlId),
                city: row.city,
                country: row.country,
                openJobs: row.open_jobs,
                jobsHref: jobsHref({ institution: [urlId] }),
              },
            ]
          : []
      }),
      total: rows.institutions.total,
    },
    subfields: {
      items: rows.subfields.rows.map((row) => ({
        slug: row.slug,
        label: row.label || row.slug,
        description: row.description,
        href: subfieldPath(row.slug),
      })),
      total: rows.subfields.total,
    },
  }
}
