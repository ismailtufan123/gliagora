import { isCalendarDay } from '@/lib/jobs/deadline'
import { paths } from '@/lib/site'

import {
  type FilterState,
  choice,
  emptyFilters,
  filtersHref,
  list,
  one,
  page,
  parseFilters,
  text,
} from './model'
import {
  deadlineRange,
  readCountry,
  readDeadline,
  readInstitution,
  readRegion,
  readSlug,
} from './values'

// The filters of the jobs list (PLAN §2.4, §3.2), in the order of the §2.4 table:
// `/en/jobs/?subfield=glia&type=phd&country=DE,NL&deadline=30d`.

/**
 * The deadline's "Between these dates" option in the filter form. A plain GET form cannot write
 * `deadline=2026-10-01..2026-12-31` itself: it sends `deadline=range` with the two days, and
 * parsing turns them into the range (the proxy then redirects to the canonical address). Days
 * that make no range are shown again with an error (`invalidDeadlineRange`).
 */
export const DEADLINE_RANGE = 'range'
export const DEADLINE_FROM = 'deadline-from'
export const DEADLINE_TO = 'deadline-to'

/** Free text is cut to this many characters. */
export const QUERY_MAX_LENGTH = 100

/**
 * The days the form sent for "Between these dates" when they make no range (a day missing, or
 * the first after the second), or null. The list then shows them again with an error by the date
 * fields (WCAG 3.3.1) rather than drop the range without a word; only real days are kept.
 */
export function invalidDeadlineRange(query: URLSearchParams): { from: string; to: string } | null {
  if (!query.getAll('deadline').includes(DEADLINE_RANGE)) return null
  const [from = '', to = ''] = [DEADLINE_FROM, DEADLINE_TO].map((name) => query.get(name) ?? '')
  if (deadlineRange(from, to)) return null
  return { from: isCalendarDay(from) ? from : '', to: isCalendarDay(to) ? to : '' }
}

export const JOB_FILTERS = {
  path: paths.window('jobs'),
  params: {
    subfield: list(readSlug),
    method: list(readSlug),
    model: list(readSlug),
    type: list(readSlug),
    stage: list(readSlug),
    country: list(readCountry),
    region: list(readRegion),
    deadline: one((raw, query) =>
      raw === DEADLINE_RANGE
        ? deadlineRange(query.get(DEADLINE_FROM), query.get(DEADLINE_TO))
        : readDeadline(raw),
    ),
    institution: list(readInstitution),
    q: text(QUERY_MAX_LENGTH),
    sort: choice(['deadline', 'newest'], 'deadline'),
    // `map` is kept for the map view (M5); until then it shows the list.
    view: choice(['list', 'map'], 'list'),
    page: page(),
  },
  // Not redirected: the page shows the entered days with the error.
  shownAsSent: (query: URLSearchParams) => invalidDeadlineRange(query) !== null,
}

export type JobFilters = FilterState<typeof JOB_FILTERS.params>

export type JobSort = JobFilters['sort']

/** Parameters whose values are taxonomy terms, and their vocabularies (PLAN §4). */
export const TERM_PARAMS = {
  subfield: 'subfield',
  method: 'method',
  model: 'model-system',
  type: 'position-type',
  stage: 'career-stage',
} as const

export type TermParam = keyof typeof TERM_PARAMS

export const parseJobFilters = (query: URLSearchParams) => parseFilters(JOB_FILTERS, query)

/**
 * The jobs list with these filters, e.g. `jobsHref({ type: ['phd'] })` → `/en/jobs/?type=phd`.
 * Always the canonical address (links to it need no redirect).
 */
export const jobsHref = (filters: Partial<JobFilters> = {}) =>
  filtersHref(JOB_FILTERS, { ...emptyFilters(JOB_FILTERS), ...filters })

/**
 * The values the filter form shows for these filters, by field name: the checked boxes, the
 * chosen options and the text. The inverse of parsing the form; the browser script uses it to
 * bring the form back in line with the list after each change.
 */
export function jobFormValues(filters: JobFilters): Record<string, string[]> {
  const [from = '', to = ''] = filters.deadline?.includes('..') ? filters.deadline.split('..') : []
  return {
    subfield: filters.subfield,
    method: filters.method,
    model: filters.model,
    type: filters.type,
    stage: filters.stage,
    country: filters.country,
    region: filters.region,
    deadline: [from ? DEADLINE_RANGE : (filters.deadline ?? '')],
    [DEADLINE_FROM]: [from],
    [DEADLINE_TO]: [to],
    q: [filters.q],
    sort: [filters.sort],
  }
}
