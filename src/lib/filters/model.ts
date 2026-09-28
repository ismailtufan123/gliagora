// The shared filter model (PLAN §2.4): one URL encoding for the filters of every list. The jobs
// list uses it now (src/lib/filters/jobs.ts); events, funding, the map and saved searches reuse it.
// A list describes its parameters once, in the order of the §2.4 table. `parseFilters` reads any
// query people, links or plain GET forms send; `serializeFilters` writes the one canonical form, so
// the same filters always give the same address. Pure: runs on the server, in the proxy and in the
// browser (keep it small, it counts towards the JavaScript budget, PLAN §17.3).

/** At most this many values per list parameter; the rest are dropped. */
export const MAX_VALUES = 50

/** The highest page number read from a URL; a larger one counts as page 1. */
export const MAX_PAGE = 99_999

/** How one parameter is read from the URL and written back. */
export type ParamSpec =
  /** Comma-separated values, also repeated (`a=x&a=y`); de-duplicated and sorted. */
  | { kind: 'list'; read: (raw: string) => string | null }
  /** One value; the first valid one wins. `query` holds the whole query, for values a form sends in parts. */
  | { kind: 'one'; read: (raw: string, query: URLSearchParams) => string | null }
  /** One of fixed values; the default is left out of the URL. */
  | { kind: 'choice'; values: readonly string[]; fallback: string }
  /** Free text: trimmed, runs of white space as one space, at most `maxLength` characters. */
  | { kind: 'text'; maxLength: number }
  /** A page number, 1 or more; page 1 is left out of the URL. */
  | { kind: 'page' }

export const list = (read: (raw: string) => string | null) => ({ kind: 'list' as const, read })

export const one = (read: (raw: string, query: URLSearchParams) => string | null) => ({
  kind: 'one' as const,
  read,
})

export const choice = <const V extends readonly string[]>(values: V, fallback: V[number]) => ({
  kind: 'choice' as const,
  values,
  fallback,
})

export const text = (maxLength: number) => ({ kind: 'text' as const, maxLength })

export const page = () => ({ kind: 'page' as const })

export type ParamSpecs = Record<string, ParamSpec>

type ValueOf<S extends ParamSpec> = S extends { kind: 'list' }
  ? string[]
  : S extends { kind: 'one' }
    ? string | null
    : S extends { kind: 'choice'; values: readonly (infer V)[] }
      ? V
      : S extends { kind: 'text' }
        ? string
        : number

/** The filters of a list, one field per parameter. */
export type FilterState<P extends ParamSpecs> = { [K in keyof P]: ValueOf<P[K]> }

/** A list's address and its parameters, in the order of the PLAN §2.4 table. */
export type FilterConfig<P extends ParamSpecs> = {
  path: string
  params: P
  /**
   * Queries the list shows as they were sent, without the redirect to the canonical address:
   * those with a mistake the page points out, such as a range of days with a day missing.
   */
  shownAsSent?: (query: URLSearchParams) => boolean
}

/** Parameters that filter the items (not sort, view or page). */
export type FilterKey<P extends ParamSpecs> = {
  [K in keyof P]: P[K] extends { kind: 'list' | 'one' | 'text' } ? K : never
}[keyof P] &
  string

const nonNull = <T>(value: T | null): value is T => value !== null

const split = (values: string[]) => values.flatMap((value) => value.split(','))

/** Free text as the model keeps it: control characters and runs of white space as one space. */
export function normaliseText(value: string, maxLength: number): string {
  const clean = value.replace(/[\p{Cc}\s]+/gu, ' ').trim()
  // Counted in characters, not UTF-16 units, so no emoji or accented letter is cut in half.
  return Array.from(clean).slice(0, maxLength).join('').trim()
}

/** The filters a query string sets. Invalid values and unknown parameters are dropped. */
export function parseFilters<P extends ParamSpecs>(
  { params }: FilterConfig<P>,
  query: URLSearchParams,
): FilterState<P> {
  const state: Record<string, unknown> = {}
  for (const [name, spec] of Object.entries(params)) {
    const raw = query.getAll(name)
    switch (spec.kind) {
      case 'list': {
        const values = split(raw).map((value) => spec.read(value.trim()))
        state[name] = [...new Set(values.filter(nonNull))].slice(0, MAX_VALUES).sort()
        break
      }
      case 'one':
        state[name] =
          split(raw)
            .map((value) => spec.read(value.trim(), query))
            .find(nonNull) ?? null
        break
      case 'choice':
        state[name] =
          raw.map((value) => value.trim().toLowerCase()).find((v) => spec.values.includes(v)) ??
          spec.fallback
        break
      case 'text':
        state[name] = normaliseText(raw.join(' '), spec.maxLength)
        break
      case 'page': {
        const number = Number(raw.find((value) => /^\d{1,5}$/.test(value.trim())) ?? 1)
        state[name] = number >= 1 && number <= MAX_PAGE ? number : 1
        break
      }
    }
  }
  return state as FilterState<P>
}

/**
 * A value as the canonical URL writes it: percent-encoded as forms do (spaces as `+`, capital
 * hex), except commas, which stay readable (PLAN §2.4). Browsers send every character of this
 * form unchanged, so the canonical address never redirects to itself.
 */
function encode(value: string): string {
  return new URLSearchParams([['', value]]).toString().slice(1).replace(/%2C/g, ',')
}

/**
 * The canonical query string (without `?`): parameters in the configured order, list values
 * sorted, defaults and empty values left out.
 */
export function serializeFilters<P extends ParamSpecs>(
  { params }: FilterConfig<P>,
  state: FilterState<P>,
): string {
  const parts: string[] = []
  for (const [name, spec] of Object.entries(params)) {
    const value = (state as Record<string, unknown>)[name]
    let written = ''
    if (spec.kind === 'list') {
      written = [...new Set(value as string[])].sort().map(encode).join(',')
    } else if (spec.kind === 'page') {
      written = (value as number) > 1 ? String(value) : ''
    } else if (value !== (spec.kind === 'choice' ? spec.fallback : null)) {
      written = encode(value as string)
    }
    if (written) parts.push(`${name}=${written}`)
  }
  return parts.join('&')
}

/** The list's address with these filters, e.g. `/en/jobs/?type=phd`, or the bare list. */
export function filtersHref<P extends ParamSpecs>(config: FilterConfig<P>, state: FilterState<P>) {
  const query = serializeFilters(config, state)
  return query ? `${config.path}?${query}` : config.path
}

/** No filters, the default sort and view, page 1. */
export function emptyFilters<P extends ParamSpecs>({ params }: FilterConfig<P>): FilterState<P> {
  const state: Record<string, unknown> = {}
  for (const [name, spec] of Object.entries(params)) {
    state[name] =
      spec.kind === 'list'
        ? []
        : spec.kind === 'one'
          ? null
          : spec.kind === 'choice'
            ? spec.fallback
            : spec.kind === 'text'
              ? ''
              : 1
  }
  return state as FilterState<P>
}

/** Whether the list shows everything, in its default order and view, on page 1. */
export const isUnfiltered = <P extends ParamSpecs>(
  config: FilterConfig<P>,
  state: FilterState<P>,
) => serializeFilters(config, state) === ''

/** A filter value that is set, as a chip shows it. */
export type ActiveFilter<P extends ParamSpecs> = { name: FilterKey<P>; value: string }

/** The filter values that are set, in URL order. Sort, view and page are not filters. */
export function activeFilters<P extends ParamSpecs>(
  { params }: FilterConfig<P>,
  state: FilterState<P>,
): ActiveFilter<P>[] {
  return Object.entries(params).flatMap(([name, spec]) => {
    const value = (state as Record<string, unknown>)[name]
    if (spec.kind === 'list') return (value as string[]).map((v) => ({ name, value: v }))
    if ((spec.kind === 'one' || spec.kind === 'text') && value) return [{ name, value }]
    return []
  }) as ActiveFilter<P>[]
}

/** The same filters with `value` added (a list) or set (a single value), back on page 1. */
export function withValue<P extends ParamSpecs>(
  { params }: FilterConfig<P>,
  state: FilterState<P>,
  name: FilterKey<P>,
  value: string,
): FilterState<P> {
  const current = (state as Record<string, unknown>)[name]
  const next = params[name]?.kind === 'list' ? [...(current as string[]), value].sort() : value
  return { ...state, [name]: next, page: 1 }
}

/** The same filters without `value` (or without the parameter), back on page 1. */
export function withoutValue<P extends ParamSpecs>(
  { params }: FilterConfig<P>,
  state: FilterState<P>,
  name: FilterKey<P>,
  value?: string,
): FilterState<P> {
  const spec = params[name]
  const current = (state as Record<string, unknown>)[name]
  const next =
    spec?.kind === 'list'
      ? (current as string[]).filter((v) => value !== undefined && v !== value)
      : spec?.kind === 'text'
        ? ''
        : null
  return { ...state, [name]: next, page: 1 }
}

/** The same filters on page `n`. */
export const withPage = <P extends ParamSpecs>(state: FilterState<P>, n: number): FilterState<P> =>
  ({ ...state, page: n }) as FilterState<P>

// Links to the list, as full paths (`/en/jobs/?…`, or `/en/jobs/` without filters).

/** The list with `value` added (or set), on page 1. */
export const hrefWith = <P extends ParamSpecs>(
  config: FilterConfig<P>,
  state: FilterState<P>,
  name: FilterKey<P>,
  value: string,
) => filtersHref(config, withValue(config, state, name, value))

/** The list without `value` (or without the parameter), on page 1. */
export const hrefWithout = <P extends ParamSpecs>(
  config: FilterConfig<P>,
  state: FilterState<P>,
  name: FilterKey<P>,
  value?: string,
) => filtersHref(config, withoutValue(config, state, name, value))

/** "Clear all": the list with nothing kept, not even the sort order. */
export const clearAllHref = <P extends ParamSpecs>(config: FilterConfig<P>) =>
  filtersHref(config, emptyFilters(config))

/** The same filters on page `n`. */
export const pageHref = <P extends ParamSpecs>(
  config: FilterConfig<P>,
  state: FilterState<P>,
  n: number,
) => filtersHref(config, withPage(state, n))
