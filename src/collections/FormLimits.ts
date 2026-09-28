import type { CollectionConfig } from 'payload'

import { nobody } from '@/lib/access'

// Short-lived rows behind the limits on public forms (src/lib/forms/rate-limit.ts): the HMAC of a
// client's IP address for each suggestion or report it sent, and a hash of each spam-check answer
// used.
// Deleted within 24 hours (D34), and never in backups: deploy/backup/backup.sh dumps the table
// without its rows. Only the form's own code reads and writes this table, in SQL within one
// locked transaction; nobody sees it in the admin or through the API.
export const FormLimits: CollectionConfig = {
  slug: 'form-limits',
  labels: { singular: 'Form limit', plural: 'Form limits' },
  admin: { hidden: true },
  // Every function refuses, whoever asks: the rows are the form's own records.
  access: {
    read: nobody,
    create: nobody,
    update: nobody,
    delete: nobody,
    readVersions: nobody,
    unlock: nobody,
  },
  graphQL: false,
  disableDuplicate: true,
  fields: [
    {
      // "ip:suggest:" or "ip:report:" + HMAC of the address, or "altcha:" + hash of the answer's
      // signature.
      name: 'key',
      type: 'text',
      required: true,
      index: true,
    },
  ],
}
