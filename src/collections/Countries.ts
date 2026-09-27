import type { CollectionConfig } from 'payload'

import { COUNTRY_CODE_PATTERN, REGIONS, SUBREGIONS } from '@/lib/geography'
import { requiredInEnglish } from '@/lib/localized'

// PLAN §4.6 and §5.1: countries and areas, identified by their ISO 3166-1 alpha-2 code (the code
// is the record's ID, so other records store "DE" rather than a number). Names are localized; the
// initial names come from the Unicode CLDR data in Node.js, the regions from UN M49.
export const Countries: CollectionConfig = {
  slug: 'countries',
  labels: { singular: 'Country', plural: 'Countries' },
  admin: {
    group: 'Places',
    useAsTitle: 'name',
    defaultColumns: ['name', 'id', 'region', 'subregion'],
    listSearchableFields: ['name', 'id'],
    pagination: { defaultLimit: 100 },
    description:
      'Countries and areas with their UN M49 regions (PLAN §4.6). Kosovo (XK) and Taiwan (TW) are included although M49 does not list them, because ROR and funders use them.',
  },
  defaultSort: 'id',
  access: {
    // Institutions and country sets refer to countries by code.
    delete: () => false,
  },
  // A copy would repeat the code.
  disableDuplicate: true,
  fields: [
    {
      name: 'id',
      label: 'Code',
      type: 'text',
      required: true,
      validate: (value: string | null | undefined) =>
        (typeof value === 'string' && COUNTRY_CODE_PATTERN.test(value)) ||
        'Use the two-letter ISO 3166-1 code in capitals, e.g. DE.',
      admin: { description: 'ISO 3166-1 alpha-2, e.g. DE. Cannot be changed.' },
    },
    {
      name: 'name',
      type: 'text',
      localized: true,
      validate: requiredInEnglish('Enter the English name.'),
    },
    {
      type: 'row',
      fields: [
        {
          name: 'region',
          type: 'select',
          options: REGIONS.map(({ value, label }) => ({ value, label })),
        },
        {
          name: 'subregion',
          type: 'select',
          options: SUBREGIONS.map(({ value, label }) => ({ value, label })),
        },
        {
          name: 'm49Code',
          label: 'M49 code',
          type: 'text',
          admin: { description: 'Empty for XK and TW.' },
        },
      ],
    },
  ],
}
