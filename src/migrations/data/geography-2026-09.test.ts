import { describe, expect, it } from 'vitest'

import { COUNTRIES_2026_09 as COUNTRIES, COUNTRY_SETS_2026_09 as SETS } from './geography-2026-09'

// The seed is frozen, so this test checks it against the M49 grouping as of 2026-09, not against
// the current lists in src/lib/geography.ts.
const CODE = /^[A-Z]{2}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const REGION_OF_SUBREGION: Record<string, string> = {
  'northern-africa': 'africa',
  'eastern-africa': 'africa',
  'middle-africa': 'africa',
  'southern-africa': 'africa',
  'western-africa': 'africa',
  caribbean: 'latin-america-caribbean',
  'central-america': 'latin-america-caribbean',
  'south-america': 'latin-america-caribbean',
  'central-asia': 'asia',
  'eastern-asia': 'asia',
  'south-eastern-asia': 'asia',
  'southern-asia': 'asia',
  'western-asia': 'asia',
  'eastern-europe': 'europe',
  'northern-europe': 'europe',
  'southern-europe': 'europe',
  'western-europe': 'europe',
  'australia-new-zealand': 'oceania',
  melanesia: 'oceania',
  micronesia: 'oceania',
  polynesia: 'oceania',
}
const REGIONS = new Set([...Object.values(REGION_OF_SUBREGION), 'northern-america'])

const codes = new Set(COUNTRIES.map((country) => country.code))
const set = (slug: string) => {
  const found = SETS.find((s) => s.slug === slug)
  if (!found) throw new Error(`No set ${slug}`)
  return new Set(found.countries)
}

describe('countries (PLAN §4.6)', () => {
  it('lists every UN M49 country or area once, plus Kosovo and Taiwan', () => {
    // 248 codes in the M49 list of 2026-09-27, plus XK and TW.
    expect(COUNTRIES).toHaveLength(250)
    expect(codes.size).toBe(250)
    for (const code of ['TR', 'DE', 'US', 'XK', 'TW', 'NA', 'AQ'])
      expect(codes.has(code), code).toBe(true)
    for (const country of COUNTRIES) expect(country.code).toMatch(CODE)
  })

  it('places every country in a region, except Antarctica', () => {
    expect(REGIONS.size).toBe(6)
    for (const country of COUNTRIES) {
      if (country.code === 'AQ') expect(country.region).toBeNull()
      else expect(REGIONS.has(country.region ?? ''), country.code).toBe(true)
    }
  })

  it('puts every sub-region inside its region', () => {
    for (const country of COUNTRIES) {
      if (country.subregion) {
        expect(REGION_OF_SUBREGION[country.subregion], country.code).toBe(country.region)
      }
    }
    // Northern America has no finer M49 level.
    expect(COUNTRIES.find((c) => c.code === 'US')).toMatchObject({
      region: 'northern-america',
      subregion: null,
    })
  })

  it('splits the Americas as the region filter does', () => {
    expect(COUNTRIES.find((c) => c.code === 'MX')?.region).toBe('latin-america-caribbean')
    expect(COUNTRIES.find((c) => c.code === 'CA')?.region).toBe('northern-america')
  })

  it('names every country in English and Turkish', () => {
    for (const country of COUNTRIES) {
      expect(country.name.en.trim(), country.code).not.toBe('')
      expect(country.name.tr.trim(), country.code).not.toBe('')
      expect(country.name.en, country.code).not.toBe(country.code)
    }
    expect(COUNTRIES.find((c) => c.code === 'TR')?.name).toEqual({ en: 'Türkiye', tr: 'Türkiye' })
    expect(COUNTRIES.find((c) => c.code === 'DE')?.name).toEqual({ en: 'Germany', tr: 'Almanya' })
  })
})

describe('country sets (PLAN §4.6)', () => {
  it('has the four sets of the plan, each with a source and the date it was checked', () => {
    expect(SETS.map((s) => s.slug)).toEqual([
      'eu27',
      'horizon-europe-associated',
      'embc-members',
      'world-bank-lmic',
    ])
    for (const s of SETS) {
      expect(s.slug).toMatch(SLUG)
      expect(s.sourceUrl).toMatch(/^https:\/\//)
      expect(s.lastVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(s.verificationNote).not.toBe('')
    }
  })

  it('uses only known country codes, each once', () => {
    for (const s of SETS) {
      expect(new Set(s.countries).size, s.slug).toBe(s.countries.length)
      for (const code of s.countries) expect(codes.has(code), `${s.slug}: ${code}`).toBe(true)
    }
  })

  it('has the sizes of the sources checked on 2026-09-27', () => {
    expect(set('eu27').size).toBe(27)
    expect(set('horizon-europe-associated').size).toBe(19)
    expect(set('embc-members').size).toBe(32)
    expect(set('world-bank-lmic').size).toBe(131)
  })

  it('keeps EU members and Pillar-II-only countries out of the Horizon Europe set', () => {
    const associated = set('horizon-europe-associated')
    for (const code of set('eu27')) expect(associated.has(code), code).toBe(false)
    for (const code of ['CA', 'JP', 'KR', 'NZ', 'MA'])
      expect(associated.has(code), code).toBe(false)
    for (const code of ['TR', 'GB', 'CH', 'NO', 'IL', 'UA', 'XK'])
      expect(associated.has(code), code).toBe(true)
  })

  it('has no high-income economies among the low- and middle-income ones', () => {
    const lmic = set('world-bank-lmic')
    for (const code of ['US', 'DE', 'JP', 'GB', 'CH', 'SA'])
      expect(lmic.has(code), code).toBe(false)
    for (const code of ['TR', 'IN', 'NG', 'BR', 'XK']) expect(lmic.has(code), code).toBe(true)
  })
})
