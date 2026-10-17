import type { Payload, Where } from 'payload'

import type { Region } from '@/lib/geography'
import { storedDay } from '@/lib/jobs/deadline'
import { JOBS_SORT, openJobsWhere } from '@/lib/jobs/query'
import { JOB_CARD_SELECT, JOB_POPULATE } from '@/lib/jobs/select'
import { type JobCard, type JobDoc, toJobCard } from '@/lib/jobs/view'

import {
  DEADLINES_MAX,
  type IssueContent,
  type IssueJob,
  type ProposalCandidate,
  SELECTED_MAX,
  SELECTED_PROPOSED,
  issueJob,
  proposeSelection,
} from './content'
import { deadlineWindow, issueMonth } from './schedule'

// An issue's content from the published jobs (M11, D53; PLAN §13): the deadlines of the 45 days
// from its date, and its selected positions in the editor's order. Built again for every preview
// and test while the issue is a draft; kept as the issue's snapshot when it is pushed to listmonk.

/** The fields of an issue the content is built from. */
export type IssueFields = {
  sendAt: string
  subject: string
  preheader?: string | null
  intro: string
  selected?: (number | { id: number })[] | null
}

const idOf = (value: number | { id: number }) => (typeof value === 'number' ? value : value.id)

/** A job as an issue reads it: the row, its summary, and its country's region. */
type IssueJobRow = JobCard & { summary: string | null; region: Region | null }

/**
 * Jobs for an issue: published and open at `now`, matching `where`, in `sort` order, at most
 * `limit`, with their summaries and their countries' regions; `total` counts every match. Public
 * facts only, as the job rows read them (src/lib/jobs/select.ts).
 */
async function jobsForIssue(
  payload: Payload,
  { where, sort, limit, now }: { where: Where[]; sort: string[]; limit: number; now: Date },
): Promise<{ jobs: IssueJobRow[]; total: number }> {
  const { docs, totalDocs } = await payload.find({
    collection: 'jobs',
    where: { and: [openJobsWhere(now), ...where] },
    sort,
    select: { ...JOB_CARD_SELECT, summary: true },
    populate: { ...JOB_POPULATE, countries: { name: true, region: true } },
    locale: 'en',
    limit,
    pagination: true,
    depth: 1,
  })
  const jobs = docs.flatMap((doc) => {
    const card = toJobCard(doc as JobDoc)
    if (!card) return []
    const country = doc.country as { region?: Region | null } | number | null | undefined
    const region = typeof country === 'object' && country !== null ? (country.region ?? null) : null
    return [{ ...card, summary: doc.summary?.trim() || null, region }]
  })
  return { jobs, total: totalDocs }
}

/** Selected positions should still be open a week after the issue arrives. */
const SELECTED_OPEN_DAYS = 7
const DAY_MS = 86_400_000

const toIssueJob = (row: IssueJobRow, withSummary: boolean): IssueJob | null =>
  issueJob(row, withSummary ? row.summary : null)

/**
 * The content of an issue as it would go out now: `now` is the moment of the request. Selected
 * positions that are no longer open, or will have closed by the issue's date, are left out
 * (`leftOut` counts them).
 */
export async function buildIssueContent(
  payload: Payload,
  issue: IssueFields,
  now: Date,
): Promise<{ content: IssueContent; leftOut: number }> {
  const sendAt = new Date(issue.sendAt)
  const window = deadlineWindow(sendAt)
  // Fixed deadlines from the issue's date (still open when it arrives) to the window's last day.
  const deadlines = await jobsForIssue(payload, {
    where: [
      { deadlineKind: { equals: 'fixed' } },
      { deadlineAt: { greater_than: sendAt.toISOString() } },
      { deadlineDate: { less_than_equal: storedDay(window.to) } },
    ],
    sort: JOBS_SORT.deadline,
    limit: DEADLINES_MAX,
    now,
  })
  const ids = (issue.selected ?? []).map(idOf).slice(0, SELECTED_MAX)
  const selectedRows =
    ids.length === 0
      ? []
      : (
          await jobsForIssue(payload, {
            // Open now and still open when the issue arrives.
            where: [
              { id: { in: ids } },
              {
                or: [
                  { deadlineKind: { not_equals: 'fixed' } },
                  { deadlineAt: { greater_than: sendAt.toISOString() } },
                ],
              },
            ],
            sort: ['id'],
            limit: ids.length,
            now,
          })
        ).jobs
  const byId = new Map(selectedRows.map((row) => [row.id, row]))
  const selected = ids.flatMap((id) => {
    const row = byId.get(id)
    return row ? (toIssueJob(row, true) ?? []) : []
  })
  const listed = deadlines.jobs.flatMap((row) => toIssueJob(row, false) ?? [])
  return {
    content: {
      version: 1,
      month: issueMonth(sendAt),
      sendAt: sendAt.toISOString(),
      subject: issue.subject.trim(),
      preheader: issue.preheader?.trim() ?? '',
      intro: issue.intro.trim(),
      deadlines: {
        from: window.from,
        to: window.to,
        jobs: listed,
        more: Math.max(0, deadlines.total - listed.length),
      },
      selected,
    },
    leftOut: ids.length - selected.length,
  }
}

/**
 * The positions the builder proposes for an issue dated `sendAt` (PLAN §13: balanced by subfield
 * and region): the newest open positions that are still open a week after it arrives, leaving out
 * those `exclude` names (the previous issue's selection), chosen by `proposeSelection`.
 */
export async function proposeSelectedJobs(
  payload: Payload,
  sendAt: Date,
  now: Date,
  exclude: readonly number[] = [],
): Promise<number[]> {
  const openUntil = new Date(sendAt.getTime() + SELECTED_OPEN_DAYS * DAY_MS).toISOString()
  const where: Where[] = [
    {
      or: [{ deadlineKind: { not_equals: 'fixed' } }, { deadlineAt: { greater_than: openUntil } }],
    },
    ...(exclude.length > 0 ? [{ id: { not_in: [...exclude] } }] : []),
  ]
  const { jobs } = await jobsForIssue(payload, {
    where,
    sort: JOBS_SORT.newest,
    limit: 300,
    now,
  })
  const candidates: ProposalCandidate[] = jobs.map((job) => ({
    id: job.id,
    region: job.region,
    subfield: job.subfields[0]?.slug ?? null,
  }))
  return proposeSelection(candidates, SELECTED_PROPOSED)
}
