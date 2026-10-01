import { JOB_FILTERS, type JobFilters } from '@/lib/filters/jobs'
import { activeFilters } from '@/lib/filters/model'

// D35, the default subfield filter (PLAN §2.4, §3.2; the M4b design §4): a signed-in member's
// preferred subfields apply to the jobs list when it is opened without filters (the "bare" list:
// sorting, the view, the page and campaign tags are not filters), unless the address says
// `prefs=off`. The address stays as it is, and so does everything shared: a link with any filter
// shows the same list to everyone, and signed-out visitors and crawlers never see a default.
//
// No trap: for a member with preferences, every link the page builds says `prefs=off` where it
// leads back to the bare list ("Clear all", the chip that removes the last filter, the empty
// state's "Clear all"), so removing the default's subfields shows all positions rather than the
// default again; the filter model drops `prefs` wherever a filter remains, so other links stay as
// they were. The filter form carries the same `prefs=off` in a hidden input.

export type PreferredView = {
  /** What the page shows and queries: the filters, with the preferred subfields if they apply. */
  effective: JobFilters
  /** What the page's links start from: `effective`, with `prefs=off` for a member with preferences. */
  links: JobFilters
  /** The preferred subfields the page applies (the notice names them), or null. */
  applied: string[] | null
  /** Whether the member has preferences: the filter form then says `prefs=off`. */
  escape: boolean
}

/**
 * The jobs list's filters for a request, given the member's active preferred subfields (none for a
 * visitor who is signed out). `shownAsSent`: the request is shown as it was sent, with an error
 * (a range of days with a mistake), so it is not the bare list either.
 */
export function preferredView(
  filters: JobFilters,
  preferred: readonly string[],
  { shownAsSent = false }: { shownAsSent?: boolean } = {},
): PreferredView {
  const escape = preferred.length > 0
  const bare = activeFilters(JOB_FILTERS, filters).length === 0 && !shownAsSent
  const applies = escape && bare && filters.prefs !== 'off'
  const effective: JobFilters = applies
    ? { ...filters, subfield: [...preferred].sort(), prefs: 'on' }
    : filters
  return {
    effective,
    links: { ...effective, prefs: escape ? 'off' : 'on' },
    applied: applies ? effective.subfield : null,
    escape,
  }
}
