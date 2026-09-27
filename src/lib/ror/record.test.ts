import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { fromRorRecord } from './record'

// 21 real records from ROR release v2.13 (CC0), chosen to cover the cases below.
const SAMPLE = JSON.parse(
  readFileSync(
    new URL('../../../tests/fixtures/ror/v2.13-2026-09-22-ror-data-sample.json', import.meta.url),
    'utf8',
  ),
) as { id: string }[]
const record = (id: string) => {
  const found = SAMPLE.find((r) => r.id === `https://ror.org/${id}`)
  if (!found) throw new Error(`No fixture record ${id}`)
  return structuredClone(found) as Record<string, unknown>
}

describe('fromRorRecord', () => {
  it('maps a full record', () => {
    expect(fromRorRecord(record('05dxps055'))).toEqual({
      rorId: '05dxps055',
      name: 'California Institute of Technology',
      aliases: ['CIT', 'Caltech', 'Instituto de Tecnología de California'],
      types: ['education', 'funder'],
      status: 'active',
      countryCode: 'US',
      city: 'Pasadena',
      lat: 34.14778,
      lng: -118.14452,
      website: 'https://www.caltech.edu/',
      rorLastModified: '2025-05-05',
    })
  })

  it('maps every sample record', () => {
    for (const r of SAMPLE) expect(fromRorRecord(r), r.id).not.toBeNull()
  })

  it('keeps Turkish and non-Latin names as they are', () => {
    expect(fromRorRecord(record('00jzwgz36'))?.name).toBe('Koç University')
    expect(fromRorRecord(record('04pmxyf70'))?.name).toBe('新疆工业职业技术大学')
  })

  it('uses the first of several locations', () => {
    expect(fromRorRecord(record('03m6ee736'))).toMatchObject({ countryCode: 'US' })
  })

  it('keeps Taiwan and Kosovo codes (not in UN M49, used by ROR)', () => {
    expect(fromRorRecord(record('00zdnkx70'))?.countryCode).toBe('TW')
    expect(fromRorRecord(record('005tw0h26'))?.countryCode).toBe('XK')
  })

  it('keeps inactive and withdrawn statuses', () => {
    expect(fromRorRecord(record('04yw47259'))?.status).toBe('inactive')
    expect(fromRorRecord(record('03ybx0x41'))?.status).toBe('withdrawn')
  })

  it('leaves the website empty when the record has none, or only an invalid one', () => {
    expect(fromRorRecord(record('037mpqg03'))?.website).toBeNull()
    const r = record('05dxps055')
    r.links = [
      { type: 'website', value: 'javascript:alert(1)' },
      { type: 'website', value: 'not a url' },
    ]
    expect(fromRorRecord(r)?.website).toBeNull()
  })

  it('does not repeat the display name or duplicates among the aliases', () => {
    const r = record('05dxps055')
    r.names = [
      { value: 'Example University', types: ['ror_display', 'label'], lang: 'en' },
      { value: 'example university', types: ['alias'], lang: null },
      { value: 'EU', types: ['acronym'], lang: null },
      { value: 'EU', types: ['alias'], lang: null },
      { value: ' ', types: ['alias'], lang: null },
    ]
    expect(fromRorRecord(r)?.aliases).toEqual(['EU'])
  })

  it('drops coordinates out of range and unknown types', () => {
    const r = record('05dxps055')
    r.locations = [{ geonames_details: { country_code: 'us', name: 'X', lat: 91, lng: 'x' } }]
    r.types = ['education', 'spaceport']
    expect(fromRorRecord(r)).toMatchObject({
      countryCode: 'US',
      lat: null,
      lng: null,
      types: ['education'],
    })
  })

  it.each([
    ['an invalid ROR ID', { id: 'https://ror.org/05dxps056' }],
    ['no display name', { names: [{ value: 'X', types: ['label'] }] }],
    ['an unknown status', { status: 'deleted' }],
    ['no modification date', { admin: {} }],
  ])('rejects a record with %s', (_, change) => {
    expect(fromRorRecord({ ...record('05dxps055'), ...change })).toBeNull()
  })

  it('rejects values that are not records', () => {
    expect(fromRorRecord(null)).toBeNull()
    expect(fromRorRecord('x')).toBeNull()
  })
})
