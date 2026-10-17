// Where an issue of Glia Notes stands (M11, D53). `draft` until an editor pushes it; then
// listmonk's campaign status, as the push and the site's check of the campaign (every 10 minutes)
// read it: listmonk's draft, scheduled, running (sending), paused, cancelled, finished (sent).

export const ISSUE_STATUSES = [
  { value: 'draft', label: 'Draft (not in listmonk)' },
  { value: 'pushed', label: 'In listmonk, as a draft' },
  { value: 'scheduled', label: 'Scheduled in listmonk' },
  { value: 'sending', label: 'Sending' },
  { value: 'paused', label: 'Paused in listmonk' },
  { value: 'cancelled', label: 'Cancelled in listmonk' },
  { value: 'sent', label: 'Sent' },
] as const

export type IssueStatus = (typeof ISSUE_STATUSES)[number]['value']

/**
 * While listmonk has the campaign scheduled, sending, paused or sent, the issue's content is locked:
 * listmonk would otherwise send something else than the issue shows. Pushing a scheduled issue as a
 * draft again unlocks it.
 */
export const LOCKED_STATUSES: ReadonlySet<IssueStatus> = new Set([
  'scheduled',
  'sending',
  'paused',
  'sent',
])

/**
 * Scheduled, sending, paused or sent: listmonk has the snapshot, so the preview and a test show the
 * snapshot, never content built again (an issue in listmonk as a draft is still being edited: it
 * previews what a new push would send).
 */
export const FROZEN_STATUSES: ReadonlySet<IssueStatus> = LOCKED_STATUSES

/** The issue's status for listmonk's campaign status (null: one listmonk does not document). */
export function statusFromListmonk(status: string): IssueStatus | null {
  switch (status) {
    case 'draft':
      return 'pushed'
    case 'scheduled':
      return 'scheduled'
    case 'running':
      return 'sending'
    case 'paused':
      return 'paused'
    case 'cancelled':
      return 'cancelled'
    case 'finished':
      return 'sent'
    default:
      return null
  }
}
