import type { CollectionConfig } from 'payload'

import { nobody, signedIn } from '@/lib/access'
import { POSTING_OUTCOMES } from '@/lib/sources/kinds'

// The postings each source's monitor has seen (D52, M7), so that a run reads only the postings that
// are new since the last one, and an editor can see why a posting did not become a candidate. One
// record per source and canonical address. Written only by the monitor (src/lib/monitors/), which
// keeps no more than the review queue needs: the address, the title with names removed, and the
// outcome. Records not seen for 180 days are deleted by the retention task.
export const SourcePostings: CollectionConfig = {
  slug: 'source-postings',
  labels: { singular: 'Posting seen', plural: 'Postings seen' },
  admin: {
    group: 'Sources',
    useAsTitle: 'title',
    defaultColumns: ['title', 'source', 'outcome', 'lastSeenAt'],
    listSearchableFields: ['title', 'url'],
    description:
      'What the monitors have seen on each source, and what became of it. Read only: a posting skipped as "not neuroscience" can still be added by hand as a candidate.',
    pagination: { defaultLimit: 50 },
  },
  defaultSort: '-lastSeenAt',
  access: {
    read: signedIn,
    // Only the monitor writes them, through the local API.
    create: nobody,
    update: nobody,
    delete: nobody,
    readVersions: nobody,
  },
  disableDuplicate: true,
  indexes: [{ fields: ['source', 'canonicalUrl'], unique: true }],
  fields: [
    { name: 'source', type: 'relationship', relationTo: 'sources', required: true, index: true },
    { name: 'canonicalUrl', label: 'Canonical address', type: 'text', required: true, index: true },
    { name: 'url', label: 'Address', type: 'text', required: true },
    {
      name: 'title',
      type: 'text',
      admin: { description: 'As the list or the posting gave it, with names removed.' },
    },
    {
      name: 'outcome',
      type: 'select',
      required: true,
      index: true,
      options: POSTING_OUTCOMES.map(({ value, label }) => ({ value, label })),
    },
    { name: 'candidate', type: 'relationship', relationTo: 'candidates' },
    {
      name: 'firstSeenAt',
      label: 'First seen',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' } },
    },
    {
      name: 'lastSeenAt',
      label: 'Last seen',
      type: 'date',
      required: true,
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' } },
    },
  ],
}
