import { parseRorId } from './ror-id'

// The parts of a ROR schema v2 record that Gliagora uses (https://ror.readme.io/v2/docs/data-structure).
type RorName = { value?: unknown; types?: unknown; lang?: unknown }
type RorLocation = {
  geonames_details?: { country_code?: unknown; name?: unknown; lat?: unknown; lng?: unknown }
}
export type RorRecord = {
  id?: unknown
  status?: unknown
  types?: unknown
  names?: RorName[]
  locations?: RorLocation[]
  links?: { type?: unknown; value?: unknown }[]
  admin?: { last_modified?: { date?: unknown } }
}

export const ROR_TYPES = [
  'education',
  'healthcare',
  'company',
  'archive',
  'nonprofit',
  'government',
  'facility',
  'funder',
  'other',
] as const
export type RorType = (typeof ROR_TYPES)[number]

export const ROR_STATUSES = ['active', 'inactive', 'withdrawn'] as const
export type RorStatus = (typeof ROR_STATUSES)[number]

/** An institution as Gliagora stores it (PLAN §5.1), taken from one ROR record. */
export type RorInstitution = {
  rorId: string
  name: string
  aliases: string[]
  types: RorType[]
  status: RorStatus
  countryCode: string | null
  city: string | null
  lat: number | null
  lng: number | null
  website: string | null
  rorLastModified: string
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const coordinate = (value: unknown, limit: number) =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? value : null

function website(links: RorRecord['links']): string | null {
  for (const link of list(links) as NonNullable<RorRecord['links']>) {
    const value = text(link?.value)
    if (link?.type !== 'website' || !value) continue
    try {
      const url = new URL(value)
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href
    } catch {
      // Not a URL; try the next link.
    }
  }
  return null
}

/**
 * The institution described by a ROR v2 record, or null when the record lacks what every
 * institution needs (a valid ROR ID, a display name, a status and a modification date).
 */
export function fromRorRecord(input: unknown): RorInstitution | null {
  if (typeof input !== 'object' || input === null) return null
  const record = input as RorRecord
  const rorId = parseRorId(text(record.id))
  const names = list(record.names) as RorName[]
  const display = names.find((name) => list(name?.types).includes('ror_display'))
  const name = text(display?.value)
  const status = ROR_STATUSES.find((value) => value === record.status)
  const rorLastModified = text(record.admin?.last_modified?.date)
  if (!rorId || !name || !status || !/^\d{4}-\d{2}-\d{2}$/.test(rorLastModified)) return null

  // Other labels, aliases and acronyms, for search ("Caltech", "CIT").
  const seen = new Set([name.toLocaleLowerCase('en')])
  const aliases: string[] = []
  for (const entry of names) {
    const value = text(entry?.value)
    const key = value.toLocaleLowerCase('en')
    if (!value || seen.has(key)) continue
    seen.add(key)
    aliases.push(value)
  }

  // ROR lists the main location first.
  const place = (list(record.locations) as RorLocation[])[0]?.geonames_details
  const countryCode = text(place?.country_code).toUpperCase()

  return {
    rorId,
    name,
    aliases,
    types: ROR_TYPES.filter((type) => list(record.types).includes(type)),
    status,
    countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : null,
    city: text(place?.name) || null,
    lat: coordinate(place?.lat, 90),
    lng: coordinate(place?.lng, 180),
    website: website(record.links),
    rorLastModified,
  }
}
