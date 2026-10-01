import type { CollectionConfig } from 'payload'

import { HIDDEN_RECORDS } from '../hidden'

// Members' sessions (M4b, D49; PLAN §18.1): one row per signed-in browser, at most 20 per member
// (the oldest go first). The cookie holds a random token; the row holds only its SHA-256, so the
// table (or a backup) signs nobody in, and backups leave its rows out (deploy/backup/backup.sh):
// a restore signs everyone out. No IP address, no browser name. A session lasts 30 days from
// sign-in and is never extended; a new sign-in makes a new row and deletes the one it replaces.
export const MemberSessions: CollectionConfig = {
  slug: 'member-sessions',
  labels: { singular: 'Member session', plural: 'Member sessions' },
  ...HIDDEN_RECORDS,
  fields: [
    // Optional, as every relationship the database clears when its target goes; deleteMember
    // deletes the rows itself (src/lib/members/store.ts).
    { name: 'member', type: 'relationship', relationTo: 'members', index: true },
    // SHA-256 (hex) of the cookie's token; the database refuses anything else.
    { name: 'tokenHash', type: 'text', required: true, unique: true },
    { name: 'expiresAt', type: 'date', required: true, index: true },
  ],
}
