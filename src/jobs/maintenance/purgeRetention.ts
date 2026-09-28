import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
import type { SQL } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

import { errorSummary } from '@/lib/errors'
import { GONE_AFTER_DAYS } from '@/lib/jobs/deadline'
import type { JobStatus } from '@/lib/jobs/status'
import { RETENTION } from '@/lib/retention/context'
import {
  isRetirable,
  retireSearchCutoff,
  snippetCutoff,
  suggestionLinkCutoff,
} from '@/lib/retention/rules'

import { type SqlRunner, inTransaction, logCounts, maintenanceTask } from './task'

// The daily retention task (D34, PLAN §18.1, the privacy texts). It deletes exactly this, and
// nothing else:
// - a candidate's source text, 30 days after the decision, in the candidate and in every saved
//   version of it (Payload copies each save into `_candidates_v`, where editors could read and
//   restore it);
// - a suggestion, with its email address, link and note, from its `emailPurgeAt` (90 days after
//   the decision); for a candidate from it that was rejected or marked as a duplicate, also the
//   suggested link and title (with the address and title fingerprints made from them), in the
//   candidate and its versions. The same happens 90 days after the decision to such a candidate
//   whose suggestion was deleted earlier by hand (a data request), found by `fromSuggestion`.
//   The candidate keeps its status, reason, decision date and links; an accepted one keeps its
//   address, which is the employer's page we published, while the listing exists;
// - a listing that has answered 410 for 12 months: its address and ID are kept in
//   `retired-listings` (so it keeps answering 410), and the job is deleted with its versions;
//   the candidate it was made from and those marked as its duplicate keep their decision, without
//   the posting's address and title (also in their versions), and reports that pointed to it keep
//   theirs, without the link;
// - a closed report, 2 years after it was closed (`purgeAt`), with any versions.
// Form-limit rows (hashed IP addresses) go hourly, in purgeFormLimits.

const BATCH = 100
const MAX_BATCHES = 20
const DAY_MS = 86_400_000

const DECIDED = sql`('accepted', 'rejected', 'duplicate')`

/** `(1, 2, 3)` for an `IN` clause; `ids` is never empty here. */
const idList = (ids: readonly number[]): SQL =>
  sql`(${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )})`

const drizzle = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

/** A candidate row or version that still holds a posting's address or title. */
const HOLDS_LINK = sql`(c.raw_url IS NOT NULL OR c.raw_title IS NOT NULL
  OR c.canonical_url IS NOT NULL OR c.fingerprint IS NOT NULL
  OR EXISTS (SELECT 1 FROM _candidates_v v WHERE v.parent_id = c.id
    AND (v.version_raw_url IS NOT NULL OR v.version_raw_title IS NOT NULL
      OR v.version_canonical_url IS NOT NULL OR v.version_fingerprint IS NOT NULL)))`

/**
 * Clears the posting's address and title (with the canonical address and title fingerprint made
 * from them) from the candidates `ids` and all their versions; everything else stays.
 */
async function clearLinks(db: SqlRunner, ids: readonly number[]): Promise<void> {
  if (ids.length === 0) return
  await db.execute(sql`
    UPDATE candidates
    SET raw_url = NULL, raw_title = NULL, canonical_url = NULL, fingerprint = NULL
    WHERE id IN ${idList(ids)}`)
  await db.execute(sql`
    UPDATE _candidates_v
    SET version_raw_url = NULL, version_raw_title = NULL,
      version_canonical_url = NULL, version_fingerprint = NULL
    WHERE parent_id IN ${idList(ids)}`)
}

/** IDs from `query`, in batches by ID, until a batch is short or MAX_BATCHES is reached. */
async function eachBatch(
  query: (after: number) => SQL,
  payload: Payload,
  work: (ids: number[]) => Promise<void>,
): Promise<void> {
  let after = 0
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { rows } = await drizzle(payload).execute<{ id: number }>(query(after))
    const ids = rows.map((row) => Number(row.id))
    if (ids.length > 0) await work(ids)
    if (ids.length < BATCH) return
    after = ids.at(-1) as number
  }
}

/** (b) Source text of candidates decided 30 days ago, in the candidates and their versions. */
export async function purgeSnippets(payload: Payload, now: Date): Promise<number> {
  const cutoff = snippetCutoff(now).toISOString()
  let purged = 0
  await eachBatch(
    (after) => sql`
      SELECT c.id FROM candidates c
      WHERE c.id > ${after} AND c.status IN ${DECIDED} AND c.decided_at <= ${cutoff}
        AND (c.snippet IS NOT NULL OR EXISTS (
          SELECT 1 FROM _candidates_v v WHERE v.parent_id = c.id AND v.version_snippet IS NOT NULL))
      ORDER BY c.id LIMIT ${BATCH}`,
    payload,
    async (ids) => {
      purged += await inTransaction(payload, async (_req, db) => {
        // Checked again under a lock: a candidate reopened since is not decided any more.
        const { rows } = await db.execute<{ id: number }>(sql`
          SELECT id FROM candidates
          WHERE id IN ${idList(ids)} AND status IN ${DECIDED} AND decided_at <= ${cutoff}
          FOR UPDATE`)
        const due = rows.map((row) => Number(row.id))
        if (due.length === 0) return 0
        await db.execute(sql`UPDATE candidates SET snippet = NULL WHERE id IN ${idList(due)}`)
        await db.execute(
          sql`UPDATE _candidates_v SET version_snippet = NULL WHERE parent_id IN ${idList(due)}`,
        )
        return due.length
      })
    },
  )
  return purged
}

/**
 * (c) Suggestions whose personal data is due (`emailPurgeAt`), with the suggested link and title of
 * their rejected or duplicate candidates; then, at the same time after the decision, the link and
 * title of rejected or duplicate candidates whose suggestion was deleted earlier by hand. Returns
 * how many suggestions were deleted and how many candidates lost the link.
 */
export async function purgeSuggestions(
  payload: Payload,
  now: Date,
): Promise<{ suggestions: number; candidates: number }> {
  const at = now.toISOString()
  const result = { suggestions: 0, candidates: 0 }
  await eachBatch(
    (after) => sql`
      SELECT id FROM submissions WHERE id > ${after} AND email_purge_at <= ${at}
      ORDER BY id LIMIT ${BATCH}`,
    payload,
    async (ids) => {
      const done = await inTransaction(payload, async (req, db) => {
        // Checked again under a lock: a suggestion whose candidate was reopened is not due.
        const { rows } = await db.execute<{ id: number }>(sql`
          SELECT id FROM submissions WHERE id IN ${idList(ids)} AND email_purge_at <= ${at}
          FOR UPDATE`)
        const due = rows.map((row) => Number(row.id))
        if (due.length === 0) return { suggestions: 0, candidates: 0 }
        const candidates = await db.execute<{ id: number }>(sql`
          SELECT c.id FROM candidates c
          WHERE c.status IN ('rejected', 'duplicate')
            AND (c.submission_id IN ${idList(due)}
              OR c.id IN (SELECT candidate_id FROM submissions WHERE id IN ${idList(due)}))
          FOR UPDATE`)
        const cleared = candidates.rows.map((row) => Number(row.id))
        await clearLinks(db, cleared)
        // Through the collection, which also deletes any versions; the database clears the links
        // to it from candidates and jobs. One at a time: the transaction has one connection.
        for (const id of due) {
          await payload.delete({ collection: 'submissions', id, depth: 0, req })
        }
        return { suggestions: due.length, candidates: cleared.length }
      })
      result.suggestions += done.suggestions
      result.candidates += done.candidates
    },
  )
  // A suggestion deleted by hand (a data request) no longer leads to its candidate, which keeps
  // `fromSuggestion`: its link and title go at the moment the suggestion's would have.
  const cutoff = suggestionLinkCutoff(now).toISOString()
  const orphaned = sql`c.from_suggestion AND c.submission_id IS NULL
    AND c.status IN ('rejected', 'duplicate') AND c.decided_at <= ${cutoff}`
  await eachBatch(
    (after) => sql`
      SELECT c.id FROM candidates c
      WHERE c.id > ${after} AND ${orphaned} AND ${HOLDS_LINK}
      ORDER BY c.id LIMIT ${BATCH}`,
    payload,
    async (ids) => {
      result.candidates += await inTransaction(payload, async (_req, db) => {
        // Checked again under a lock: a candidate reopened since is not decided any more.
        const { rows } = await db.execute<{ id: number }>(sql`
          SELECT c.id FROM candidates c WHERE c.id IN ${idList(ids)} AND ${orphaned}
          FOR UPDATE`)
        const due = rows.map((row) => Number(row.id))
        await clearLinks(db, due)
        return due.length
      })
    },
  )
  return result
}

type ListingRow = {
  id: number
  short_id: string | null
  slug: string | null
  status: JobStatus
  deadline_kind: 'fixed' | 'rolling' | 'until-filled'
  deadline_at: Date | string | null
  expired_at: Date | string | null
  withdrawn_at: Date | string | null
}

/**
 * (d) Listings offline for 12 months: the address and ID go into `retired-listings`, the address
 * and title of the posting leave the candidates that point to the job, then the job is deleted with
 * its versions, in one transaction per job. Returns how many were retired and how many could not be.
 */
export async function retireListings(
  payload: Payload,
  now: Date,
): Promise<{ retired: number; failed: number }> {
  // Only a superset is read here (the listing closed or was withdrawn long enough ago);
  // `isRetirable` decides for each job.
  const gone = retireSearchCutoff(now)
  const closed = new Date(gone.getTime() - GONE_AFTER_DAYS * DAY_MS).toISOString()
  const result = { retired: 0, failed: 0 }
  await eachBatch(
    (after) => sql`
      SELECT id FROM jobs
      WHERE id > ${after} AND status IN ('published', 'expired', 'withdrawn')
        AND (withdrawn_at <= ${gone.toISOString()} OR expired_at <= ${closed}
          OR (deadline_kind = 'fixed' AND deadline_at <= ${closed}))
      ORDER BY id LIMIT ${BATCH}`,
    payload,
    async (ids) => {
      for (const id of ids) {
        try {
          const retired = await inTransaction(payload, async (req, db) => {
            const { rows } = await db.execute<ListingRow>(sql`
              SELECT id, short_id, slug, status, deadline_kind, deadline_at, expired_at, withdrawn_at
              FROM jobs WHERE id = ${id} FOR UPDATE`)
            const job = rows[0]
            if (!job?.short_id || !job.slug) return false
            const dates = {
              status: job.status,
              deadlineKind: job.deadline_kind,
              deadlineAt: job.deadline_at,
              expiredAt: job.expired_at,
              withdrawnAt: job.withdrawn_at,
            }
            if (!isRetirable(dates, now)) return false
            // Only the address and ID stay (D34): the candidate the job was made from and those
            // marked as its duplicate keep their decision, without the posting's address and title.
            // First, since deleting the job clears their links to it.
            const linked = await db.execute<{ id: number }>(sql`
              SELECT id FROM candidates WHERE published_ref_id = ${id} OR duplicate_of_id = ${id}
              FOR UPDATE`)
            await clearLinks(
              db,
              linked.rows.map((row) => Number(row.id)),
            )
            const kept = await payload.count({
              collection: 'retired-listings',
              where: { shortId: { equals: job.short_id } },
              req,
            })
            if (kept.totalDocs === 0) {
              await payload.create({
                collection: 'retired-listings',
                data: {
                  kind: 'job',
                  shortId: job.short_id,
                  slug: job.slug,
                  retiredAt: now.toISOString(),
                },
                depth: 0,
                req,
              })
            }
            await payload.delete({
              collection: 'jobs',
              id,
              depth: 0,
              req,
              context: { retention: RETENTION },
            })
            return true
          })
          if (retired) result.retired++
        } catch (error) {
          result.failed++
          payload.logger.warn(
            `purgeRetention: job ${id} could not be retired (${errorSummary(error)})`,
          )
        }
      }
    },
  )
  return result
}

/** (e) Closed reports whose 2 years after closing have passed (`purgeAt`), with any versions. */
export async function purgeReports(payload: Payload, now: Date): Promise<number> {
  const at = now.toISOString()
  let deleted = 0
  await eachBatch(
    (after) => sql`
      SELECT id FROM reports WHERE id > ${after} AND status = 'closed' AND purge_at <= ${at}
      ORDER BY id LIMIT ${BATCH}`,
    payload,
    async (ids) => {
      const done = await payload.delete({
        collection: 'reports',
        where: {
          and: [
            { id: { in: ids } },
            { status: { equals: 'closed' } },
            { purgeAt: { less_than_equal: at } },
          ],
        },
        depth: 0,
      })
      if (done.errors.length > 0) throw new Error('A report could not be deleted')
      deleted += done.docs.length
    },
  )
  return deleted
}

export async function purgeRetention(payload: Payload, now: Date) {
  const snippets = await purgeSnippets(payload, now)
  const suggestions = await purgeSuggestions(payload, now)
  const listings = await retireListings(payload, now)
  const reports = await purgeReports(payload, now)
  const counts = {
    snippets,
    suggestions: suggestions.suggestions,
    candidateLinks: suggestions.candidates,
    listings: listings.retired,
    listingsFailed: listings.failed,
    reports,
  }
  logCounts(payload, 'purgeRetention', counts)
  return counts
}

export const PurgeRetentionTask = maintenanceTask({
  slug: 'purgeRetention',
  label: 'Delete personal data and old listings when their retention period ends',
  // Every night at 04:15 UTC, after the ROR import (03:30).
  cron: '15 4 * * *',
  counts: ['snippets', 'suggestions', 'candidateLinks', 'listings', 'listingsFailed', 'reports'],
  run: purgeRetention,
})
