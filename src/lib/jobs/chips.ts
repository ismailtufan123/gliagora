import { JOB_FILTERS, type JobFilters, type TermParam } from '@/lib/filters/jobs'
import { type FilterKey, activeFilters, hrefWithout, withoutValue } from '@/lib/filters/model'
import { type DeadlineFilter, deadlineFilter, readRegion } from '@/lib/filters/values'
import type { Region } from '@/lib/geography'

import { type FilterOption, type JobFilterOptions, flatOptions } from './query'

// The chips of the jobs list (PLAN §3.2, §7.5): one per filter value that is set and known, each
// a link to the list without that value. Unknown values (a slug that names no active term, a
// country or institution that does not exist) get no chip: they match nothing, so every chip and
// the form drop them (the form keeps only the known filters).

export type JobChip = {
  name: FilterKey<typeof JOB_FILTERS.params>
  value: string
  label: string
  /** The list without this value, back on page 1. */
  href: string
}

/** Words the chips need from the messages. */
export type ChipLabels = {
  region: (region: Region) => string
  deadline: (deadline: DeadlineFilter) => string
  search: (q: string) => string
}

const labelsOf = (options: readonly FilterOption[]) =>
  new Map(flatOptions(options).map((option) => [option.value, option.label]))

/**
 * The chips for the filters, and the filters without the values that name nothing (`known`),
 * from which the chips' links, the form and the empty state's way back are built.
 */
export function jobChips(
  filters: JobFilters,
  found: { options: JobFilterOptions; institutions: { id: string; name: string }[] },
  labels: ChipLabels,
): { chips: JobChip[]; known: JobFilters } {
  const { options } = found
  const terms: Record<TermParam, Map<string, string>> = {
    subfield: labelsOf(options.subfield),
    method: labelsOf(options.method.flatMap((group) => group.options)),
    model: labelsOf(options.model),
    type: labelsOf(options.type),
    stage: labelsOf(options.stage),
  }
  const countries = labelsOf(options.country)
  const labelOf = (name: JobChip['name'], value: string): string | undefined => {
    switch (name) {
      case 'country':
        return countries.get(value)
      case 'region': {
        const region = readRegion(value)
        return region ? labels.region(region) : undefined
      }
      case 'deadline': {
        const deadline = deadlineFilter(value)
        return deadline ? labels.deadline(deadline) : undefined
      }
      case 'institution':
        return found.institutions.find((institution) => institution.id === value)?.name
      case 'q':
        return labels.search(value)
      default:
        return terms[name].get(value)
    }
  }
  const labelled = activeFilters(JOB_FILTERS, filters).map((active) => ({
    ...active,
    label: labelOf(active.name, active.value),
  }))
  const known = labelled.reduce(
    (state, { name, value, label }) =>
      label ? state : withoutValue(JOB_FILTERS, state, name, value),
    filters,
  )
  const chips = labelled.flatMap(({ name, value, label }) =>
    label ? [{ name, value, label, href: hrefWithout(JOB_FILTERS, known, name, value) }] : [],
  )
  return { chips, known }
}
