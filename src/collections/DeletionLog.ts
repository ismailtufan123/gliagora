import type { CollectionAfterDeleteHook, CollectionConfig } from 'payload'

import { isRetention } from '@/lib/retention/context'

import { HIDDEN_RECORDS } from './hidden'
import { isFakeData } from './Jobs'

/** What the log records deletions of. */
export const LOGGED_COLLECTIONS = ['members', 'submissions', 'reports'] as const
export type LoggedCollection = (typeof LOGGED_COLLECTIONS)[number]

/** A whole record deleted, or only its email address cleared (reports, on a data request). */
export const DELETION_ACTIONS = ['delete', 'clear-email'] as const

// Deletions that must survive a restore (M4b, D49; the M4b design §6, §7.9). Restoring a backup
// brings back everything deleted after it was taken. So every deletion of personal data that a
// person asked for (a data request, an account deleted in its settings, an editor deleting a
// suggestion or report on request) or that the inactivity rule made writes a row here, in the same
// transaction, and after a restore the site repeats each logged deletion whose record exists again
// (deploy/backup/restore.sh carries the log over). Record IDs only, no personal data; rows are
// deleted 7 months after `at`, once no backup can hold the deleted data any more (6 months).
//
// Deletions by the retention task are not logged: the task repeats itself after a restore,
// because the restored records' deletion dates have still passed. Removing the fake data of local
// runs (`pnpm fake:jobs`) is not logged either.
export const DeletionLog: CollectionConfig = {
  slug: 'deletion-log',
  labels: { singular: 'Deletion', plural: 'Deletion log' },
  ...HIDDEN_RECORDS,
  // `at` says when; Payload's own timestamps would only repeat it.
  timestamps: false,
  indexes: [{ fields: ['targetCollection', 'targetId'] }],
  fields: [
    {
      name: 'targetCollection',
      type: 'select',
      required: true,
      options: LOGGED_COLLECTIONS.map((value) => ({ value, label: value })),
    },
    { name: 'targetId', type: 'number', required: true },
    {
      name: 'action',
      type: 'select',
      required: true,
      defaultValue: 'delete',
      options: DELETION_ACTIONS.map((value) => ({ value, label: value })),
    },
    { name: 'at', type: 'date', required: true, index: true },
  ],
}

/**
 * An `afterDelete` hook that logs each deleted record of `collection`, through the deletion's own
 * request, so the row is written in its transaction (rolled back with it). Members are logged by
 * `deleteMember` (src/lib/members/store.ts), which deletes them in SQL.
 */
export function logDeletions(collection: Exclude<LoggedCollection, 'members'>) {
  const hook: CollectionAfterDeleteHook = async ({ id, req, context }) => {
    if (isRetention(context) || isFakeData(context)) return
    await req.payload.create({
      collection: 'deletion-log',
      data: {
        targetCollection: collection,
        targetId: Number(id),
        action: 'delete',
        at: new Date().toISOString(),
      },
      depth: 0,
      overrideAccess: true,
      req,
    })
  }
  return hook
}
