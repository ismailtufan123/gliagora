import { randomInt } from 'node:crypto'
import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'

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
}) => {
  if (!data) return data
  const merged = { ...originalDoc, ...data } as InstitutionData
  if (typeof data.rorId === 'string') {
    data.rorId = data.rorId.trim() === '' ? null : (parseRorId(data.rorId) ?? data.rorId)
  }
  const rorId = data.rorId ?? merged.rorId
  if (operation === 'create' && rorId && isRorId(rorId) && !context[ROR_IMPORT_CONTEXT]) {
    // Between monthly imports an editor can add a ROR institution by its ID alone.
    const found = await fetchRorInstitution(rorId)
    if (found) {
      const { countryCode, ...rest } = found
      Object.assign(data, rest, { country: data.country ?? countryCode, origin: 'ror' })
    }
  }
  const name = data.name ?? merged.name
  if (name) data.slug = slugify(name, { fallback: 'institution' })
  if (!(data.rorId ?? merged.rorId) && !merged.shortId) data.shortId = newShortId()
  if (!data.origin && !merged.origin) data.origin = rorId ? 'ror' : 'manual'
  return data
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
      'Institutions from ROR are imported every month and updated automatically. To add one before the next import, enter only its ROR ID and save. Add others by hand with their coordinates.',
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
          validate: (
            value: number | null | undefined,
            { data }: { data: Partial<InstitutionData> },
          ) => data.origin !== 'manual' || typeof value === 'number' || 'Enter the latitude.',
        },
        {
          name: 'lng',
          label: 'Longitude',
          type: 'number',
          min: -180,
          max: 180,
          validate: (
            value: number | null | undefined,
            { data }: { data: Partial<InstitutionData> },
          ) => data.origin !== 'manual' || typeof value === 'number' || 'Enter the longitude.',
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
