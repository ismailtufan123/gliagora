import type { CollectionConfig } from 'payload'

import { HIDDEN_RECORDS } from '../hidden'

// What members save (M4b, D7, D49; PLAN §5.1): positions now, events and programs with M8 and M9,
// each in a typed relationship of its own rather than one ID for every kind. At most 500 per
// member (src/lib/members/store.ts). One row per member and job (a unique index).
//
// Both relationships are optional on purpose: the database clears them when their target is
// deleted (ON DELETE SET NULL), and a required one would refuse every deletion of a saved job. A
// job's saved items are deleted with the job instead, by a hook on the jobs collection, in the
// same transaction; the clean-up task also removes any row whose job or member is gone.
export const SavedItems: CollectionConfig = {
  slug: 'saved-items',
  labels: { singular: 'Saved item', plural: 'Saved items' },
  ...HIDDEN_RECORDS,
  indexes: [{ fields: ['member', 'job'], unique: true }],
  fields: [
    { name: 'member', type: 'relationship', relationTo: 'members', index: true },
    {
      name: 'itemType',
      type: 'select',
      required: true,
      defaultValue: 'job',
      options: [{ value: 'job', label: 'Job' }],
    },
    { name: 'job', type: 'relationship', relationTo: 'jobs', index: true },
  ],
}
