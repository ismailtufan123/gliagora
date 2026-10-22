import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { storedDraft } from '@/lib/ai/draft'
import { errorSummary } from '@/lib/errors'
import { hasClosed } from '@/lib/monitors/dates'
import { storedFacts } from '@/lib/sources/facts'

import { inTransaction, logCounts, maintenanceTask } from './task'

// PLAN §2.5, §3.2, §6.3: a published job is marked Expired within an hour of the end of its
// deadline day. Its page already shows it as closed from that moment (listingState), so this
// brings the status, the admin and the checklist in line: the collection's hooks set `expiredAt`
// and clear "position still open" and "deadline confirmed", as when an editor closes it.
//
// A candidate whose deadline passed while it waited (M7, third round: about 20 did before the
// first "Update the jobs") closes by itself too: rejected as "Closed, or the deadline has passed",
// with a note that says which deadline. Only a New candidate (nobody decided or reopened it) whose
// monitor read a deadline: the later of the monitor's and the AI draft's day counts, and a draft
// that says rolling or open until filled keeps it open. A candidate without the monitor's deadline
// (a suggestion, one an editor added) waits for "Update the jobs". Nothing is published here.

const BATCH = 50
const MAX_BATCHES = 20

/** Published jobs whose fixed deadline has ended by `now`, oldest deadline first. */
async function dueJobs(payload: Payload, now: Date, after: number): Promise<number[]> {
  const { docs } = await payload.find({
    collection: 'jobs',
    where: {
      and: [
        { status: { equals: 'published' } },
        { deadlineKind: { equals: 'fixed' } },
        { deadlineAt: { less_than_equal: now.toISOString() } },
        { id: { greater_than: after } },
      ],
    },
    select: {},
    sort: 'id',
    depth: 0,
    limit: BATCH,
    pagination: false,
  })
  return docs.map((doc) => doc.id)
}

/**
 * Marks one job as expired through the collection, in a transaction that first locks the job's
 * row and checks it again, so an editor who withdrew or corrected it a moment ago wins.
 */
async function expire(payload: Payload, id: number, now: Date): Promise<boolean> {
  return inTransaction(payload, async (req, db) => {
    const { rows } = await db.execute<{ id: number }>(
      sql`SELECT id FROM jobs WHERE id = ${id} AND status = 'published' AND deadline_kind = 'fixed' AND deadline_at <= ${now.toISOString()} FOR UPDATE`,
    )
    if (rows.length === 0) return false
    await payload.update({ collection: 'jobs', id, data: { status: 'expired' }, depth: 0, req })
    return true
  })
}

/**
 * The fixed deadline by which a waiting candidate closes by itself, with where it came from: the
 * monitor's, or the AI draft's when that is later (some drafts took UC Recruit's review date,
 * while the monitor read its final date); none without the monitor's, or when the draft says
 * rolling or open until filled. A draft's day alone is never enough: nothing checked it.
 */
export function waitingDeadline(candidate: {
  aiSuggestion?: unknown
  extracted?: unknown
}): { date: string; from: string } | null {
  const facts = storedFacts(candidate.extracted)
  if (!facts?.deadline) return null
  const fromFacts = { date: facts.deadline.value.date, from: "the monitor's facts" }
  const draft = storedDraft(candidate.aiSuggestion)
  if (!draft?.deadline) return fromFacts
  if (draft.deadline.kind !== 'fixed' || !draft.deadline.date) return null
  return draft.deadline.date > fromFacts.date
    ? { date: draft.deadline.date, from: 'the AI draft' }
    : fromFacts
}

/** New candidates whose deadline day has ended everywhere, closed as such. */
async function closeWaitingCandidates(payload: Payload, now: Date) {
  const counts = { candidatesClosed: 0, candidatesFailed: 0 }
  let after = 0
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { docs } = await payload.find({
      collection: 'candidates',
      where: {
        and: [
          { status: { equals: 'new' } },
          { kind: { equals: 'job' } },
          { id: { greater_than: after } },
          { extracted: { exists: true } },
        ],
      },
      select: { aiSuggestion: true, extracted: true },
      sort: 'id',
      depth: 0,
      limit: BATCH * 4,
      pagination: false,
    })
    for (const candidate of docs) {
      const deadline = waitingDeadline(candidate)
      if (!deadline || !hasClosed(deadline.date, now)) continue
      try {
        // Only while it is still New: an editor's decision a moment ago wins.
        const { docs: saved } = await payload.update({
          collection: 'candidates',
          where: { and: [{ id: { equals: candidate.id } }, { status: { equals: 'new' } }] },
          data: {
            status: 'rejected',
            decisionReason: 'closed',
            decisionNote: `Closed by itself: its deadline, ${deadline.date} (${deadline.from}), passed while it waited.`,
          },
          depth: 0,
        })
        if (saved.length > 0) counts.candidatesClosed++
      } catch (error) {
        counts.candidatesFailed++
        payload.logger.warn(
          `expireListings: candidate ${candidate.id} could not be closed (${errorSummary(error)})`,
        )
      }
    }
    if (docs.length < BATCH * 4) break
    after = docs.at(-1)!.id
  }
  return counts
}

export async function expireListings(payload: Payload, now: Date) {
  const counts = { expired: 0, failed: 0, candidatesClosed: 0, candidatesFailed: 0 }
  let after = 0
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const ids = await dueJobs(payload, now, after)
    for (const id of ids) {
      try {
        if (await expire(payload, id, now)) counts.expired++
      } catch (error) {
        // A job the collection refuses to save stays for an editor; the admin shows why.
        counts.failed++
        payload.logger.warn(
          `expireListings: job ${id} could not be marked as expired (${errorSummary(error)})`,
        )
      }
    }
    if (ids.length < BATCH) break
    after = ids.at(-1) as number
  }
  Object.assign(counts, await closeWaitingCandidates(payload, now))
  logCounts(payload, 'expireListings', counts)
  return counts
}

export const ExpireListingsTask = maintenanceTask({
  slug: 'expireListings',
  label: 'Mark jobs whose deadline has passed as expired, and close waiting candidates likewise',
  // Every hour at minute 5: deadlines end on the hour, or at :15 or :30 in a few time zones, so a
  // job is marked at most 50 minutes after its deadline ends (rules.test.ts checks every zone).
  cron: '5 * * * *',
  counts: ['expired', 'failed', 'candidatesClosed', 'candidatesFailed'],
  run: expireListings,
})
