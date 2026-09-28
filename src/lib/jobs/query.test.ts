import type { Where } from 'payload'
import { describe, expect, it } from 'vitest'

import { parseJobFilters } from '@/lib/filters/jobs'

import {
  type FilterCountry,
  type FilterTerm,
  JOBS_PER_PAGE,
  JOBS_SORT,
  deadlineWhere,
  filterOptions,
  flatOptions,
  jobsWhere,
  locationCodes,
  openJobsWhere,
  termIds,
} from './query'

const parse = (query: string) => parseJobFilters(new URLSearchParams(query))
const NOW = new Date('2026-09-27T10:00:00.000Z')

const term = (
  id: number,
  vocabulary: string,
  slug: string,
  parent: number | null = null,
  group: FilterTerm['group'] = null,
): FilterTerm => ({ id, vocabulary, slug, label: slug.toUpperCase(), parent, group })

const TERMS: FilterTerm[] = [
  term(1, 'position-type', 'phd'),
  term(2, 'position-type', 'postdoc'),
  term(10, 'subfield', 'glia'),
  term(11, 'subfield', 'systems-circuits'),
  term(20, 'model-system', 'rodent'),
  term(21, 'model-system', 'mouse', 20),
  term(22, 'model-system', 'rat', 20),
  term(23, 'model-system', 'zebrafish'),
  term(30, 'method', 'electrophysiology', null, 'recording-imaging'),
  term(31, 'method', 'machine-learning', null, 'computational'),
  term(32, 'method', 'unsorted-method'),
  term(40, 'career-stage', 'student'),
  // The same slug in another vocabulary must not match.
  term(50, 'subfield', 'mouse'),
]

const COUNTRIES: FilterCountry[] = [
  { code: 'DE', name: 'Germany', region: 'europe' },
  { code: 'TR', name: 'Türkiye', region: 'asia' },
  { code: 'SE', name: 'Sweden', region: 'europe' },
  { code: 'US', name: 'United States', region: 'northern-america' },
  { code: 'XK', name: 'Kosovo', region: null },
]

const open = openJobsWhere(NOW)
const and = (where: Where | null) => (where as { and: Where[] }).and

describe('openJobsWhere', () => {
  it('matches published jobs whose fixed deadline has not ended, and open-ended ones', () => {
    expect(open).toEqual({
      and: [
        { status: { equals: 'published' } },
        {
          or: [
            { deadlineKind: { not_equals: 'fixed' } },
            { deadlineAt: { greater_than: '2026-09-27T10:00:00.000Z' } },
          ],
        },
      ],
    })
  })
})

describe('termIds', () => {
  it('resolves slugs in their own vocabulary, with descendants (rodent → mouse, rat)', () => {
    expect(termIds(parse('model=rodent&type=phd'), TERMS)).toEqual({
      model: [20, 21, 22],
      type: [1],
    })
    expect(termIds(parse('model=mouse'), TERMS)).toEqual({ model: [21] })
  })

  it('gives an empty list for a parameter whose slugs are all unknown or retired', () => {
    expect(termIds(parse('type=phd,astronaut&subfield=astrology'), TERMS)).toEqual({
      type: [1],
      subfield: [],
    })
  })

  it('leaves out parameters that are not set', () => {
    expect(termIds(parse(''), TERMS)).toEqual({})
  })
})

describe('locationCodes', () => {
  it('is null without location filters', () => {
    expect(locationCodes(parse('type=phd'), COUNTRIES)).toBeNull()
  })

  it('adds the countries of each region (with open jobs) to the chosen countries', () => {
    expect(locationCodes(parse('region=europe'), COUNTRIES)).toEqual(['DE', 'SE'])
    expect(locationCodes(parse('country=US&region=asia'), COUNTRIES)).toEqual(['TR', 'US'])
    expect(locationCodes(parse('country=DE&region=europe'), COUNTRIES)).toEqual(['DE', 'SE'])
  })

  it('gives an empty list for a region without open jobs', () => {
    expect(locationCodes(parse('region=oceania'), COUNTRIES)).toEqual([])
  })
})

describe('deadlineWhere', () => {
  const fixed = { deadlineKind: { equals: 'fixed' } }

  it('7d … 90d: closing within that many days from now, like the "Closing soon" badge', () => {
    expect(deadlineWhere('14d', NOW)).toEqual({
      and: [fixed, { deadlineAt: { less_than_equal: '2026-10-11T10:00:00.000Z' } }],
    })
    expect(deadlineWhere('90d', NOW)).toEqual({
      and: [fixed, { deadlineAt: { less_than_equal: '2026-12-26T10:00:00.000Z' } }],
    })
  })

  it('this-month: the deadline day falls in the current month', () => {
    expect(deadlineWhere('this-month', NOW)).toEqual({
      and: [
        fixed,
        { deadlineDate: { greater_than_equal: '2026-09-01T00:00:00.000Z' } },
        { deadlineDate: { less_than_equal: '2026-09-30T23:59:59.999Z' } },
      ],
    })
    // December rolls over into the next year.
    expect(and(deadlineWhere('this-month', new Date('2026-12-15T00:00:00Z')))[2]).toEqual({
      deadlineDate: { less_than_equal: '2026-12-31T23:59:59.999Z' },
    })
  })

  it('a range: the deadline day within it, both days included', () => {
    expect(deadlineWhere('2026-10-01..2026-10-31', NOW)).toEqual({
      and: [
        fixed,
        { deadlineDate: { greater_than_equal: '2026-10-01T00:00:00.000Z' } },
        { deadlineDate: { less_than_equal: '2026-10-31T23:59:59.999Z' } },
      ],
    })
  })

  it('a range up to the last day there is: bounded by that day, not the next (no such day)', () => {
    expect(and(deadlineWhere('2026-10-01..9999-12-31', NOW))[2]).toEqual({
      deadlineDate: { less_than_equal: '9999-12-31T23:59:59.999Z' },
    })
  })

  it('is null for anything else', () => {
    expect(deadlineWhere('15d', NOW)).toBeNull()
  })
})

describe('jobsWhere', () => {
  const resolve = (query: string) => {
    const filters = parse(query)
    return jobsWhere(
      filters,
      {
        terms: termIds(filters, TERMS),
        countries: locationCodes(filters, COUNTRIES),
        institutions: filters.institution.length > 0 ? [7] : null,
        search: filters.q ? [3, 5] : null,
      },
      NOW,
    )
  }

  it('is the open jobs alone without filters', () => {
    expect(resolve('')).toEqual({ and: [open] })
    expect(resolve('sort=newest&page=3&view=map')).toEqual({ and: [open] })
  })

  it('combines filters with AND, values of one filter with OR (as `in`)', () => {
    expect(resolve('model=rodent&type=phd,postdoc&country=DE&institution=05dxps055')).toEqual({
      and: [
        open,
        { modelSystems: { in: [20, 21, 22] } },
        { positionType: { in: [1, 2] } },
        { country: { in: ['DE'] } },
        { institution: { in: [7] } },
      ],
    })
  })

  it("adds the deadline, and the search's matches as IDs", () => {
    const where = resolve('deadline=7d&q=glia&subfield=glia')
    expect(and(where)).toHaveLength(4)
    expect(and(where)[1]).toEqual({ subfields: { in: [10] } })
    expect(and(where)[2]).toEqual(deadlineWhere('7d', NOW))
    expect(and(where)[3]).toEqual({ id: { in: [3, 5] } })
  })

  it('matches nothing (null) when the search found no position', () => {
    const filters = parse('q=nothing&type=phd')
    const resolved = { terms: termIds(filters, TERMS), countries: null, institutions: null }
    expect(jobsWhere(filters, { ...resolved, search: [] }, NOW)).toBeNull()
    expect(jobsWhere(filters, { ...resolved, search: [4] }, NOW)).not.toBeNull()
  })

  it('matches nothing (null) when a filter names nothing that exists', () => {
    expect(resolve('type=astronaut')).toBeNull()
    expect(resolve('region=oceania')).toBeNull()
    expect(
      jobsWhere(
        parse('institution=k3f9a'),
        { terms: {}, countries: null, institutions: [], search: null },
        NOW,
      ),
    ).toBeNull()
  })

  it('pages through 25 positions, in deadline or publication order', () => {
    expect(JOBS_PER_PAGE).toBe(25)
    expect(JOBS_SORT.deadline).toEqual(['deadlineAt', '-publishedAt', '-id'])
    expect(JOBS_SORT.newest).toEqual(['-publishedAt', '-id'])
  })
})

describe('filterOptions', () => {
  const collator = new Intl.Collator('en-GB')
  const options = filterOptions(TERMS, COUNTRIES, ['oceania', 'nowhere'], collator)

  it('keeps each vocabulary in its order, children under their parent', () => {
    expect(options.type.map((option) => option.value)).toEqual(['phd', 'postdoc'])
    expect(options.model).toEqual([
      {
        value: 'rodent',
        label: 'RODENT',
        children: [
          { value: 'mouse', label: 'MOUSE', children: [] },
          { value: 'rat', label: 'RAT', children: [] },
        ],
      },
      { value: 'zebrafish', label: 'ZEBRAFISH', children: [] },
    ])
    expect(flatOptions(options.model).map((option) => option.value)).toEqual([
      'rodent',
      'mouse',
      'rat',
      'zebrafish',
    ])
  })

  it('groups methods as PLAN §4.3 does, with ungrouped ones last', () => {
    expect(options.method.map(({ group, options: methods }) => [group, methods.length])).toEqual([
      ['recording-imaging', 1],
      ['computational', 1],
      [null, 1],
    ])
  })

  it('lists countries alphabetically, and the regions they are in plus the chosen ones', () => {
    expect(options.country.map((option) => option.label)).toEqual([
      'Germany',
      'Kosovo',
      'Sweden',
      'Türkiye',
      'United States',
    ])
    expect(options.region).toEqual(['northern-america', 'asia', 'europe', 'oceania'])
  })
})
