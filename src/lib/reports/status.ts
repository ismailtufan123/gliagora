// "Report a problem" and removal requests (PLAN §3.2, §5.1 TakedownRequest, §7.5, §15.1, §15.4):
// what a report is about, how it is handled and how long it is kept. Kept apart from the
// collection (src/collections/Reports.ts) so the form, the admin dashboard and the tests share it.

import type { ItemType } from './item'

/** What is wrong, as the person chose it on the form. */
export const REPORT_KINDS = [
  { value: 'wrong-fact', label: 'A fact is wrong' },
  { value: 'closed', label: 'The position has closed' },
  { value: 'broken-link', label: 'A link does not work' },
  { value: 'not-employer', label: "Agency, or not the employer's own page" },
  {
    value: 'personal-rights',
    label: 'Personal rights: remove or correct content about the person (Law 5651 Art. 9)',
  },
  { value: 'other', label: 'Something else' },
] as const

export type ReportKind = (typeof REPORT_KINDS)[number]['value']

export const PERSONAL_RIGHTS: ReportKind = 'personal-rights'

/**
 * Kinds that only a job can have: a position closes, and a posting comes from the employer or
 * not. A report about an institution offers the others (D40).
 */
export const JOB_ONLY_KINDS: readonly ReportKind[] = ['closed', 'not-employer']

/**
 * The kinds the form offers, in its order: all of them for a report about a job and for a
 * general report (no item), the others without the job-only ones.
 */
export function kindsFor(itemType: ItemType | null | undefined): ReportKind[] {
  const all = REPORT_KINDS.map(({ value }) => value)
  return itemType && itemType !== 'job' ? all.filter((kind) => !JOB_ONLY_KINDS.includes(kind)) : all
}

export const REPORT_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'closed', label: 'Closed' },
] as const

export type ReportStatus = (typeof REPORT_STATUSES)[number]['value']

/** What was done, required to close a report. */
export const REPORT_ACTIONS = [
  { value: 'none', label: 'No change needed (the item was right)' },
  { value: 'corrected', label: 'Corrected' },
  { value: 'removed', label: 'Removed (listing withdrawn)' },
  { value: 'refused', label: 'Request refused (the person was told why)' },
  { value: 'not-applicable', label: 'Not applicable (spam, or not about our content)' },
] as const

export type ReportAction = (typeof REPORT_ACTIONS)[number]['value']

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

/**
 * A personal-rights request (Law 5651 Art. 9) is acknowledged, and first answered, within 24
 * hours: PLAN §3.2 ("24-hour target for takedowns"), §15.1 and §15.4 ("acknowledgement within 24
 * hours for personal-rights requests", [U] B2), as the notice and takedown page says.
 */
export const PERSONAL_RIGHTS_ANSWER_HOURS = 24

/**
 * Other reports and requests are answered within 30 days: the "30-day KVKK countdown" of PLAN
 * §3.2 (self-service privacy: corrections, objections and takedowns get an admin task with it),
 * from KVKK Art. 13 (§15.1, data subject rights).
 */
export const OTHER_ANSWER_DAYS = 30

/**
 * A report is kept for 2 years after it is closed, then deleted with its email address and
 * details: PLAN §18.1 ("data request / takedown correspondence: 2 years after closure", [U] B11)
 * and the privacy texts. The deletion is part of the retention task (src/jobs/maintenance/purgeRetention.ts).
 */
export const REPORT_RETENTION_YEARS = 2

/** When a report received at `receivedAt` must be answered. */
export function respondBy(kind: string | null | undefined, receivedAt: string | Date): string {
  const received = new Date(receivedAt).getTime()
  const wait =
    kind === PERSONAL_RIGHTS ? PERSONAL_RIGHTS_ANSWER_HOURS * HOUR_MS : OTHER_ANSWER_DAYS * DAY_MS
  return new Date(received + wait).toISOString()
}

/** When a report closed at `closedAt` is deleted (null while it is open). */
export function purgeAt(closedAt: string | null | undefined): string | null {
  const ms = closedAt ? Date.parse(closedAt) : Number.NaN
  if (Number.isNaN(ms)) return null
  const date = new Date(ms)
  // Calendar years in UTC; a report closed on 29 February is deleted on 1 March.
  date.setUTCFullYear(date.getUTCFullYear() + REPORT_RETENTION_YEARS)
  return date.toISOString()
}

/** Why a report cannot go from `from` to `to`, or null. `from` is undefined for a new report. */
export function statusProblem(
  from: ReportStatus | null | undefined,
  to: ReportStatus,
): string | null {
  if (from == null) return to === 'new' ? null : 'A report starts as New.'
  if (from !== 'new' && to === 'new') {
    return 'A report does not go back to New. Set it to In progress to reopen it.'
  }
  return null
}

/**
 * When a report was closed, after a save that leaves it in `status`: kept while it stays closed,
 * now when it is closed, and null when it is (re)opened. The day it is deleted follows.
 */
export function closing(
  saved: { status?: string | null; closedAt?: string | null } | undefined,
  status: ReportStatus,
  now: Date,
): { closedAt: string | null; purgeAt: string | null } {
  if (status !== 'closed') return { closedAt: null, purgeAt: null }
  const closedAt = saved?.status === 'closed' && saved.closedAt ? saved.closedAt : now.toISOString()
  return { closedAt, purgeAt: purgeAt(closedAt) }
}
