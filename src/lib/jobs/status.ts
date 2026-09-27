// The status workflow of listings (PLAN §5.2): draft → in review → published → expired or
// withdrawn. Once published, a listing's address must keep answering (200 while open, 410 once
// gone, PLAN §2.5), so it never goes back to draft or review and is never deleted.

export const JOB_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In review' },
  { value: 'published', label: 'Published' },
  { value: 'expired', label: 'Expired' },
  { value: 'withdrawn', label: 'Withdrawn' },
] as const

export type JobStatus = (typeof JOB_STATUSES)[number]['value']

/** Statuses that need every fact a public listing shows (PLAN §6.4). */
export const NEEDS_FACTS: readonly JobStatus[] = ['in_review', 'published']

export const needsFacts = (status: unknown) => NEEDS_FACTS.includes(status as JobStatus)

/** When a job entered its states; set by the collection, never typed by editors. */
export type StatusTimes = {
  publishedAt: string | null
  expiredAt: string | null
  withdrawnAt: string | null
}

type Saved = Partial<{ status: JobStatus | null } & { [K in keyof StatusTimes]: string | null }>

/**
 * The status timestamps after a save that leaves the job in `status`. `publishedAt` is the first
 * publication and never changes; re-opening an expired or withdrawn job (publishing it again)
 * clears the closing times.
 */
export function statusTimes(saved: Saved | undefined, status: JobStatus, now: Date): StatusTimes {
  const at = now.toISOString()
  const stays = saved?.status === status
  const publishedAt = saved?.publishedAt ?? (status === 'published' ? at : null)
  switch (status) {
    case 'published':
      return { publishedAt, expiredAt: null, withdrawnAt: null }
    case 'expired':
      return {
        publishedAt,
        expiredAt: (stays ? saved?.expiredAt : null) ?? at,
        withdrawnAt: null,
      }
    case 'withdrawn':
      return {
        publishedAt,
        expiredAt: saved?.expiredAt ?? null,
        withdrawnAt: (stays ? saved?.withdrawnAt : null) ?? at,
      }
    default:
      return {
        publishedAt,
        expiredAt: saved?.expiredAt ?? null,
        withdrawnAt: saved?.withdrawnAt ?? null,
      }
  }
}

/** Why a job cannot be in `status`, or null. `wasPublished`: it has been public before. */
export function statusProblem(status: JobStatus, wasPublished: boolean): string | null {
  if (wasPublished && (status === 'draft' || status === 'in_review')) {
    return 'A job that has been published cannot go back to draft or review, because its address must keep working. Correct it while it is published, or set it to Expired or Withdrawn.'
  }
  if (!wasPublished && (status === 'expired' || status === 'withdrawn')) {
    return 'Only a job that has been published can be expired or withdrawn. A draft that is not needed can be deleted.'
  }
  return null
}
