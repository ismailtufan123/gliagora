import { describe, expect, it } from 'vitest'

import { type JobFilters, parseJobFilters } from '@/lib/filters/jobs'

import { jobChips } from './chips'
import { type FilterCountry, type FilterTerm, filterOptions } from './query'

const TERMS: FilterTerm[] = [
  { id: 1, vocabulary: 'position-type', slug: 'phd', label: 'PhD', parent: null, group: null },
  { id: 2, vocabulary: 'model-system', slug: 'rodent', label: 'Rodent', parent: null, group: null },
  { id: 3, vocabulary: 'model-system', slug: 'mouse', label: 'Mouse', parent: 2, group: null },
  {
    id: 4,
    vocabulary: 'method',
    slug: 'electrophysiology',
    label: 'Electrophysiology',
    parent: null,
    group: 'recording-imaging',
  },
]
const COUNTRIES: FilterCountry[] = [{ code: 'DE', name: 'Germany', region: 'europe' }]

const jobChipsOf = (filters: JobFilters) =>
  jobChips(
    filters,
    {
      options: filterOptions(TERMS, COUNTRIES, filters.region, new Intl.Collator('en')),
      institutions: [{ id: '05dxps055', name: 'California Institute of Technology' }],
    },
    {
      region: (region) => `region:${region}`,
      deadline: (deadline) => `deadline:${deadline.kind}`,
      search: (q) => `search:${q}`,
    },
  )

const chipsFor = (query: string) => jobChipsOf(parseJobFilters(new URLSearchParams(query))).chips

describe('jobChips', () => {
  it('gives one chip per known value, in URL order, each removing only itself', () => {
    const chips = chipsFor(
      'model=mouse&method=electrophysiology&type=phd&country=DE&region=asia&deadline=14d&institution=05dxps055&q=glia&sort=newest&page=2',
    )
    expect(chips.map((chip) => [chip.label, chip.href])).toEqual([
      [
        'Electrophysiology',
        '/en/jobs/?model=mouse&type=phd&country=DE&region=asia&deadline=14d&institution=05dxps055&q=glia&sort=newest',
      ],
      [
        'Mouse',
        '/en/jobs/?method=electrophysiology&type=phd&country=DE&region=asia&deadline=14d&institution=05dxps055&q=glia&sort=newest',
      ],
      [
        'PhD',
        '/en/jobs/?method=electrophysiology&model=mouse&country=DE&region=asia&deadline=14d&institution=05dxps055&q=glia&sort=newest',
      ],
      [
        'Germany',
        '/en/jobs/?method=electrophysiology&model=mouse&type=phd&region=asia&deadline=14d&institution=05dxps055&q=glia&sort=newest',
      ],
      [
        'region:asia',
        '/en/jobs/?method=electrophysiology&model=mouse&type=phd&country=DE&deadline=14d&institution=05dxps055&q=glia&sort=newest',
      ],
      [
        'deadline:within',
        '/en/jobs/?method=electrophysiology&model=mouse&type=phd&country=DE&region=asia&institution=05dxps055&q=glia&sort=newest',
      ],
      [
        'California Institute of Technology',
        '/en/jobs/?method=electrophysiology&model=mouse&type=phd&country=DE&region=asia&deadline=14d&q=glia&sort=newest',
      ],
      [
        'search:glia',
        '/en/jobs/?method=electrophysiology&model=mouse&type=phd&country=DE&region=asia&deadline=14d&institution=05dxps055&sort=newest',
      ],
    ])
  })

  it('gives no chip for values that name nothing', () => {
    expect(
      chipsFor('type=astronaut,phd&country=ZZ&institution=k3f9a').map((chip) => chip.label),
    ).toEqual(['PhD'])
  })

  it('removes the last value of a filter entirely', () => {
    expect(chipsFor('type=phd')[0]?.href).toBe('/en/jobs/')
  })

  it('drops the values that name nothing from every chip link and from the known filters', () => {
    const filters = parseJobFilters(
      new URLSearchParams('model=mouse&type=astronaut&country=ZZ&institution=k3f9a&sort=newest'),
    )
    const { chips, known } = jobChipsOf(filters)
    expect(chips.map((chip) => [chip.label, chip.href])).toEqual([
      ['Mouse', '/en/jobs/?sort=newest'],
    ])
    expect(known).toEqual({ ...filters, type: [], country: [], institution: [], page: 1 })
    // Nothing unknown: the filters as they are, on their page.
    const all = parseJobFilters(new URLSearchParams('type=phd&page=2'))
    expect(jobChipsOf(all).known).toBe(all)
  })
})
