// The review queue (PLAN §5.1, §5.2, §6.3). A candidate is a possible listing: from the "Suggest
// a listing" form (M4.5), added by an editor, or (from M7) found by a source monitor. It is new
// until an editor looks at it, triaged once they have, and then decided: accepted (a draft job is
// made from it), rejected with a reason, or marked as a duplicate of a job. A suggestion from the
// form follows its candidate; its email address, link and note are deleted 90 days after the
// decision (D34).

export const CANDIDATE_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'triaged', label: 'Triaged' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'duplicate', label: 'Duplicate' },
] as const

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number]['value']

/** The decided statuses. */
export const DECISIONS: readonly CandidateStatus[] = ['accepted', 'rejected', 'duplicate']

export const isDecided = (status: unknown) => DECISIONS.includes(status as CandidateStatus)

/**
 * What a candidate becomes when it is accepted. Jobs only for now; events (M8), funding (M9),
 * papers and news (M10) and resources (M12) are added with their collections.
 */
export const CANDIDATE_KINDS = [{ value: 'job', label: 'Job' }] as const

export type CandidateKind = (typeof CANDIDATE_KINDS)[number]['value']

/** Why a candidate is rejected (PLAN §6.1). */
export const REJECTION_REASONS = [
  { value: 'not-neuroscience', label: 'Not neuroscience' },
  {
    value: 'agency-or-intermediary',
    label: 'Placed by a recruitment agency or other intermediary (§6.1 rule 3, Law 4904)',
  },
  { value: 'closed', label: 'Closed, or the deadline has passed' },
  { value: 'not-a-position', label: 'Not a position' },
  { value: 'not-employer-page', label: "Not on the employer's own page" },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Other (say why in the note)' },
] as const

export type RejectionReason = (typeof REJECTION_REASONS)[number]['value']

/**
 * Why a candidate cannot go from `from` to `to`, or null. `from` is undefined for a candidate
 * that is being created. Accepted is final; a rejected or duplicate candidate can be reopened.
 */
export function transitionProblem(
  from: CandidateStatus | null | undefined,
  to: CandidateStatus,
): string | null {
  if (from == null) {
    return to === 'new' || to === 'triaged'
      ? null
      : 'A candidate starts as New or Triaged. Save it first, then decide.'
  }
  if (from === to) return null
  if (from === 'accepted') {
    return 'An accepted candidate is final. Change its job under "Job created" instead, or withdraw the job once it is published.'
  }
  if (isDecided(from) && to !== 'triaged') {
    return 'To change a decision, reopen the candidate first: set it to Triaged and save.'
  }
  if (from === 'triaged' && to === 'new') return 'A triaged candidate does not go back to New.'
  return null
}

/**
 * When the candidate was decided, after a save that leaves it in `status`: kept while it stays
 * in the same decision, now when it enters one, and null when it is (re)opened.
 */
export function decidedAt(
  saved: { status?: string | null; decidedAt?: string | null } | undefined,
  status: CandidateStatus,
  now: Date,
): string | null {
  if (!isDecided(status)) return null
  return saved?.status === status && saved.decidedAt ? saved.decidedAt : now.toISOString()
}

// Suggestions from the "Suggest a listing" form (PLAN §3.2).

/** The form's "content type". */
export const SUBMISSION_KINDS = [
  { value: 'position', label: 'Position' },
  { value: 'event', label: 'Event' },
  { value: 'funding', label: 'Funding' },
  { value: 'paper', label: 'Paper' },
  { value: 'news', label: 'News' },
  { value: 'resource', label: 'Resource' },
  { value: 'other', label: 'Other' },
] as const

export type SubmissionKind = (typeof SUBMISSION_KINDS)[number]['value']

/** The candidate a suggestion becomes. The other kinds wait as suggestions for their milestones. */
export const CANDIDATE_KIND_OF: Partial<Record<SubmissionKind, CandidateKind>> = {
  position: 'job',
}

export const SUBMISSION_STATUSES = [
  { value: 'new', label: 'New (not in the review queue)' },
  { value: 'queued', label: 'In the review queue' },
  { value: 'decided', label: 'Decided' },
] as const

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number]['value']

/** D34: a suggestion's email address, link and note are deleted this many days after the decision. */
export const SUBMISSION_RETENTION_DAYS = 90

const DAY_MS = 86_400_000

/** When a suggestion decided at `decided` loses its email address, link and note (D34). */
export function purgeAt(decided: string | null | undefined): string | null {
  const ms = decided ? Date.parse(decided) : Number.NaN
  return Number.isNaN(ms) ? null : new Date(ms + SUBMISSION_RETENTION_DAYS * DAY_MS).toISOString()
}

type SubmissionState = {
  status: SubmissionStatus
  decidedAt: string | null
  emailPurgeAt: string | null
}

/**
 * A suggestion's status after a save. With a candidate it follows the candidate: in the queue
 * until the candidate is decided, then decided when the candidate was. Without one, an editor
 * sets it: new, or decided (from the moment it was first set to decided).
 */
export function submissionState(
  candidate: { status?: string | null; decidedAt?: string | null } | null,
  own: { status: SubmissionStatus; saved?: { status?: string | null; decidedAt?: string | null } },
  now: Date,
): SubmissionState {
  let status: SubmissionStatus
  let decided: string | null
  if (candidate) {
    status = isDecided(candidate.status) ? 'decided' : 'queued'
    decided = status === 'decided' ? (candidate.decidedAt ?? now.toISOString()) : null
  } else {
    status = own.status
    decided =
      status === 'decided'
        ? own.saved?.status === 'decided' && own.saved.decidedAt
          ? own.saved.decidedAt
          : now.toISOString()
        : null
  }
  return { status, decidedAt: decided, emailPurgeAt: purgeAt(decided) }
}
