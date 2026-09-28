import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { jobLocation } from '@/collections/Jobs'
import { errorSummary } from '@/lib/errors'

import { inTransaction, logCounts, maintenanceTask } from './task'

// PLAN §20 (M4.1 open point): a job's country and city are copied from its institution when the
// job is saved, for the filters and the map. When the nightly ROR import moves an institution, its
// jobs are saved again here, which copies the new place (the same code as an editor's save).
// Jobs with a location of their own (both city and country) are left alone.

const PAGE = 500
const MAX_SAVES = 500

export type PlaceRow = {
  id: number
  country_id: string | null
  city: string | null
  override_city: string | null
  override_country_id: string | null
  institution_country_id: string | null
  institution_city: string | null
}

/** Jobs whose place may come from their institution, in pages by ID. */
async function page(payload: Payload, after: number): Promise<PlaceRow[]> {
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const { rows } = await db.execute<PlaceRow>(sql`
    SELECT j.id, j.country_id, j.city,
      j.location_override_city AS override_city,
      j.location_override_country_id AS override_country_id,
      i.country_id AS institution_country_id, i.city AS institution_city
    FROM jobs j JOIN institutions i ON i.id = j.institution_id
    WHERE j.id > ${after}
      AND (coalesce(j.location_override_city, '') = '' OR j.location_override_country_id IS NULL)
    ORDER BY j.id
    LIMIT ${PAGE}`)
  return rows
}

/** Whether the job's stored place differs from what a save would copy now. */
export function placeIsStale(row: PlaceRow): boolean {
  // A complete location of its own does not depend on the institution (as in the collection).
  if (row.override_city && row.override_country_id) return false
  const expected = jobLocation(
    { city: row.override_city, country: row.override_country_id },
    { city: row.institution_city, country: row.institution_country_id },
  )
  return (
    (expected.country ?? null) !== (row.country_id ?? null) ||
    (expected.city ?? null) !== (row.city ?? null)
  )
}

export async function syncJobPlaces(payload: Payload) {
  const counts = { updated: 0, failed: 0 }
  let after = 0
  for (;;) {
    const rows = await page(payload, after)
    for (const row of rows.filter(placeIsStale)) {
      if (counts.updated + counts.failed >= MAX_SAVES) break
      try {
        // An empty save: the collection copies the place from the institution again. The job's
        // row is locked first, so an editor's save at the same moment is not overwritten.
        await inTransaction(payload, async (req, db) => {
          await db.execute(sql`SELECT id FROM jobs WHERE id = ${row.id} FOR UPDATE`)
          await payload.update({ collection: 'jobs', id: row.id, data: {}, depth: 0, req })
        })
        counts.updated++
      } catch (error) {
        // For example a published job whose deadline passed minutes ago and that the hourly
        // expiry has not closed yet: it is saved again tomorrow.
        counts.failed++
        payload.logger.warn(
          `syncJobPlaces: job ${row.id} could not be saved (${errorSummary(error)})`,
        )
      }
    }
    if (rows.length < PAGE || counts.updated + counts.failed >= MAX_SAVES) break
    after = rows.at(-1)?.id as number
  }
  logCounts(payload, 'syncJobPlaces', counts)
  return counts
}

export const SyncJobPlacesTask = maintenanceTask({
  slug: 'syncJobPlaces',
  label: "Update jobs' places after institutions moved",
  // Every night at 04:45 UTC, after the ROR import (03:30) and the retention task (04:15).
  cron: '45 4 * * *',
  counts: ['updated', 'failed'],
  run: (payload) => syncJobPlaces(payload),
})
