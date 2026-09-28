import config from '@payload-config'
import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import type { SQL } from '@payloadcms/db-postgres/drizzle'
import { getPayload } from 'payload'

import type { Locale } from '@/i18n/routing'

import { limiter } from './limit'
import { type Search, canMatchInstitutions, readSearch, searchText } from './parse'
import { foldSql, institutionsSql, matchingJobIdsSql, rankedJobsSql, subfieldsSql } from './sql'

// Runs the search queries of sql.ts through Payload's own database connection (its Drizzle
// instance), so they share its pool and settings. Search SQL lives only in src/lib/search, with
// every value as a parameter (CLAUDE.md).

/** Results per group on the search page (PLAN §3.2): positions and institutions, subfields. */
export const SEARCH_LIMITS = { positions: 10, institutions: 10, subfields: 5 } as const

/**
 * The jobs list's `q` filter becomes `id IN (…)` of the matching open positions, so the list keeps
 * its other filters, order, pages and counts. Far more than there are open positions (the launch
 * gate is 150, PLAN §3.4); should a search ever match more, the list shows the first ones and the
 * server log says so.
 */
export const MAX_MATCHING_JOBS = 5000

async function database() {
  const payload = await getPayload({ config })
  return (payload.db as unknown as PostgresAdapter).drizzle
}

async function rows<T>(query: SQL): Promise<T[]> {
  const result = await (await database()).execute(query)
  return result.rows as T[]
}

/**
 * What to search for in `q`: the database folds the query as it folds the indexed text, and
 * parse.ts reads the words from that (readSearch). Null when there is nothing to search for.
 */
export async function prepareSearch(q: string): Promise<Search | null> {
  const text = searchText(q)
  if (!text) return null
  const [row] = await rows<{ folded: string }>(foldSql(text))
  return readSearch(text, row?.folded ?? '')
}

/**
 * The institution search is the one query whose work grows with the data: a common word ("uni")
 * makes it check and rank tens of thousands of names, up to about a second. So whatever people
 * send, it cannot take the database's processors or the pool's connections from the rest of the
 * site: it runs on one processor (no parallel workers), for at most two seconds, and at most two
 * at a time, with a few more waiting. A search that runs too long or finds too many waiting fails,
 * and the search page shows its error state.
 */
const INSTITUTIONS_TIMEOUT = '2s'
const institutionSearches = limiter('institution searches', { running: 2, waiting: 6 })

function institutionRows(query: SQL): Promise<InstitutionRow[]> {
  return institutionSearches(async () =>
    (await database()).transaction(async (tx) => {
      // As SET LOCAL: for this transaction only (set_config takes the values as parameters).
      await tx.execute(sql`
        SELECT set_config('statement_timeout', ${INSTITUTIONS_TIMEOUT}, true),
          set_config('max_parallel_workers_per_gather', '0', true)`)
      return (await tx.execute(query)).rows as InstitutionRow[]
    }),
  )
}

/**
 * The IDs of the open positions that match `q`, for the jobs list. A query without a letter or
 * digit matches nothing.
 */
export async function matchingJobIds(q: string, now: Date): Promise<number[]> {
  const search = await prepareSearch(q)
  if (!search) return []
  const found = await rows<{ id: number }>(matchingJobIdsSql(search, now, MAX_MATCHING_JOBS + 1))
  if (found.length > MAX_MATCHING_JOBS) {
    console.warn(`Search matched more than ${MAX_MATCHING_JOBS} open positions; the list is cut.`)
  }
  return found.slice(0, MAX_MATCHING_JOBS).map((row) => row.id)
}

export type InstitutionRow = {
  id: number
  name: string
  slug: string
  ror_id: string | null
  short_id: string | null
  city: string | null
  country: string | null
  open_jobs: number
  total: number
}

export type SubfieldRow = {
  id: number
  slug: string
  label: string | null
  description: string | null
  total: number
}

export type SearchRows = {
  /** The best positions, most relevant first, and the number of all matches. */
  jobs: { ids: number[]; total: number }
  institutions: { rows: InstitutionRow[]; total: number }
  subfields: { rows: SubfieldRow[]; total: number }
}

/** The three groups of the search page, read at the same time. */
export async function searchRows(search: Search, now: Date, locale: Locale): Promise<SearchRows> {
  const words = search.words.length > 0
  const [jobs, institutions, subfields] = await Promise.all([
    rows<{ id: number; total: number }>(rankedJobsSql(search, now, SEARCH_LIMITS.positions)),
    words && canMatchInstitutions(search)
      ? institutionRows(institutionsSql(search, now, locale, SEARCH_LIMITS.institutions))
      : [],
    words ? rows<SubfieldRow>(subfieldsSql(search, locale, SEARCH_LIMITS.subfields)) : [],
  ])
  return {
    jobs: { ids: jobs.map((row) => row.id), total: jobs[0]?.total ?? 0 },
    institutions: { rows: institutions, total: institutions[0]?.total ?? 0 },
    subfields: { rows: subfields, total: subfields[0]?.total ?? 0 },
  }
}
