import { type ReportStatus, closing } from '@/lib/reports/status'
import { DATA_REQUEST_ANSWER_DAYS, UNCONFIRMED_REQUEST_DAYS } from '@/lib/retention/rules'

// How a data request is handled and how long it is kept (M4b, D49; the M4b design §6, §7.8). A
// request from the form is recorded at once but acted on only after the person confirms it with
// the link in our email: until then it is "unconfirmed" and holds only its kind, its date and a
// keyed hash of the address (the database refuses more), and it is deleted 60 days later. Once
// confirmed it is answered within 30 days of receipt (KVKK Art. 13) and, like a report, deleted 2
// years after it is closed (the report helpers in src/lib/reports/status.ts).

export const DATA_REQUEST_STATUSES = [
  { value: 'unconfirmed', label: 'Not confirmed yet' },
  { value: 'new', label: 'New' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'closed', label: 'Closed' },
] as const

export type DataRequestStatus = (typeof DATA_REQUEST_STATUSES)[number]['value']

/** What was done, required to close a request. */
export const DATA_REQUEST_ACTIONS = [
  { value: 'deleted-automatically', label: 'Deleted automatically (confirmed by the person)' },
  { value: 'answered', label: 'Answered (done as asked)' },
  { value: 'refused', label: 'Refused (the person was told why)' },
  { value: 'not-applicable', label: 'Not applicable (spam, a mistake, or not about our data)' },
] as const

export type DataRequestAction = (typeof DATA_REQUEST_ACTIONS)[number]['value']

/** Set only by the site, when it deleted the data itself. */
export const AUTOMATIC_ACTION: DataRequestAction = 'deleted-automatically'

const DAY_MS = 86_400_000

const plusDays = (at: string | Date, days: number) =>
  new Date(new Date(at).getTime() + days * DAY_MS).toISOString()

/** When a confirmed request received at `receivedAt` must be answered (30 days from receipt). */
export const answerBy = (receivedAt: string | Date) =>
  plusDays(receivedAt, DATA_REQUEST_ANSWER_DAYS)

/**
 * Why a request cannot go from `from` to `to`, or null; `from` is undefined for a new record.
 * Editors (signed in, in the admin or through the API) record requests that arrive by email, as
 * New; they can neither make a request unconfirmed nor confirm one, which only the person's link
 * does. The site's own code records what the form or the account settings did (unconfirmed, or a
 * closed account deletion). Nobody moves a request back to New.
 */
export function statusProblem(
  from: DataRequestStatus | null | undefined,
  to: DataRequestStatus,
  byEditor: boolean,
): string | null {
  if (byEditor) {
    if (from == null) return to === 'new' ? null : 'A request recorded by hand starts as New.'
    if (from === 'unconfirmed') {
      return to === 'unconfirmed'
        ? null
        : 'An unconfirmed request changes only when the person confirms it with the link in our email.'
    }
    if (to === 'unconfirmed') return 'Only the form records unconfirmed requests.'
  } else {
    if (from == null) return null
    if (to === 'unconfirmed' && from !== 'unconfirmed') {
      return 'A confirmed request does not go back to unconfirmed.'
    }
  }
  if (from !== 'new' && from !== 'unconfirmed' && to === 'new') {
    return 'A request does not go back to New. Set it to In progress to reopen it.'
  }
  return null
}

/** Why an editor cannot choose `action`, or null: "deleted automatically" is the site's own. */
export function actionProblem(
  previous: string | null | undefined,
  action: string | null | undefined,
  byEditor: boolean,
): string | null {
  return byEditor && action === AUTOMATIC_ACTION && previous !== AUTOMATIC_ACTION
    ? 'Only the site sets "Deleted automatically", when it deleted the data itself.'
    : null
}

/**
 * The dates that follow from a save leaving the request in `status`: unconfirmed, nothing is due
 * and the record goes 60 days after receipt; otherwise the answer is due 30 days after receipt,
 * and a closed request is deleted 2 years after it was closed (as reports).
 */
export function requestDates(
  saved: { status?: string | null; closedAt?: string | null } | undefined,
  status: DataRequestStatus,
  receivedAt: string,
  now: Date,
): { respondBy: string | null; closedAt: string | null; purgeAt: string | null } {
  if (status === 'unconfirmed') {
    return {
      respondBy: null,
      closedAt: null,
      purgeAt: plusDays(receivedAt, UNCONFIRMED_REQUEST_DAYS),
    }
  }
  return { respondBy: answerBy(receivedAt), ...closing(saved, status as ReportStatus, now) }
}
