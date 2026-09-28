import type {
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload'
import { APIError, ValidationError } from 'payload'

import { signedIn } from '@/lib/access'
import { institutionTimeZone } from '@/lib/jobs/time-zone-at'
import { TIME_ZONES, timeZoneLabel } from '@/lib/jobs/time-zones'
import { idOf } from '@/lib/relationship'
import { fetchRorInstitution } from '@/lib/ror/api'
import { ROR_STATUSES, ROR_TYPES } from '@/lib/ror/record'
import { isRorId, parseRorId } from '@/lib/ror/ror-id'
import { newShortId } from '@/lib/short-id'
import { slugify } from '@/lib/slug'
import type { Institution } from '@/payload-types'

type InstitutionData = Partial<Institution>

/** Context flag set by the ROR import, which supplies complete data itself. */
export const ROR_IMPORT_CONTEXT = 'rorImport'

// Fills in what editors should not type by hand: the ROR ID in its short form, the data of a new
// ROR institution from the ROR API, the URL slug and, for other institutions, a short ID; and the
// time zone from the coordinates and the country, unless an editor chose one (institutionTimeZone). The ROR import
// saves through this hook too, so imported institutions get their zone the same way.
const prepare: CollectionBeforeValidateHook<Institution> = async ({
  data,
  originalDoc,
  operation,
  context,
  req,
}) => {
  if (!data) return data
  const saved = (originalDoc ?? {}) as InstitutionData
  if (typeof data.rorId === 'string') {
    const trimmed = data.rorId.trim()
    data.rorId = trimmed === '' ? null : (parseRorId(trimmed) ?? trimmed)
  }
  const refuse = (message: string): never => {
    throw new ValidationError({
      collection: 'institutions',
      errors: [{ path: 'rorId', message }],
      req,
    })
  }
  // The import finds an institution by its ROR ID, so a saved ROR ID stays: changing or removing
  // it would make the next import add the institution a second time.
  if (operation === 'update' && saved.rorId && 'rorId' in data && data.rorId !== saved.rorId) {
    refuse('A saved ROR ID cannot be changed or removed.')
  }
  const rorId = 'rorId' in data ? data.rorId : saved.rorId

  if (operation === 'create' && rorId && isRorId(rorId) && !context[ROR_IMPORT_CONTEXT]) {
    // Between imports an editor can add a ROR institution by its ID alone.
    let found = null
    try {
      found = await fetchRorInstitution(rorId)
    } catch {
      if (!data.name) {
        refuse(
          'The ROR API could not be reached. Try again later, or fill in the name, country, city and coordinates yourself.',
        )
      }
    }
    if (found) {
      const { countryCode, ...rest } = found
      Object.assign(data, rest, { country: data.country ?? countryCode, origin: 'ror' })
    }
  }

  const name = data.name ?? saved.name
  if (name) data.slug = slugify(name, { fallback: 'institution' })
  // Every institution needs an ID for its URL: the ROR ID, or else a short ID.
  if (!rorId && !saved.shortId && !data.shortId) data.shortId = newShortId()
  if (rorId && !saved.rorId) data.origin = 'ror'
  else if (!data.origin && !saved.origin) data.origin = 'manual'

  const country = (value: unknown) => {
    const code = idOf(value)
    return code === undefined ? null : String(code)
  }
  data.timeZone = institutionTimeZone(
    {
      lat: 'lat' in data ? data.lat : saved.lat,
      lng: 'lng' in data ? data.lng : saved.lng,
      country: country('country' in data ? data.country : saved.country),
      timeZone: 'timeZone' in data ? data.timeZone : saved.timeZone,
    },
    operation === 'update' ? { ...saved, country: country(saved.country) } : undefined,
  ) as Institution['timeZone']
  return data
}

const inRange =
  (limit: number, name: string) =>
  (value: number | null | undefined, { data }: { data: Partial<InstitutionData> }) => {
    if (typeof value === 'number') {
      return Math.abs(value) <= limit || `The ${name} must be between -${limit} and ${limit}.`
    }
    return data.origin !== 'manual' || `Enter the ${name}.`
  }

// Jobs refer to their institution (PLAN §5.1), so an institution is kept while a job or a job
// version refers to it. Versions are the jobs' history (PLAN §5.2) and need their institution
// (the database refuses to clear it). This also holds for code that bypasses access control.
// Reports about the institution do not keep it: the database clears their link (ON DELETE SET
// NULL), and each keeps the address of the page it was about (D40).
const keepReferenced: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const { totalDocs } = await req.payload.count({
    collection: 'jobs',
    where: { institution: { equals: id } },
    req,
  })
  if (totalDocs > 0) {
    const jobs = totalDocs === 1 ? 'A job refers' : `${totalDocs} jobs refer`
    throw new APIError(
      `${jobs} to this institution. Give ${totalDocs === 1 ? 'it' : 'them'} another institution before deleting this one.`,
      400,
      null,
      true,
    )
  }
  const { totalDocs: versions } = await req.payload.countVersions({
    collection: 'jobs',
    where: { 'version.institution': { equals: id } },
    req,
  })
  if (versions > 0) {
    throw new APIError(
      'Earlier versions of a job refer to this institution, so it is kept for their history.',
      400,
      null,
      true,
    )
  }
}

// PLAN §5.1: institutions come from ROR (CC0, monthly import); organizations without a ROR ID,
// such as small companies, are added by hand with coordinates.
export const Institutions: CollectionConfig = {
  slug: 'institutions',
  labels: { singular: 'Institution', plural: 'Institutions' },
  admin: {
    group: 'Places',
    useAsTitle: 'name',
    defaultColumns: ['name', 'city', 'country', 'origin', 'status'],
    listSearchableFields: ['name', 'rorId', 'city'],
    description:
      'Institutions from ROR are imported and kept up to date automatically. To add one before the next import, enter only its ROR ID and save. Add others by hand with their coordinates.',
  },
  // Signed-in editors; the pages read institutions through the local API.
  access: {
    read: signedIn,
    create: signedIn,
    update: signedIn,
    // Signed-in editors only (a function replaces Payload's default, so it checks the user
    // itself). The import would add a deleted ROR institution again, so only institutions added
    // by hand can be deleted, and only while no job or job version refers to them (keepReferenced).
    delete: ({ req }) => (req.user ? { origin: { equals: 'manual' } } : false),
  },
  hooks: { beforeValidate: [prepare], beforeDelete: [keepReferenced] },
  // A copy would repeat the ROR ID or short ID, which must be unique.
  disableDuplicate: true,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'rorId',
      label: 'ROR ID',
      type: 'text',
      unique: true,
      index: true,
      validate: (value: string | null | undefined) =>
        !value ||
        isRorId(value) ||
        'Enter a ROR ID such as 05dxps055 or https://ror.org/05dxps055.',
      admin: {
        position: 'sidebar',
        description: 'e.g. 05dxps055 (https://ror.org/05dxps055)',
      },
    },
    {
      name: 'origin',
      type: 'select',
      required: true,
      defaultValue: 'manual',
      options: [
        { value: 'ror', label: 'ROR' },
        { value: 'manual', label: 'Added by hand' },
      ],
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: ROR_STATUSES.map((value) => ({
        value,
        label: value.charAt(0).toUpperCase() + value.slice(1),
      })),
      admin: { position: 'sidebar' },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Made from the name; the ID at the end of the URL keeps old links working.',
      },
    },
    {
      name: 'shortId',
      label: 'Short ID',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        condition: (data) => !data?.rorId,
        description: 'Ends the URL of an institution without a ROR ID.',
      },
    },
    {
      name: 'aliases',
      type: 'text',
      hasMany: true,
      admin: { description: 'Other names, acronyms and names in other languages, for search.' },
    },
    {
      name: 'types',
      type: 'select',
      hasMany: true,
      options: ROR_TYPES.map((value) => ({
        value,
        label: value.charAt(0).toUpperCase() + value.slice(1),
      })),
    },
    {
      type: 'row',
      fields: [
        {
          name: 'country',
          type: 'relationship',
          relationTo: 'countries',
          validate: (value: unknown, { data }: { data: Partial<InstitutionData> }) =>
            data.origin !== 'manual' || Boolean(value) || 'Choose a country.',
        },
        { name: 'city', type: 'text' },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'lat',
          label: 'Latitude',
          type: 'number',
          min: -90,
          max: 90,
          validate: inRange(90, 'latitude'),
        },
        {
          name: 'lng',
          label: 'Longitude',
          type: 'number',
          min: -180,
          max: 180,
          validate: inRange(180, 'longitude'),
        },
      ],
    },
    {
      // D40: new jobs here take this zone for their deadline (src/collections/Jobs.ts).
      name: 'timeZone',
      label: 'Time zone',
      type: 'select',
      options: TIME_ZONES.map((zone) => ({ value: zone, label: timeZoneLabel(zone) })),
      admin: {
        description:
          'Filled in from the coordinates, and left empty when the zone found there does not fit the country: then choose it. Correct it if it is wrong: your choice stays until the coordinates or the country change. New jobs here take it as the time zone of their deadline.',
      },
    },
    {
      name: 'website',
      type: 'text',
      validate: (value: string | null | undefined) => {
        if (!value) return true
        try {
          const url = new URL(value)
          return url.protocol === 'https:' || url.protocol === 'http:' || 'Use an http(s) address.'
        } catch {
          return 'Enter a full address, e.g. https://www.example.org/.'
        }
      },
    },
    {
      type: 'collapsible',
      label: 'ROR data',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'rorRelease',
          label: 'ROR release',
          type: 'text',
          admin: {
            readOnly: true,
            description: 'The ROR data release this record last came from.',
          },
        },
        {
          name: 'rorLastModified',
          label: 'Last changed in ROR',
          type: 'text',
          admin: { readOnly: true },
        },
      ],
    },
  ],
}
