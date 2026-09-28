import tzlookup from '@photostructure/tz-lookup'

import { countryZones, zoneCountry } from './time-zone-countries'
import { TIME_ZONES, type TimeZone, isTimeZone } from './time-zones'

// The time zone at a place, from its coordinates, offline (D40): an institution's zone, which new
// jobs there take as the zone of their deadline. The zone borders come from @photostructure/tz-lookup
// (CC0; a compressed copy of timezone-boundary-builder's borders, 73 KB), so no service sees the
// coordinates. It trades accuracy for its size, and not only near borders: on the 140,098 located
// institutions of the ROR v2.13 dump it gave 148 a zone with other UTC offsets than the exact
// borders (geo-tz 8.1.9), whole territories among them (Pago Pago in American Samoa got Samoa's
// zone, a day ahead; Dili got Indonesia's, an hour behind). So the zone found is checked against the
// institution's country (zone.tab, src/lib/jobs/time-zone-countries.ts): a zone of another country
// becomes the country's own zone with the same UTC offsets, or its first zone when all its zones
// have the same offsets (American Samoa has one), or else none, which leaves the field to the
// editor (a deadline without a zone ends Anywhere on Earth: late, never early). With the check,
// 140,032 get the zone of the exact borders or one with the same offsets all year, one a zone where
// those borders see only sea, 22 none, and 43 other offsets: 42 a zone of their own country, which
// the check cannot tell apart (Asia/Urumqi for 20 places in Xinjiang that the exact borders give
// Beijing time), and one whose coordinates lie across the border from its country. Editors see the
// zone and can correct it. Server-side only: never import this from a client component.

let aliases: Map<string, TimeZone> | undefined

/** The name `Intl` uses for a zone (for some runtimes an old alias), or null if it has none. */
function intlName(zone: string): string | null {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

/**
 * The zone of the list (src/lib/jobs/time-zones.ts) that `name` stands for: the name itself, or the
 * listed zone that `Intl` treats as the same (Asia/Calcutta is Asia/Kolkata). Null for the `Etc/`
 * zones, which the boundary data gives only at sea, and for names neither the list nor `Intl` know.
 */
export function listedTimeZone(name: string): TimeZone | null {
  if (isTimeZone(name)) return name
  if (name.startsWith('Etc/')) return null
  aliases ??= new Map(TIME_ZONES.map((zone) => [intlName(zone) ?? zone, zone]))
  const key = intlName(name)
  return (key !== null && aliases.get(key)) || null
}

const inRange = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit

const offsets = new Map<string, string>()

/** The UTC offsets of `zone` in mid-January and mid-July of this year, as one comparable text. */
function offsetsOf(zone: string): string {
  const year = new Date().getUTCFullYear()
  const key = `${zone} ${year}`
  let found = offsets.get(key)
  if (found === undefined) {
    const format = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' })
    found = [0, 6]
      .map(
        (month) =>
          format
            .formatToParts(Date.UTC(year, month, 15, 12))
            .find((part) => part.type === 'timeZoneName')?.value,
      )
      .join(' ')
    offsets.set(key, found)
  }
  return found
}

/**
 * The zone of `country` for a place where the borders gave `zone`: `zone` itself when it is one of
 * the country's (or the country or the zone is not in zone.tab: Kosovo, UTC); else the first of the
 * country's zones with the same UTC offsets in January and July; else the country's first zone when
 * all its zones have the same offsets (a country with one zone, such as American Samoa, or Malaysia);
 * else null.
 */
function inCountry(zone: TimeZone, country: string): TimeZone | null {
  const zones = countryZones(country)
  const owner = zoneCountry(zone)
  if (!zones || !owner || owner === country) return zone
  const same = zones.find((own) => offsetsOf(own) === offsetsOf(zone))
  if (same) return same
  const [first] = zones
  return first && zones.every((own) => offsetsOf(own) === offsetsOf(first)) ? first : null
}

/**
 * The time zone at latitude `lat` and longitude `lng` in `country` (an ISO 3166-1 alpha-2 code,
 * optional), or null when there is none to give: missing or invalid coordinates, places at sea
 * (the `Etc/` zones), and a zone of another country that none of the country's own zones matches.
 */
export function timeZoneAt(lat: unknown, lng: unknown, country?: string | null): TimeZone | null {
  if (!inRange(lat, 90) || !inRange(lng, 180)) return null
  let zone: string
  try {
    zone = tzlookup(lat, lng)
  } catch {
    return null
  }
  const listed = listedTimeZone(zone)
  return listed && country ? inCountry(listed, country) : listed
}

/** An institution's coordinates, country and time zone, as saved or as being saved. */
export type Place = {
  lat?: number | null
  lng?: number | null
  country?: string | null
  timeZone?: string | null
}

/**
 * The time zone to store with an institution (D40). An editor's choice is kept until the place
 * changes (the coordinates or the country): a zone given when the institution is created, or changed
 * in a save, stays (also when the same save moves the place), and so does a saved zone while the
 * place stays the same. Otherwise, and whenever the field is empty, the zone comes from the
 * coordinates and the country (timeZoneAt), or is empty without coordinates. `saved` is the
 * institution before an update.
 */
export function institutionTimeZone(data: Place, saved?: Place): string | null {
  // A name that is not a zone of the list is kept for the field's validation to refuse.
  const zone = data.timeZone || null
  if (zone) {
    if (!saved) return zone
    const chosen = zone !== (saved.timeZone || null)
    const moved = (['lat', 'lng', 'country'] as const).some(
      (key) => (data[key] ?? null) !== (saved[key] ?? null),
    )
    if (chosen || !moved) return zone
  }
  return timeZoneAt(data.lat, data.lng, data.country)
}
