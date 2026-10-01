import { describe, expect, it } from 'vitest'

import { JOB_FILTERS, jobsHref, parseJobFilters } from '@/lib/filters/jobs'
import { emptyFilters, filtersHref, serializeFilters } from '@/lib/filters/model'

import { preferredView } from './preferred'

// D35: a member's preferred subfields as the jobs list's default filter (src/lib/jobs/preferred.ts).

const parse = (query: string) => parseJobFilters(new URLSearchParams(query))
const PREFERRED = ['glia', 'cognitive']

describe('preferredView', () => {
  it('applies the preferred subfields to the bare list only', () => {
    const view = preferredView(parse(''), PREFERRED)
    expect(view.applied).toEqual(['cognitive', 'glia'])
    expect(view.effective.subfield).toEqual(['cognitive', 'glia'])
    expect(view.escape).toBe(true)
    // Sorting, the view and the page leave the list bare.
    for (const query of ['sort=newest', 'view=map', 'page=2', 'sort=newest&view=map&page=3']) {
      expect(preferredView(parse(query), PREFERRED).applied, query).toEqual(['cognitive', 'glia'])
    }
  })

  it('never applies to a list with a filter, to prefs=off, or to a visitor without preferences', () => {
    for (const query of [
      'type=phd',
      'subfield=motor',
      'q=calcium',
      'deadline=this-month',
      'institution=05dxps055',
      // A value that names nothing is still a filter: the link means the same for everyone.
      'type=no-such-type',
      'prefs=off',
    ]) {
      const view = preferredView(parse(query), PREFERRED)
      expect(view.applied, query).toBeNull()
      expect(view.effective, query).toEqual(parse(query))
    }
    expect(preferredView(parse(''), []).applied).toBeNull()
    expect(preferredView(parse(''), PREFERRED, { shownAsSent: true }).applied).toBeNull()
  })

  it('gives a member with preferences links that never lead back to the default', () => {
    const { links, effective } = preferredView(parse(''), PREFERRED)
    // A page of the default list keeps its subfields; the address stays canonical.
    expect(filtersHref(JOB_FILTERS, { ...links, page: 2 })).toBe(
      '/en/jobs/?subfield=cognitive,glia&page=2',
    )
    // "Clear all": all positions.
    expect(filtersHref(JOB_FILTERS, { ...emptyFilters(JOB_FILTERS), prefs: links.prefs })).toBe(
      '/en/jobs/?prefs=off',
    )
    // What the list shows, for the filter form's script.
    expect(serializeFilters(JOB_FILTERS, effective)).toBe('subfield=cognitive,glia')
    // On a filtered list too: removing its last filter shows all positions.
    const filtered = preferredView(parse('type=phd'), PREFERRED)
    expect(filtersHref(JOB_FILTERS, { ...filtered.links, type: [] })).toBe('/en/jobs/?prefs=off')
    expect(filtersHref(JOB_FILTERS, filtered.links)).toBe('/en/jobs/?type=phd')
  })

  it('leaves the links of everyone else as they were', () => {
    for (const query of ['', 'type=phd', 'prefs=off']) {
      const { links, escape } = preferredView(parse(query), [])
      expect(escape).toBe(false)
      expect(filtersHref(JOB_FILTERS, { ...emptyFilters(JOB_FILTERS), prefs: links.prefs })).toBe(
        jobsHref(),
      )
    }
  })
})
