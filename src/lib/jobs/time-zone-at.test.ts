import tzlookup from '@photostructure/tz-lookup'
import { describe, expect, it } from 'vitest'

import { institutionTimeZone, listedTimeZone, timeZoneAt } from './time-zone-at'
import { isTimeZone } from './time-zones'

describe('timeZoneAt', () => {
  it('finds the zone of well-known places', () => {
    expect(timeZoneAt(52.52, 13.405)).toBe('Europe/Berlin')
    expect(timeZoneAt(41.0082, 28.9784)).toBe('Europe/Istanbul')
    expect(timeZoneAt(39.9199, 32.8543)).toBe('Europe/Istanbul') // Ankara
    expect(timeZoneAt(42.3601, -71.0589)).toBe('America/New_York') // Boston
    expect(timeZoneAt(-33.8688, 151.2093)).toBe('Australia/Sydney')
    expect(timeZoneAt(27.7172, 85.324)).toBe('Asia/Kathmandu') // UTC+5:45
    expect(timeZoneAt(-43.9535, -176.5597)).toBe('Pacific/Chatham') // UTC+12:45
    expect(timeZoneAt(-77.846, 166.676)).toBe('Antarctica/McMurdo')
  })

  it('tells neighbouring places apart across a border', () => {
    // Badajoz (Spain) and Elvas (Portugal), 17 km apart, an hour apart.
    expect(timeZoneAt(38.8794, -6.9707)).toBe('Europe/Madrid')
    expect(timeZoneAt(38.8815, -7.1628)).toBe('Europe/Lisbon')
    // El Paso (Texas) and Ciudad Juárez (Mexico), across the Rio Grande.
    expect(timeZoneAt(31.7619, -106.485)).toBe('America/Denver')
    expect(timeZoneAt(31.6904, -106.4245)).toBe('America/Ciudad_Juarez')
    // Basel, Weil am Rhein and Saint-Louis, where Switzerland, Germany and France meet.
    expect(timeZoneAt(47.5596, 7.5886)).toBe('Europe/Zurich')
    expect(timeZoneAt(47.5937, 7.6206)).toBe('Europe/Berlin')
    expect(timeZoneAt(47.5903, 7.5596)).toBe('Europe/Paris')
  })

  it('gives no zone at sea', () => {
    expect(timeZoneAt(0, -140)).toBeNull() // the Pacific
    expect(timeZoneAt(30, -40)).toBeNull() // the Atlantic
    expect(timeZoneAt(90, 0)).toBeNull() // the North Pole
  })

  it('gives no zone for missing or invalid coordinates', () => {
    expect(timeZoneAt(null, null)).toBeNull()
    expect(timeZoneAt(undefined, 13.4)).toBeNull()
    expect(timeZoneAt(52.5, undefined)).toBeNull()
    expect(timeZoneAt(Number.NaN, 0)).toBeNull()
    expect(timeZoneAt(91, 0)).toBeNull()
    expect(timeZoneAt(0, -180.5)).toBeNull()
    expect(timeZoneAt(Number.POSITIVE_INFINITY, 0)).toBeNull()
    expect(timeZoneAt('52.52', '13.4')).toBeNull()
  })

  it('gives a zone of the list for every place on land, on a one-degree grid', () => {
    let land = 0
    for (let lat = -90; lat <= 90; lat++) {
      for (let lng = -180; lng <= 180; lng++) {
        const found = tzlookup(lat, lng)
        const zone = timeZoneAt(lat, lng)
        if (found.startsWith('Etc/')) {
          expect(zone).toBeNull()
        } else {
          // A zone the boundary data knows is never dropped, whatever the package version.
          expect(isTimeZone(zone), `${lat}, ${lng}: ${found}`).toBe(true)
          land++
        }
      }
    }
    expect(land).toBeGreaterThan(15_000)
  })
})

describe('timeZoneAt with the country (D40)', () => {
  it('keeps a zone of the country', () => {
    expect(timeZoneAt(52.52, 13.405, 'DE')).toBe('Europe/Berlin')
    expect(timeZoneAt(38.8794, -6.9707, 'ES')).toBe('Europe/Madrid') // Badajoz
    expect(timeZoneAt(43.4747, 87.4125, 'CN')).toBe('Asia/Urumqi') // Ürümqi, one of the fake data
  })

  it("takes the country's only zone for a zone of another country", () => {
    // Pago Pago: Samoa's zone (UTC+13) would end its deadlines a day early (UTC−11).
    expect(timeZoneAt(-14.27806, -170.7025)).toBe('Pacific/Apia')
    expect(timeZoneAt(-14.27806, -170.7025, 'AS')).toBe('Pacific/Pago_Pago')
    // Dili (UTC+9), which the borders put in Indonesia's UTC+8 zone.
    expect(timeZoneAt(-8.55861, 125.57361)).toBe('Asia/Makassar')
    expect(timeZoneAt(-8.55861, 125.57361, 'TL')).toBe('Asia/Dili')
    // Tornio, on the border with Sweden.
    expect(timeZoneAt(65.8481, 24.1466)).toBe('Europe/Stockholm')
    expect(timeZoneAt(65.8481, 24.1466, 'FI')).toBe('Europe/Helsinki')
  })

  it("takes the country's zone with the same offsets, or its first when all have the same", () => {
    // Ogdensburg (New York), which the borders put in Canada.
    expect(timeZoneAt(44.69423, -75.48634)).toBe('America/Toronto')
    expect(timeZoneAt(44.69423, -75.48634, 'US')).toBe('America/New_York')
    // Kuala Selangor gets UTC+7 from the borders; Malaysia's two zones are both UTC+8.
    expect(timeZoneAt(3.35, 101.25)).toBe('Asia/Jakarta')
    expect(timeZoneAt(3.35, 101.25, 'MY')).toBe('Asia/Kuala_Lumpur')
  })

  it('gives no zone when none of the country fits', () => {
    // Abepura (Indonesian Papua, UTC+9) gets Papua New Guinea's zone (UTC+10).
    expect(timeZoneAt(-2.5964, 140.6324)).toBe('Pacific/Port_Moresby')
    expect(timeZoneAt(-2.5964, 140.6324, 'ID')).toBeNull()
    // Limestone (Maine, UTC−5) gets New Brunswick's zone (UTC−4).
    expect(timeZoneAt(46.90866, -67.82585)).toBe('America/Moncton')
    expect(timeZoneAt(46.90866, -67.82585, 'US')).toBeNull()
  })

  it('keeps the zone for a country that zone.tab does not list, or none', () => {
    expect(timeZoneAt(42.6629, 21.1655, 'XK')).toBe('Europe/Belgrade') // Pristina
    expect(timeZoneAt(52.52, 13.405, null)).toBe('Europe/Berlin')
    expect(timeZoneAt(52.52, 13.405, '')).toBe('Europe/Berlin')
    expect(timeZoneAt(0, -140, 'US')).toBeNull() // at sea
  })
})

describe('listedTimeZone', () => {
  it('keeps the zones of the list', () => {
    expect(listedTimeZone('Europe/Istanbul')).toBe('Europe/Istanbul')
    expect(listedTimeZone('UTC')).toBe('UTC')
  })

  it('maps the old names that Intl still knows to the listed ones', () => {
    expect(listedTimeZone('Asia/Calcutta')).toBe('Asia/Kolkata')
    expect(listedTimeZone('Europe/Kiev')).toBe('Europe/Kyiv')
    expect(listedTimeZone('Asia/Saigon')).toBe('Asia/Ho_Chi_Minh')
  })

  it('gives nothing for Etc zones and unknown names', () => {
    expect(listedTimeZone('Etc/GMT+5')).toBeNull()
    expect(listedTimeZone('Etc/UTC')).toBeNull()
    expect(listedTimeZone('Mars/Olympus_Mons')).toBeNull()
    expect(listedTimeZone('')).toBeNull()
  })
})

describe('institutionTimeZone (D40)', () => {
  const berlin = { lat: 52.52, lng: 13.405 }
  const lisbon = { lat: 38.7223, lng: -9.1393 }

  it('fills an empty zone from the coordinates', () => {
    expect(institutionTimeZone(berlin)).toBe('Europe/Berlin')
    expect(institutionTimeZone({ ...berlin, timeZone: null })).toBe('Europe/Berlin')
    expect(institutionTimeZone({ ...berlin, timeZone: '' })).toBe('Europe/Berlin')
    // Also on an update of an institution that has none yet.
    expect(institutionTimeZone({ ...berlin, timeZone: null }, { ...berlin, timeZone: null })).toBe(
      'Europe/Berlin',
    )
  })

  it('keeps a zone given for a new institution', () => {
    expect(institutionTimeZone({ ...berlin, timeZone: 'Europe/Paris' })).toBe('Europe/Paris')
  })

  it("keeps an editor's correction until the coordinates change", () => {
    const corrected = { ...berlin, timeZone: 'Europe/Paris' }
    // The correction itself, saved with the coordinates unchanged.
    expect(institutionTimeZone(corrected, { ...berlin, timeZone: 'Europe/Berlin' })).toBe(
      'Europe/Paris',
    )
    // Later saves that leave the coordinates alone.
    expect(institutionTimeZone(corrected, corrected)).toBe('Europe/Paris')
    // New coordinates: the zone follows them.
    expect(institutionTimeZone({ ...lisbon, timeZone: 'Europe/Paris' }, corrected)).toBe(
      'Europe/Lisbon',
    )
  })

  it('keeps a zone chosen in the same save that moves the coordinates', () => {
    const saved = { ...berlin, timeZone: 'Europe/Berlin' }
    expect(institutionTimeZone({ ...lisbon, timeZone: 'Atlantic/Madeira' }, saved)).toBe(
      'Atlantic/Madeira',
    )
  })

  it('is empty without coordinates, unless an editor chose a zone', () => {
    expect(institutionTimeZone({ lat: null, lng: null })).toBeNull()
    expect(institutionTimeZone({ lat: null, lng: null, timeZone: 'Europe/Berlin' })).toBe(
      'Europe/Berlin',
    )
    // Coordinates removed: the zone they gave goes with them.
    expect(
      institutionTimeZone(
        { lat: null, lng: null, timeZone: 'Europe/Berlin' },
        { ...berlin, timeZone: 'Europe/Berlin' },
      ),
    ).toBeNull()
  })

  it('takes the country into account, and counts a new country as a move', () => {
    const pagoPago = { lat: -14.27806, lng: -170.7025 }
    expect(institutionTimeZone({ ...pagoPago, country: 'AS' })).toBe('Pacific/Pago_Pago')
    // A saved zone stays while the place stays the same, and follows a corrected country.
    const saved = { ...pagoPago, country: 'WS', timeZone: 'Pacific/Apia' }
    expect(institutionTimeZone({ ...saved, country: 'AS' }, saved)).toBe('Pacific/Pago_Pago')
    expect(institutionTimeZone({ ...saved }, saved)).toBe('Pacific/Apia')
  })

  it('treats a missing coordinate like an empty one', () => {
    const saved = { lat: null, lng: null, timeZone: 'Asia/Tokyo' }
    expect(
      institutionTimeZone({ lat: undefined, lng: undefined, timeZone: 'Asia/Tokyo' }, saved),
    ).toBe('Asia/Tokyo')
  })
})
