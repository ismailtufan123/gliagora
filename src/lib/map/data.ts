import { type JobFilters, JOB_FILTERS, jobsHref } from '@/lib/filters/jobs'
import { serializeFilters } from '@/lib/filters/model'
import type { Locale } from '@/i18n/routing'
import { type DeadlineView, deadlineView, formatDay } from '@/lib/jobs/format'
import type { MapData, MapInstitution } from '@/lib/records'

// The map's data as the browser gets it from /api/map/institutions (PLAN §14): a GeoJSON
// FeatureCollection of institutions for the map's clustered source, with only what the pins need
// (the ID and the count), and the rest keyed by institution ID for the panel and the "Institutions
// in view" list, already in words, so the browser needs no messages or formatting code.

/** The API's address; the query is the jobs list's filters (PLAN §2.4). */
export const MAP_DATA_PATH = '/api/map/institutions/'

/** How long the server and browsers keep an answer: 10 minutes (PLAN §14). */
export const MAP_DATA_MAX_AGE_S = 600

export type MapJob = {
  title: string
  path: string
  /** "Closes 14 Nov 2026, 12 days left", "Rolling deadline" or "Open until filled". */
  deadline: string
  /** Closes within 14 days: the panel adds the "Closing soon" badge. */
  soon: boolean
}

export type MapInstitutionInfo = {
  /** The value of the `institution` filter (ROR ID or short ID). */
  key: string
  name: string
  /** "Berlin, Germany", or whichever of the two is known. */
  place: string | null
  path: string
  website: string | null
  /** The ROR record (https://ror.org/…), when the institution has a ROR ID. */
  ror: string | null
  /** The jobs list with the same filters and this institution. */
  listPath: string
  jobs: MapJob[]
}

export type MapFeature = {
  type: 'Feature'
  id: number
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: { id: number; jobs: number }
}

export type MapJson = {
  type: 'FeatureCollection'
  features: MapFeature[]
  institutions: Record<string, MapInstitutionInfo>
  /** Matching positions on the map. */
  total: number
  /** Matching positions at institutions without coordinates: only in the list. */
  unmapped: number
}

export type MapTexts = {
  place: (city: string, country: string) => string
  closes: (date: string) => string
  daysLeft: (days: number) => string
  lastDay: string
  closed: string
  rolling: string
  untilFilled: string
}

/** The filters without the list's sort, view and page: the key of an answer. */
export const mapQuery = (filters: JobFilters) =>
  serializeFilters(JOB_FILTERS, { ...filters, sort: 'deadline', view: 'list', page: 1 }).toString()

/** About 1 m: enough for a pin, and the answer stays small. */
const round = (value: number) => Math.round(value * 1e5) / 1e5

function deadlineText(view: DeadlineView | null, locale: Locale, texts: MapTexts): string {
  if (!view) return ''
  if (view.kind !== 'fixed') return view.kind === 'rolling' ? texts.rolling : texts.untilFilled
  const left = view.left.key === 'daysLeft' ? texts.daysLeft(view.left.days) : texts[view.left.key]
  return `${texts.closes(formatDay(view.day, locale))}, ${left}`
}

function info(
  institution: MapInstitution,
  filters: JobFilters,
  now: Date,
  locale: Locale,
  texts: MapTexts,
): MapInstitutionInfo {
  const { city, country } = institution
  return {
    key: institution.key,
    name: institution.name,
    place: city && country ? texts.place(city, country) : (city ?? country),
    path: institution.path,
    website: institution.website,
    ror: institution.rorId ? `https://ror.org/${institution.rorId}` : null,
    listPath: jobsHref({ ...filters, institution: [institution.key], view: 'list', page: 1 }),
    jobs: institution.jobs.map((job) => {
      const view = deadlineView(job, now, locale)
      return {
        title: job.title,
        path: job.path,
        deadline: deadlineText(view, locale, texts),
        soon: view?.kind === 'fixed' && view.closingSoon,
      }
    }),
  }
}

/** The answer of /api/map/institutions for this data. */
export function mapJson(
  data: MapData,
  filters: JobFilters,
  now: Date,
  locale: Locale,
  texts: MapTexts,
): MapJson {
  const features: MapFeature[] = []
  const institutions: Record<string, MapInstitutionInfo> = {}
  let total = 0
  for (const institution of data.institutions) {
    const jobs = institution.jobs.length
    if (jobs === 0) continue
    total += jobs
    features.push({
      type: 'Feature',
      id: institution.id,
      geometry: { type: 'Point', coordinates: [round(institution.lng), round(institution.lat)] },
      properties: { id: institution.id, jobs },
    })
    institutions[String(institution.id)] = info(institution, filters, now, locale, texts)
  }
  return { type: 'FeatureCollection', features, institutions, total, unmapped: data.unmapped }
}
