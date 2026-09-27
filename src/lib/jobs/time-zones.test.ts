import { describe, expect, it } from 'vitest'

import { TIME_ZONES, isTimeZone, timeZoneLabel } from './time-zones'

describe('time zones', () => {
  it('are all accepted by Intl in this runtime', () => {
    const refused = TIME_ZONES.filter((timeZone) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone })
        return false
      } catch {
        return true
      }
    })
    expect(refused).toEqual([])
  })

  it('are sorted and unique, and include UTC and the IANA names of renamed zones', () => {
    expect([...TIME_ZONES]).toEqual([...new Set(TIME_ZONES)].sort())
    for (const zone of ['UTC', 'Europe/Istanbul', 'Asia/Kolkata', 'Europe/Kyiv', 'America/Nuuk']) {
      expect(isTimeZone(zone)).toBe(true)
    }
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false)
    expect(isTimeZone('')).toBe(false)
  })

  it('show underscores as spaces', () => {
    expect(timeZoneLabel('America/New_York')).toBe('America/New York')
  })
})
