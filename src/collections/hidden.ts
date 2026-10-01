import type { CollectionConfig } from 'payload'

import { nobody } from '@/lib/access'

/**
 * What the collections of member data and the deletion log share (M4b, D49; the M4b design §6):
 * records that only the site's own code reads and writes (src/lib/members/store.ts, in SQL with
 * parameters, and the hooks), so nobody browses them in the admin or reaches them through the
 * API. Members export and delete their own data on the account pages; nothing about them is
 * browsable, not even by editors.
 *
 * - Every operation refuses, whoever asks (the local API's `overrideAccess` is the only way in).
 * - No REST routes at all (`endpoints: false`): every request under /api/<slug>/ answers 501, as
 *   for Payload's own migrations (tests/e2e/access.spec.ts).
 * - No versions, so a deletion leaves no copy behind; no copies and no locking (nobody edits
 *   them), which also keeps the locked-documents table from referring to them.
 */
export const HIDDEN_RECORDS = {
  admin: { hidden: true },
  access: {
    read: nobody,
    create: nobody,
    update: nobody,
    delete: nobody,
    readVersions: nobody,
    unlock: nobody,
  },
  endpoints: false,
  graphQL: false,
  disableDuplicate: true,
  lockDocuments: false,
} satisfies Partial<CollectionConfig>
