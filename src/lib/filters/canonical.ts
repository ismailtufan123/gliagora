import { JOB_FILTERS } from './jobs'
import { type FilterConfig, type ParamSpecs, parseFilters, serializeFilters } from './model'

// Canonical list addresses (PLAN §2.1, §2.4). src/proxy.ts sends a permanent redirect to the
// canonical address when a list is requested with its filters written differently: repeated
// parameters from the filter form without JavaScript, unknown parameters, empty or default
// values, another order or case. Syntax only, no database: a value that names nothing stays in
// the address and simply matches nothing. Campaign tags (`utm_*`) on our own links (PLAN §13,
// §16.4) stay for the statistics: they are left out of the comparison and kept after the filters.

/** The lists whose filters live in the URL. Events, funding and the map join in their milestones. */
const LISTS: readonly FilterConfig<ParamSpecs>[] = [JOB_FILTERS]

const isCampaignTag = (name: string) => name.toLowerCase().startsWith('utm_')

/**
 * The canonical address of a list request, or null when the request already has it (or is not a
 * list, or is a query the list shows as it was sent). Queries are compared as a form encodes them,
 * because Next.js hands the proxy the query in that encoding (commas as `%2C`, spaces as `+`):
 * only a difference in content redirects, never the spelling of a character, so the canonical
 * address cannot redirect to itself.
 */
export function canonicalListPath(pathname: string, query: URLSearchParams): string | null {
  const path = pathname.endsWith('/') ? pathname : `${pathname}/`
  const list = LISTS.find((config) => config.path === path)
  if (!list || list.shownAsSent?.(query)) return null
  const filters = new URLSearchParams()
  const tags = new URLSearchParams()
  for (const [name, value] of query) (isCampaignTag(name) ? tags : filters).append(name, value)
  const canonical = serializeFilters(list, parseFilters(list, filters))
  if (new URLSearchParams(canonical).toString() === filters.toString()) return null
  const search = [canonical, tags.toString()].filter(Boolean).join('&')
  return search ? `${list.path}?${search}` : list.path
}
