import type { GlobalConfig } from 'payload'

// The state of the ROR import, shown read-only in the admin: which release is in the database,
// when the import last looked for a new one, and what the last run changed.
export const RorImport: GlobalConfig = {
  slug: 'ror-import',
  label: 'ROR import',
  admin: {
    group: 'System',
    description:
      'The institutions are updated from the ROR data dump on Zenodo. The server checks for a new release every night and imports it (PLAN §6.2).',
  },
  access: {
    // Written only by the import job.
    update: () => false,
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'release', label: 'Release in the database', type: 'text' },
        { name: 'releaseDate', label: 'Release date', type: 'text' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'lastImportedAt', label: 'Last import', type: 'date' },
        { name: 'lastCheckedAt', label: 'Last check for a new release', type: 'date' },
      ],
    },
    {
      name: 'counts',
      label: 'Last import',
      type: 'group',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'read', type: 'number' },
            { name: 'created', type: 'number' },
            { name: 'updated', type: 'number' },
            { name: 'unchanged', type: 'number' },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'skipped', type: 'number', admin: { description: 'Withdrawn in ROR' } },
            { name: 'invalid', type: 'number' },
            { name: 'failed', type: 'number', admin: { description: 'See the server log' } },
          ],
        },
      ],
    },
    { name: 'lastError', label: 'Last error', type: 'textarea' },
  ],
}
