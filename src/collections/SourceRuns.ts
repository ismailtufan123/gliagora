import type { CollectionConfig, Field } from 'payload'

import { nobody, signedIn } from '@/lib/access'
import { RUN_OUTCOMES } from '@/lib/sources/kinds'

const count = (name: string, label: string, description?: string): Field => ({
  name,
  label,
  type: 'number',
  required: true,
  defaultValue: 0,
  admin: { description },
})

// One record per monitor run of one source (M7, second round): what the run found and skipped, so
// that the report on the monitors (/api/ops/monitors/report/) and the editors can see how each
// source does over time. Counts and the failure's kind only: no titles, addresses or text. Written
// only by the monitors (src/jobs/maintenance/monitorSources.ts); deleted after a year by the
// retention task.
export const SourceRuns: CollectionConfig = {
  slug: 'source-runs',
  labels: { singular: 'Monitor run', plural: 'Monitor runs' },
  admin: {
    group: 'Sources',
    defaultColumns: [
      'source',
      'ranAt',
      'outcome',
      'listed',
      'candidates',
      'notNeuroscience',
      'closed',
      'old',
      'capped',
    ],
    description:
      'Each run of a source\'s monitor, with what it found: the postings listed and new, the candidates made, and the postings skipped and why. Read only. Filter by "Source" to see one source\'s runs.',
    pagination: { defaultLimit: 50 },
  },
  defaultSort: '-ranAt',
  access: {
    read: signedIn,
    // Only the monitors write them, through the local API.
    create: nobody,
    update: nobody,
    delete: nobody,
    readVersions: nobody,
  },
  disableDuplicate: true,
  fields: [
    { name: 'source', type: 'relationship', relationTo: 'sources', required: true, index: true },
    {
      name: 'ranAt',
      label: 'Run',
      type: 'date',
      required: true,
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' } },
    },
    {
      name: 'byHand',
      label: 'Run by hand',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Started by the operator (/api/ops/monitors/run/), not the schedule.' },
    },
    {
      name: 'outcome',
      type: 'select',
      required: true,
      index: true,
      options: RUN_OUTCOMES.map(({ value, label }) => ({ value, label })),
    },
    {
      name: 'error',
      type: 'text',
      maxLength: 300,
      admin: { description: "The failure's kind and HTTP status, never a page's text." },
    },
    count('listed', 'Listed', 'Postings on the list.'),
    count('new', 'New', 'Postings not seen on earlier runs.'),
    count('read', 'Read', 'New postings whose page was read (or that the API gave whole).'),
    count('candidates', 'Candidates', 'Candidates made.'),
    count('notNeuroscience', 'Not neuroscience', 'Skipped: no neuroscience words.'),
    count('closed', 'Closed', 'Skipped: the deadline has passed, or the page is gone.'),
    count('duplicates', 'Duplicates', 'Skipped: already a candidate or a job.'),
    count('old', 'Old', 'Skipped: no fixed deadline, and published over 6 months ago.'),
    count('capped', 'Left for later', 'New postings over the cap of one run (read next time).'),
    count('failedPages', 'Pages failed', 'New postings whose page failed (read next time).'),
  ],
}
