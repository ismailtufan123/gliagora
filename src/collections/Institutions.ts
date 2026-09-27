import { randomInt } from 'node:crypto'
import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { ValidationError } from 'payload'

import { fetchRorInstitution } from '@/lib/ror/api'
import { ROR_STATUSES, ROR_TYPES } from '@/lib/ror/record'
import { isRorId, parseRorId } from '@/lib/ror/ror-id'
import { slugify } from '@/lib/slug'
import type { Institution } from '@/payload-types'

const SHORT_ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/** A short stable ID for institutions without a ROR ID, used at the end of their URL (PLAN §2.1). */
export function newShortId(): string {
  return Array.from({ length: 5 }, () => SHORT_ID_ALPHABET[randomInt(32)]).join('')
}

export const SHORT_ID_PATTERN = /^[0-9a-hjkmnp-tv-z]{5}$/

type InstitutionData = Partial<Institution>

/** Context flag set by the ROR import, which supplies complete data itself. */
export const ROR_IMPORT_CONTEXT = 'rorImport'

// Fills in what editors should not type by hand: the ROR ID in its short form, the data of a new
// ROR institution from the ROR API, the URL slug and, for other institutions, a short ID.
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
  access: {
    // Content will refer to institutions (M4), and the import would add a deleted ROR
    // institution again, so only institutions added by hand can be deleted.
    delete: () => ({ origin: { equals: 'manual' } }),
  },
  hooks: { beforeValidate: [prepare] },
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
