import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionConfig,
} from 'payload'
import { APIError } from 'payload'

import { nobody, signedIn } from '@/lib/access'
import { OFFLINE_RECORD_MONTHS } from '@/lib/retention/rules'

/** The kinds of listing kept here. Events join in M8. */
export const RETIRED_KINDS = [{ value: 'job', label: 'Job' }] as const

// A retired listing is written once, by the retention task, and then only read, also by code that
// bypasses access control: its address must keep answering 410.
const writeOnce: CollectionBeforeChangeHook = ({ operation, data }) => {
  if (operation === 'update') {
    throw new APIError('A retired listing is never changed.', 403, null, true)
  }
  return data
}

const keepRetired: CollectionBeforeDeleteHook = () => {
  throw new APIError(
    'A retired listing is never deleted: its address must keep answering "410 Gone".',
    403,
    null,
    true,
  )
}

// D34: a listing that has answered 410 for 12 months is deleted with its versions, and only its
// address and ID stay here, so that the address keeps answering 410 rather than 404 (PLAN §2.5,
// the privacy texts and the notice and takedown page). Written by the daily retention task
// (src/jobs/maintenance/purgeRetention.ts); the proxy reads it through src/lib/detail-lookup.ts.
export const RetiredListings: CollectionConfig = {
  slug: 'retired-listings',
  labels: { singular: 'Retired listing', plural: 'Retired listings' },
  admin: {
    group: 'Listings',
    useAsTitle: 'shortId',
    defaultColumns: ['shortId', 'slug', 'kind', 'retiredAt'],
    listSearchableFields: ['shortId', 'slug'],
    description: `Listings that were offline (answering "410 Gone") for ${OFFLINE_RECORD_MONTHS} months: the rest of the record has been deleted, and only the address and ID are kept, so the address keeps answering 410 (D34). Added by the daily retention task; never changed or deleted.`,
    pagination: { defaultLimit: 50 },
  },
  defaultSort: '-retiredAt',
  access: {
    // Signed-in editors read them; nobody adds, changes or deletes one (the task writes through
    // the local API, and the hooks above refuse the rest).
    read: signedIn,
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  disableDuplicate: true,
  hooks: {
    beforeChange: [writeOnce],
    beforeDelete: [keepRetired],
  },
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'job',
      options: RETIRED_KINDS.map(({ value, label }) => ({ value, label })),
    },
    {
      // Jobs' short IDs; a new job never takes one that is kept here (src/collections/Jobs.ts).
      name: 'shortId',
      label: 'Short ID',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      admin: { description: 'The last slug of its address.' },
    },
    {
      name: 'retiredAt',
      label: 'Retired',
      type: 'date',
      required: true,
      index: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
        description: 'When the rest of the record was deleted.',
      },
    },
  ],
}
