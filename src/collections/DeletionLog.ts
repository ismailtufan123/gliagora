import type { CollectionAfterDeleteHook, CollectionConfig } from 'payload'

import { isReapply, isRetention } from '@/lib/retention/context'

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
// transaction. A restore keeps this table's rows (deploy/backup/restore.sh carries them over), and
// the task `applyDeletionLog` (src/jobs/maintenance/applyDeletionLog.ts) repeats every 10 minutes
// each logged deletion whose record exists again, without logging it a second time. Record IDs
// only, no personal data; the retention task deletes rows 7 months after `at`, once no backup can
// hold the deleted data any more (6 months).
//
// A restore also sets the ID sequences back, so a record made after it can get a logged ID. Two
// rules keep that from deleting someone else's record: a logged deletion is repeated only on a
// record created no later than `at` (`deleteMember`'s `reapply` in src/lib/members/store.ts; the
// same condition for suggestions and reports), and the restore step moves the sequences of this
// table, `data_requests`, `members`, `submissions` and `reports` past every ID it carries over or
// that the log names, before the app starts.
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
    if (isRetention(context) || isReapply(context) || isFakeData(context)) return
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
