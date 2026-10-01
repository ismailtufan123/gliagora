import { describe, expect, it } from 'vitest'

import { MEGA_MENUS } from '@/lib/navigation'

import {
  JOB_FILTERS,
  type JobFilters,
  invalidDeadlineRange,
  jobFormValues,
  jobsHref,
  parseJobFilters,
} from './jobs'
import {
  activeFilters,
  emptyFilters,
  filtersHref,
  serializeFilters,
  withValue,
  withoutValue,
} from './model'

const parse = (query: string) => parseJobFilters(new URLSearchParams(query))
const canonical = (query: string) => serializeFilters(JOB_FILTERS, parse(query))

describe('the jobs filters (PLAN §2.4)', () => {
  it('read every parameter', () => {
    const filters = parse(
      [
        'subfield=glia',
        'method=electrophysiology',
        'model=rodent',
        'type=phd',
        'stage=phd-candidate',
        'country=DE',
        'region=europe',
        'deadline=30d',
        'institution=05dxps055',
        'q=calcium',
        'sort=newest',
        'view=map',
        'page=2',
      ].join('&'),
    )
    expect(filters).toEqual({
      subfield: ['glia'],
      method: ['electrophysiology'],
      model: ['rodent'],
      type: ['phd'],
      stage: ['phd-candidate'],
      country: ['DE'],
      region: ['europe'],
      deadline: '30d',
      institution: ['05dxps055'],
      q: 'calcium',
      prefs: 'on',
      sort: 'newest',
      view: 'map',
      page: 2,
    } satisfies JobFilters)
  })

  it('write them in the order of the §2.4 table', () => {
    expect(
      canonical(
        'page=2&view=map&sort=newest&q=calcium&institution=05dxps055&deadline=30d&region=europe&country=DE&stage=phd-candidate&type=phd&model=rodent&method=electrophysiology&subfield=glia',
      ),
    ).toBe(
      'subfield=glia&method=electrophysiology&model=rodent&type=phd&stage=phd-candidate&country=DE&region=europe&deadline=30d&institution=05dxps055&q=calcium&sort=newest&view=map&page=2',
    )
  })

  it('give the §2.4 example in its canonical form', () => {
    expect(
      canonical(
        'type=phd&subfield=systems-circuits,computational-theoretical&country=DE,NL&deadline=30d&view=map',
      ),
    ).toBe(
      'subfield=computational-theoretical,systems-circuits&type=phd&country=DE,NL&deadline=30d&view=map',
    )
  })

  it('lower-case slugs, regions and institution IDs, and upper-case country codes', () => {
    expect(
      parse('type=PhD&subfield=Glia&region=EUROPE&institution=05DXPS055&country=de,Nl'),
    ).toEqual({
      ...emptyFilters(JOB_FILTERS),
      subfield: ['glia'],
      type: ['phd'],
      region: ['europe'],
      institution: ['05dxps055'],
      country: ['DE', 'NL'],
    })
  })

  it('merge repeated parameters from a plain GET form', () => {
    expect(canonical('type=phd&type=msc&subfield=glia&type=phd')).toBe('subfield=glia&type=msc,phd')
  })

  it('drop values that cannot be right', () => {
    expect(
      parse(
        [
          'type=ph_d,-phd,phd-',
          'subfield=' + 'a'.repeat(65),
          'country=DEU,D,1A',
          'region=antarctica,americas',
          'institution=05dxps056,k3f9i,abc,https://ror.org/05dxps055',
          'deadline=15d',
          'sort=title',
          'view=grid',
          'page=0',
          'unknown=1',
          'utm_source=newsletter',
        ].join('&'),
      ),
    ).toEqual(emptyFilters(JOB_FILTERS))
  })

  it('accept an institution by ROR ID or by short ID', () => {
    expect(parse('institution=05dxps055,k3f9a').institution).toEqual(['05dxps055', 'k3f9a'])
  })

  it('read deadline windows, this month and ranges in order', () => {
    for (const value of ['7d', '14d', '30d', '90d', 'this-month', '2026-10-01..2026-12-31']) {
      expect(parse(`deadline=${value}`).deadline, value).toBe(value)
    }
    expect(parse('deadline=2026-10-01..2026-10-01').deadline).toBe('2026-10-01..2026-10-01')
    expect(parse('deadline=THIS-MONTH').deadline).toBe('this-month')
    for (const value of [
      '2026-12-31..2026-10-01',
      '2026-02-30..2026-03-01',
      '2026-10-01..',
      '..2026-10-01',
      '2026-10-01',
      '2026-10-01..2026-11-01..2026-12-01',
      '1d',
    ]) {
      expect(parse(`deadline=${value}`).deadline, value).toBeNull()
    }
  })

  it('take the range of the form: "Between these dates" with both days', () => {
    expect(
      canonical('deadline=range&deadline-from=2026-10-01&deadline-to=2026-12-31&type=phd'),
    ).toBe('type=phd&deadline=2026-10-01..2026-12-31')
    // One day missing, or in the wrong order: no deadline filter.
    expect(canonical('deadline=range&deadline-from=2026-10-01&deadline-to=')).toBe('')
    expect(canonical('deadline=range&deadline-from=2026-12-01&deadline-to=2026-10-01')).toBe('')
    // Another choice ignores the dates; "Any deadline" sends an empty value.
    expect(canonical('deadline=14d&deadline-from=2026-10-01&deadline-to=2026-12-31')).toBe(
      'deadline=14d',
    )
    expect(canonical('deadline=&deadline-from=2026-10-01&deadline-to=2026-12-31')).toBe('')
  })

  it('find the days of a range with a mistake, to show them again with an error', () => {
    const invalid = (query: string) => invalidDeadlineRange(new URLSearchParams(query))
    expect(invalid('deadline=range&deadline-from=2026-10-01&deadline-to=')).toEqual({
      from: '2026-10-01',
      to: '',
    })
    expect(invalid('deadline=range&deadline-from=2026-12-01&deadline-to=2026-10-01')).toEqual({
      from: '2026-12-01',
      to: '2026-10-01',
    })
    expect(invalid('deadline=range&deadline-from=2026-02-30&deadline-to=<b>')).toEqual({
      from: '',
      to: '',
    })
    expect(invalid('deadline=range')).toEqual({ from: '', to: '' })
    // A range in order, or another choice, is no mistake.
    expect(invalid('deadline=range&deadline-from=2026-10-01&deadline-to=2026-10-01')).toBeNull()
    expect(invalid('deadline=14d&deadline-from=2026-12-01&deadline-to=2026-10-01')).toBeNull()
    expect(invalid('deadline=&deadline-from=2026-10-01')).toBeNull()
  })

  it('leave out the defaults the form always sends', () => {
    expect(
      canonical('q=&type=phd&deadline=&deadline-from=&deadline-to=&sort=deadline&view=list&page=1'),
    ).toBe('type=phd')
  })

  it('keep free text readable and short', () => {
    expect(canonical('q=++Calcium++imaging,+2P++')).toBe('q=Calcium+imaging,+2P')
    expect(parse(`q=${'x'.repeat(150)}`).q).toHaveLength(100)
  })
})

describe('jobsHref', () => {
  it('gives canonical links to the list', () => {
    expect(jobsHref()).toBe('/en/jobs/')
    expect(jobsHref({ type: ['phd'], subfield: ['glia'] })).toBe('/en/jobs/?subfield=glia&type=phd')
    expect(jobsHref({ institution: ['056d84691'] })).toBe('/en/jobs/?institution=056d84691')
    expect(jobsHref({ method: ['optical-imaging'], type: [] })).toBe(
      '/en/jobs/?method=optical-imaging',
    )
  })

  it('matches the header menu links, which need no redirect', () => {
    const withQuery = MEGA_MENUS.jobs.filter((item) => item.href.includes('?'))
    expect(withQuery.length).toBeGreaterThan(6)
    for (const { href } of withQuery) {
      const [path, query = ''] = href.split('?')
      expect(path).toBe(JOB_FILTERS.path)
      expect(filtersHref(JOB_FILTERS, parse(query)), href).toBe(href)
    }
  })
})

describe('jobFormValues', () => {
  it('gives what the form shows for the filters, field by field', () => {
    const values = jobFormValues(parse('type=phd,msc&deadline=14d&q=glia&sort=newest'))
    expect(values).toMatchObject({
      type: ['msc', 'phd'],
      subfield: [],
      deadline: ['14d'],
      'deadline-from': [''],
      'deadline-to': [''],
      q: ['glia'],
      sort: ['newest'],
    })
  })

  it('chooses "Between these dates" for a range, with its days', () => {
    expect(jobFormValues(parse('deadline=2026-10-01..2026-12-31'))).toMatchObject({
      deadline: ['range'],
      'deadline-from': ['2026-10-01'],
      'deadline-to': ['2026-12-31'],
    })
    expect(jobFormValues(parse('')).deadline).toEqual([''])
  })

  it('reads back to the same filters when the form is sent', () => {
    for (const query of [
      'subfield=glia&type=msc,phd&deadline=2026-10-01..2026-12-31&q=two+words&sort=newest',
      'country=DE&region=asia&deadline=this-month',
    ]) {
      const filters = parse(query)
      const sent = new URLSearchParams(
        Object.entries(jobFormValues(filters)).flatMap(([name, values]) =>
          values.map((value) => [name, value]),
        ),
      )
      expect(parseJobFilters(sent), query).toEqual(filters)
    }
  })
})

describe('adding and removing values', () => {
  it('keeps the address canonical', () => {
    const filters = parse('type=phd&country=NL')
    expect(filtersHref(JOB_FILTERS, withValue(JOB_FILTERS, filters, 'country', 'DE'))).toBe(
      '/en/jobs/?type=phd&country=DE,NL',
    )
    expect(filtersHref(JOB_FILTERS, withoutValue(JOB_FILTERS, filters, 'type', 'phd'))).toBe(
      '/en/jobs/?country=NL',
    )
    expect(
      filtersHref(JOB_FILTERS, withoutValue(JOB_FILTERS, parse('deadline=7d'), 'deadline')),
    ).toBe('/en/jobs/')
  })
})

describe('prefs: all positions instead of a member’s preferred subfields (D35)', () => {
  it('reads `off`, and leaves out the default', () => {
    expect(parse('prefs=off').prefs).toBe('off')
    expect(parse('prefs=OFF').prefs).toBe('off')
    expect(parse('prefs=on').prefs).toBe('on')
    expect(parse('prefs=maybe').prefs).toBe('on')
    expect(canonical('prefs=on')).toBe('')
    expect(canonical('prefs=off')).toBe('prefs=off')
  })

  it('is not a filter: no chip, and the list is still without filters', () => {
    expect(activeFilters(JOB_FILTERS, parse('prefs=off'))).toEqual([])
  })

  it('is kept only while no filter is set', () => {
    expect(parse('prefs=off&type=phd').prefs).toBe('on')
    expect(canonical('prefs=off&type=phd')).toBe('type=phd')
    expect(canonical('prefs=off&q=calcium')).toBe('q=calcium')
    expect(canonical('prefs=off&deadline=14d')).toBe('deadline=14d')
    // Sorting, the view and the page are not filters.
    expect(canonical('page=2&view=map&sort=newest&prefs=off')).toBe(
      'prefs=off&sort=newest&view=map&page=2',
    )
  })

  it('stands after q and before sort in the canonical order', () => {
    expect(canonical('sort=newest&prefs=off')).toBe('prefs=off&sort=newest')
  })

  it('is dropped by links that keep a filter, and kept by links back to the bare list', () => {
    expect(jobsHref({ prefs: 'off' })).toBe('/en/jobs/?prefs=off')
    expect(jobsHref({ prefs: 'off', type: ['phd'] })).toBe('/en/jobs/?type=phd')
    const member = { ...parse('subfield=cognitive,glia'), prefs: 'off' as const }
    expect(filtersHref(JOB_FILTERS, withoutValue(JOB_FILTERS, member, 'subfield', 'glia'))).toBe(
      '/en/jobs/?subfield=cognitive',
    )
    const last = withoutValue(JOB_FILTERS, { ...member, subfield: ['glia'] }, 'subfield', 'glia')
    expect(filtersHref(JOB_FILTERS, last)).toBe('/en/jobs/?prefs=off')
  })

  it('is not one of the filter form’s values: its hidden input keeps its own', () => {
    expect(jobFormValues(parse('prefs=off'))).not.toHaveProperty('prefs')
  })
})
