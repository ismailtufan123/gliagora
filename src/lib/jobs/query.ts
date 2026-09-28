import type { Where } from 'payload'

import { type JobFilters, type JobSort, TERM_PARAMS, type TermParam } from '@/lib/filters/jobs'
import { deadlineFilter, readRegion } from '@/lib/filters/values'
import { type Region, REGIONS } from '@/lib/geography'
import { addDays } from '@/lib/jobs/deadline'
import { METHOD_GROUPS, type MethodGroup, withDescendants } from '@/lib/taxonomy'

// The jobs list as a database query (PLAN §2.4, §3.2): the filters of the URL, with slugs already
// resolved to records (src/lib/records.ts reads those in one query each), become a Payload `where`
// for open jobs. Pure, so every rule is unit-tested.

/** Rows per page (PLAN §3.2). */
export const JOBS_PER_PAGE = 25

const DAY_MS = 86_400_000

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
 * Deadline order: the nearest first, then rolling and until-filled ones (PostgreSQL puts empty
 * deadlines last in ascending order), each newest first. Newest: by first publication. The ID
 * keeps pages stable when those are equal.
 */
export const JOBS_SORT: Record<JobSort, string[]> = {
  deadline: ['deadlineAt', '-publishedAt', '-id'],
  newest: ['-publishedAt', '-id'],
}

/** The job fields the term parameters filter on. */
const TERM_FIELDS: Record<TermParam, string> = {
  subfield: 'subfields',
  method: 'methods',
  model: 'modelSystems',
  type: 'positionType',
  stage: 'careerStages',
}

/** A taxonomy term as the filters use it. */
export type FilterTerm = {
  id: number
  vocabulary: string
  slug: string
  label: string
  parent: number | null
  group: MethodGroup | null
}

/** A country with open jobs, as the filters use it. */
export type FilterCountry = { code: string; name: string; region: Region | null }

/**
 * The term IDs each set term parameter matches: the chosen terms and their descendants (PLAN
 * §4.1: `rodent` also finds `mouse` and `rat`). Unknown and retired slugs are not among `terms`,
 * so they match nothing; a parameter whose slugs are all unknown gets an empty list.
 */
export function termIds(
  filters: JobFilters,
  terms: readonly FilterTerm[],
): Partial<Record<TermParam, number[]>> {
  const ids: Partial<Record<TermParam, number[]>> = {}
  for (const [param, vocabulary] of Object.entries(TERM_PARAMS) as [TermParam, string][]) {
    const slugs = filters[param]
    if (slugs.length === 0) continue
    const vocabularyTerms = terms.filter((term) => term.vocabulary === vocabulary)
    const chosen = vocabularyTerms.filter((term) => slugs.includes(term.slug))
    ids[param] = withDescendants(
      chosen.map((term) => term.id),
      vocabularyTerms,
    ).sort((a, b) => a - b)
  }
  return ids
}

/**
 * The country codes the location filters match, or null without location filters. Countries and
 * regions are one filter (a job is in Germany or in Asia), so their countries add up. A region
 * stands for its countries that have open jobs: others would match nothing anyway.
 */
export function locationCodes(
  filters: JobFilters,
  openCountries: readonly FilterCountry[],
): string[] | null {
  if (filters.country.length === 0 && filters.region.length === 0) return null
  const codes = new Set(filters.country)
  for (const country of openCountries) {
    if (country.region && filters.region.includes(country.region)) codes.add(country.code)
  }
  return [...codes].sort()
}

/** What the database found for the filters that name records, and for the free text. */
export type ResolvedJobFilters = {
  terms: Partial<Record<TermParam, number[]>>
  /** Null without location filters. */
  countries: string[] | null
  /** Institution IDs; null without an institution filter. */
  institutions: number[] | null
  /**
   * The open jobs that match the free text (`q`), by the site search (src/lib/search): every word
   * in the title, the summary or the institution's name, folded for case, accents and Turkish
   * İ/ı, the last word also as the start of a longer one. Null without free text.
   */
  search: number[] | null
}

const startOfDay = (day: string) => `${day}T00:00:00.000Z`
// The day's last moment rather than the next day's first: after 9999-12-31 there is no day that
// PostgreSQL accepts.
const endOfDay = (day: string) => `${day}T23:59:59.999Z`

/**
 * The deadline filter as a query; every deadline filter leaves out rolling and until-filled
 * positions. `7d`…`90d`: closing within that many days from now (`14d` is exactly the "Closing
 * soon" badge). `this-month`: the deadline day is in the current month (UTC). A range: the
 * deadline day is within it, both days included. Deadline days are stored at noon UTC
 * (`storedDay`), so whole UTC days bound them.
 */
export function deadlineWhere(value: string, now: Date): Where | null {
  const filter = deadlineFilter(value)
  if (!filter) return null
  const fixed: Where = { deadlineKind: { equals: 'fixed' } }
  if (filter.kind === 'within') {
    const until = new Date(now.getTime() + filter.days * DAY_MS).toISOString()
    return { and: [fixed, { deadlineAt: { less_than_equal: until } }] }
  }
  const [from, to] =
    filter.kind === 'range'
      ? [filter.from, filter.to]
      : [
          `${now.toISOString().slice(0, 7)}-01`,
          addDays(
            new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
              .toISOString()
              .slice(0, 10),
            -1,
          ),
        ]
  return {
    and: [
      fixed,
      { deadlineDate: { greater_than_equal: startOfDay(from) } },
      { deadlineDate: { less_than_equal: endOfDay(to) } },
    ],
  }
}

/**
 * The query for the open jobs that match the filters, or null when nothing can match (a filter
 * whose values are all unknown, or free text that matches no position), so the list is empty
 * without asking the database again.
 */
export function jobsWhere(
  filters: JobFilters,
  resolved: ResolvedJobFilters,
  now: Date,
): Where | null {
  const conditions: Where[] = [openJobsWhere(now)]
  for (const [param, ids] of Object.entries(resolved.terms) as [TermParam, number[]][]) {
    if (ids.length === 0) return null
    conditions.push({ [TERM_FIELDS[param]]: { in: ids } })
  }
  for (const [field, values] of [
    ['country', resolved.countries],
    ['institution', resolved.institutions],
  ] as const) {
    if (values === null) continue
    if (values.length === 0) return null
    conditions.push({ [field]: { in: values } })
  }
  if (filters.deadline) {
    const deadline = deadlineWhere(filters.deadline, now)
    if (!deadline) return null
    conditions.push(deadline)
  }
  // The search's matches as a list of IDs, so the other filters, the order, the pages and the
  // counts stay Payload's own.
  if (resolved.search !== null) {
    if (resolved.search.length === 0) return null
    conditions.push({ id: { in: resolved.search } })
  }
  return { and: conditions }
}

/** An option of a filter: a value and its label, with narrower options under it. */
export type FilterOption = { value: string; label: string; children: FilterOption[] }

/** The options of every filter of the jobs list. */
export type JobFilterOptions = Record<Exclude<TermParam, 'method'>, FilterOption[]> & {
  /** Methods in the groups of PLAN §4.3; `group` is null for a method without one. */
  method: { group: MethodGroup | null; options: FilterOption[] }[]
  country: FilterOption[]
  region: Region[]
}

/**
 * The filter options (PLAN §3.2, §9.3): active terms in their order (children under their
 * parent, methods by group), countries with open jobs alphabetically, regions with open jobs.
 * Countries and regions already chosen stay listed, so they can be unticked.
 */
export function filterOptions(
  terms: readonly FilterTerm[],
  countries: readonly FilterCountry[],
  chosenRegions: readonly string[],
  collator: Intl.Collator,
): JobFilterOptions {
  const tree = (vocabulary: string, only: (term: FilterTerm) => boolean = () => true) => {
    const inVocabulary = terms.filter((term) => term.vocabulary === vocabulary && only(term))
    const ids = new Set(inVocabulary.map((term) => term.id))
    const build = (parent: number | null, seen: Set<number>): FilterOption[] =>
      inVocabulary
        .filter((term) =>
          parent === null ? term.parent === null || !ids.has(term.parent) : term.parent === parent,
        )
        .filter((term) => !seen.has(term.id))
        .map((term) => ({
          value: term.slug,
          label: term.label,
          children: build(term.id, new Set([...seen, term.id])),
        }))
    return build(null, new Set())
  }
  const groups = [...METHOD_GROUPS.map((group) => group.value), null] as const
  const regions = new Set(chosenRegions.flatMap((region) => readRegion(region) ?? []))
  for (const country of countries) if (country.region) regions.add(country.region)
  return {
    subfield: tree(TERM_PARAMS.subfield),
    method: groups
      .map((group) => ({
        group,
        options: tree(TERM_PARAMS.method, (term) => term.group === group),
      }))
      .filter((group) => group.options.length > 0),
    model: tree(TERM_PARAMS.model),
    type: tree(TERM_PARAMS.type),
    stage: tree(TERM_PARAMS.stage),
    country: [...countries]
      .sort((a, b) => collator.compare(a.name, b.name))
      .map((country) => ({ value: country.code, label: country.name, children: [] })),
    region: REGIONS.map((region) => region.value).filter((region) => regions.has(region)),
  }
}

/** Every option of a filter with its narrower ones, flat. */
export const flatOptions = (options: readonly FilterOption[]): FilterOption[] =>
  options.flatMap((option) => [option, ...flatOptions(option.children)])
