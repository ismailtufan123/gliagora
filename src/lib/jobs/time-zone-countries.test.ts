import { describe, expect, it } from 'vitest'

import { COUNTRY_ZONES, countryZones, zoneCountry } from './time-zone-countries'
import { TIME_ZONES } from './time-zones'

describe('the zones of each country', () => {
  it('give every zone of the list but UTC to exactly one country', () => {
    const listed = Object.values(COUNTRY_ZONES).flat()
    expect(new Set(listed).size).toBe(listed.length)
    expect([...listed].sort()).toEqual(TIME_ZONES.filter((zone) => zone !== 'UTC').sort())
    for (const code of Object.keys(COUNTRY_ZONES)) expect(code).toMatch(/^[A-Z]{2}$/)
  })

  it('look up a country and a zone', () => {
    expect(countryZones('AS')).toEqual(['Pacific/Pago_Pago'])
    expect(countryZones('MY')).toEqual(['Asia/Kuala_Lumpur', 'Asia/Kuching'])
    expect(countryZones('XK')).toBeUndefined()
    expect(countryZones('toString')).toBeUndefined()
    expect(zoneCountry('Europe/Istanbul')).toBe('TR')
    expect(zoneCountry('Europe/Busingen')).toBe('DE')
    expect(zoneCountry('UTC')).toBeUndefined()
  })
})
