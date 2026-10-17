import { z } from 'zod'

import { isCalendarDay } from '@/lib/jobs/deadline'
import { withoutTracking } from '@/lib/jobs/url'
import type { JobCard } from '@/lib/jobs/view'

import { MONTH_PATTERN } from './schedule'

// What an issue of Glia Notes says (M11, D53; PLAN §13), as one value that the email, its plain
// text and the archive page are all drawn from. While an issue is a draft it is built from the
// published jobs each time (src/lib/newsletter/issue/build.ts); when it is pushed to listmonk it is
// kept on the issue as its snapshot, so the email listmonk sends and the archive page show the
// same facts even after a job changes or is deleted. Only public facts of published jobs: nothing
// about any subscriber or editor.
//
// Sections follow §13, as far as their windows exist (D53): the opening note, the deadlines in the
// next 45 days and the selected positions. Papers, funding, news and Learn join with M8–M10, M12.

/** The most deadlines one issue lists; the rest are a link to the jobs list (the 100 KB cap). */
export const DEADLINES_MAX = 40

/** How many selected positions an issue has (PLAN §13: 10–15); the builder proposes 12. */
export const SELECTED_MIN = 10
export const SELECTED_MAX = 15
export const SELECTED_PROPOSED = 12

/** The opening note's limit: 2–3 sentences. */
export const INTRO_MAX = 600
export const SUBJECT_MAX = 120
/** A preheader longer than this is cut by most mail programs anyway. */
export const PREHEADER_MAX = 150

const deadlineSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('fixed'),
    day: z.string().refine(isCalendarDay),
    /** The time zone the deadline day ends in (IANA), or null: Anywhere on Earth. */
    timeZone: z.string().nullable(),
  }),
  z.object({ kind: z.enum(['rolling', 'until-filled']) }),
])

export const issueJobSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  /** The job's page on the site (relative, `/en/jobs/…/`). */
  path: z.string().startsWith('/en/jobs/'),
  /** The employer's own page, without tracking parameters (never with ours either). */
  originalUrl: z.string().nullable(),
  institution: z.string().nullable(),
  /** "City, Country", as far as known. */
  place: z.string().nullable(),
  positionType: z.string().nullable(),
  deadline: deadlineSchema,
  /** The job's own summary in our words (≤ 280 characters); selected positions only. */
  summary: z.string().nullable(),
})

export type IssueJob = z.infer<typeof issueJobSchema>

export const issueContentSchema = z.object({
  version: z.literal(1),
  month: z.string().regex(MONTH_PATTERN),
  /** The issue's date (ISO 8601). */
  sendAt: z.string().datetime(),
  subject: z.string().min(1).max(SUBJECT_MAX),
  preheader: z.string().max(PREHEADER_MAX),
  intro: z.string().min(1).max(INTRO_MAX),
  deadlines: z.object({
    from: z.string().refine(isCalendarDay),
    to: z.string().refine(isCalendarDay),
    jobs: z.array(issueJobSchema).max(DEADLINES_MAX),
    /** Deadlines in the window beyond those listed. */
    more: z.number().int().min(0),
  }),
  selected: z.array(issueJobSchema).max(SELECTED_MAX),
})

export type IssueContent = z.infer<typeof issueContentSchema>

/** A snapshot read back from the database, or null when it is not one (never trusted blindly). */
export function readSnapshot(value: unknown): IssueContent | null {
  const parsed = issueContentSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** A job as an issue lists it, from the row the jobs list shows. */
export function issueJob(card: JobCard, summary: string | null): IssueJob | null {
  const kind = card.deadlineKind ?? 'fixed'
  const day = card.deadlineDate?.slice(0, 10) ?? null
  const deadline: IssueJob['deadline'] | null =
    kind === 'fixed'
      ? day && isCalendarDay(day)
        ? { kind, day, timeZone: card.deadlineTz || null }
        : null
      : { kind }
  if (!deadline) return null
  const place = [card.city, card.country].filter(Boolean).join(', ')
  return {
    id: card.id,
    title: card.title,
    path: card.path,
    originalUrl: card.originalUrl ? withoutTracking(card.originalUrl) : null,
    institution: card.institution?.name ?? null,
    place: place || null,
    positionType: card.positionType?.label ?? null,
    deadline,
    summary: summary?.trim() || null,
  }
}

/** One job the builder may propose, with what balances the choice. */
export type ProposalCandidate = {
  id: number
  /** The region of the job's country (PLAN §4.6), or null. */
  region: string | null
  /** The job's first subfield (its slug), or null. */
  subfield: string | null
}

/**
 * The selected positions the builder proposes (PLAN §13: 10–15, balanced by subfield and region):
 * `candidates` come newest first; the regions take turns, the region with the most candidates
 * first, and within its turn a region gives its newest job whose subfield is not chosen yet (or,
 * when all its subfields are, its newest job). The editor reorders, removes or adds them.
 */
export function proposeSelection(
  candidates: readonly ProposalCandidate[],
  count: number = SELECTED_PROPOSED,
): number[] {
  const byRegion = new Map<string, ProposalCandidate[]>()
  for (const candidate of candidates) {
    const key = candidate.region ?? ''
    byRegion.set(key, [...(byRegion.get(key) ?? []), candidate])
  }
  // The most candidates first; ties keep the order of the newest job in each region.
  const regions = [...byRegion.entries()]
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([, jobs]) => jobs)
  const chosen: number[] = []
  const subfields = new Set<string>()
  while (chosen.length < count && regions.some((jobs) => jobs.length > 0)) {
    for (const jobs of regions) {
      if (chosen.length >= count) break
      if (jobs.length === 0) continue
      const fresh = jobs.findIndex((job) => job.subfield === null || !subfields.has(job.subfield))
      const [job] = jobs.splice(fresh === -1 ? 0 : fresh, 1)
      if (!job) continue
      chosen.push(job.id)
      if (job.subfield) subfields.add(job.subfield)
    }
  }
  return chosen
}
