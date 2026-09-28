import type { CollectionConfig } from 'payload'

import { nobody, signedIn } from '@/lib/access'
import { fixedFieldHooks } from '@/lib/fixed-fields'
import { requiredInEnglish } from '@/lib/localized'
import { isValidSlug } from '@/lib/taxonomy'

// PLAN §4.6 and §5.1: named groups of countries for funding eligibility (M9), such as the EU
// member states. Each set records where its list comes from and when it was last checked there;
// memberships change (associations, the World Bank's yearly income groups), so every set must be
// checked against its source again before the funding finder relies on it.
export const CountrySets: CollectionConfig = {
  slug: 'country-sets',
  labels: { singular: 'Country set', plural: 'Country sets' },
  admin: {
    group: 'Places',
    useAsTitle: 'label',
    defaultColumns: ['label', 'slug', 'lastVerifiedAt'],
    description:
      'Groups of countries used in funding eligibility (PLAN §4.6). When you change a list, update the source, the date you checked it and the note.',
  },
  // Signed-in editors; sets are not deleted.
  access: {
    read: signedIn,
    create: signedIn,
    update: signedIn,
    delete: nobody,
    readVersions: signedIn,
  },
  // A copy would repeat the slug.
  disableDuplicate: true,
  versions: { maxPerDoc: 50 },
  // The slug is fixed once saved.
  hooks: fixedFieldHooks('country-sets', ['slug']),
  fields: [
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      access: { update: () => false },
      validate: (value: string | null | undefined) =>
        (typeof value === 'string' && isValidSlug(value)) ||
        'Use lowercase letters and digits, with single hyphens between words.',
    },
    {
      name: 'label',
      type: 'text',
      localized: true,
      validate: requiredInEnglish('Enter the English label.'),
    },
    {
      name: 'description',
      type: 'textarea',
      localized: true,
    },
    {
      name: 'countries',
      type: 'relationship',
      relationTo: 'countries',
      hasMany: true,
      required: true,
    },
    {
      name: 'sourceUrl',
      label: 'Source',
      type: 'text',
      required: true,
      validate: (value: string | null | undefined) => {
        try {
          return new URL(value ?? '').protocol === 'https:' || 'Use an https address.'
        } catch {
          return 'Enter the address of the official list.'
        }
      },
    },
    {
      name: 'lastVerifiedAt',
      label: 'Last checked against the source',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    {
      name: 'verificationNote',
      type: 'textarea',
      admin: {
        description: 'The version or date of the source, and anything left out on purpose.',
      },
    },
  ],
}
