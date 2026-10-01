import { describe, expect, it } from 'vitest'

import { emptyFilters } from '@/lib/filters/model'
import { JOB_FILTERS, parseJobFilters } from '@/lib/filters/jobs'
import type { JobCard } from '@/lib/jobs/view'
import type { MapInstitution } from '@/lib/records'

import { type MapTexts, mapJson, mapQuery } from './data'

const texts: MapTexts = {
  place: (city, country) => `${city}, ${country}`,
  closes: (date) => `Closes ${date}`,
  daysLeft: (days) => `${days} days left`,
  lastDay: 'Last day',
  closed: 'Closed',
  rolling: 'Rolling deadline',
  untilFilled: 'Open until filled',
}

const NOW = new Date('2026-10-01T12:00:00Z')

const job = (title: string, facts: Partial<JobCard> = {}): JobCard =>
  ({
    id: 1,
    shortId: 'abcde',
    status: 'published',
    path: `/en/jobs/${title.toLowerCase().replaceAll(' ', '-')}-abcde/`,
    title,
    originalLanguage: 'en',
    institution: null,
    city: null,
    country: null,
    positionType: null,
    subfields: [],
    methods: [],
    modelSystems: [],
    originalUrl: null,
    deadlineKind: 'fixed',
    deadlineDate: '2026-10-11T12:00:00.000Z',
    deadlineTz: 'Europe/Berlin',
    ...facts,
  }) as JobCard

const institution = (facts: Partial<MapInstitution> = {}): MapInstitution => ({
  id: 7,
  key: '05dxps055',
  name: 'Example Institute',
  city: 'Berlin',
  country: 'Germany',
  lng: 13.4049541234,
  lat: 52.5200066789,
  path: '/en/institutions/example-institute-05dxps055/',
  website: 'https://example.org/',
  rorId: '05dxps055',
  jobs: [job('PhD in glia'), job('Postdoc in circuits', { deadlineKind: 'rolling' })],
  ...facts,
})

describe('mapJson', () => {
  const filters = parseJobFilters(new URLSearchParams('type=phd&page=3&sort=newest'))

  it('makes a pin per institution, with its count, rounded to about a metre', () => {
    const json = mapJson({ institutions: [institution()], unmapped: 2 }, filters, NOW, 'en', texts)
    expect(json.type).toBe('FeatureCollection')
    expect(json.features).toEqual([
      {
        type: 'Feature',
        id: 7,
        geometry: { type: 'Point', coordinates: [13.40495, 52.52001] },
        properties: { id: 7, jobs: 2 },
      },
    ])
    expect(json.total).toBe(2)
    expect(json.unmapped).toBe(2)
  })

  it('puts the panel in words, with the list of this institution under the same filters', () => {
    const info = mapJson({ institutions: [institution()], unmapped: 0 }, filters, NOW, 'en', texts)
      .institutions['7']
    expect(info).toMatchObject({
      key: '05dxps055',
      name: 'Example Institute',
      place: 'Berlin, Germany',
      ror: 'https://ror.org/05dxps055',
      // The filters and the order stay; the page starts again.
      listPath: '/en/jobs/?type=phd&institution=05dxps055&sort=newest',
    })
    expect(info?.jobs).toEqual([
      {
        title: 'PhD in glia',
        path: '/en/jobs/phd-in-glia-abcde/',
        deadline: 'Closes 11 Oct 2026, 11 days left',
        soon: true,
      },
      {
        title: 'Postdoc in circuits',
        path: '/en/jobs/postdoc-in-circuits-abcde/',
        deadline: 'Rolling deadline',
        soon: false,
      },
    ])
  })

  it('names whichever of city and country is known, and no ROR link without a ROR ID', () => {
    const info = mapJson(
      { institutions: [institution({ city: null, rorId: null, key: 'ab12c' })], unmapped: 0 },
      filters,
      NOW,
      'en',
      texts,
    ).institutions['7']
    expect(info?.place).toBe('Germany')
    expect(info?.ror).toBeNull()
  })

  it('leaves out institutions without matching positions', () => {
    const json = mapJson(
      { institutions: [institution({ jobs: [] })], unmapped: 0 },
      filters,
      NOW,
      'en',
      texts,
    )
    expect(json.features).toEqual([])
    expect(json.institutions).toEqual({})
  })
})

describe('mapQuery', () => {
  it('keys an answer by the filters only, in their canonical order', () => {
    const a = parseJobFilters(new URLSearchParams('country=NL,DE&type=phd&sort=newest&page=2'))
    const b = parseJobFilters(new URLSearchParams('type=phd&country=DE&country=NL&view=map'))
    expect(mapQuery(a)).toBe('type=phd&country=DE,NL')
    expect(mapQuery(b)).toBe(mapQuery(a))
    expect(mapQuery(emptyFilters(JOB_FILTERS))).toBe('')
  })
})
