import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { type Fetcher, politeFetcher } from '@/lib/monitors/http'
import { checkLink } from '@/lib/monitors/links'
import { RobotsCache } from '@/lib/monitors/robots'

import { MONITOR_QUEUE, logCounts, maintenanceTask } from './task'

// The weekly link check (PLAN §6.3, M7): every published job's original page, the longest unchecked
// first, read as the monitors read. The job's link fields are written in SQL (no version: they are
// the check's record, not an editor's change); the dashboard lists the jobs whose page is gone,
// broken or says the position is filled. An editor's "the warning is wrong" holds until the check
// finds something else. Nothing is closed automatically.

/** The longest a run starts new checks for; the rest are checked first next week. */
const BUDGET_MS = 110 * 60_000

type Row = {
  id: number
  original_url: string
  link_status: string | null
  link_says_closed: boolean | null
}

export type LinkCounts = {
  checked: number
  ok: number
  redirect: number
  broken: number
  gone: number
  saysClosed: number
  unchecked: number
}

export async function checkLinks(
  payload: Payload,
  now: Date,
  options: { fetcher?: Fetcher; budgetMs?: number; elapsed?: () => number } = {},
): Promise<LinkCounts> {
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const started = Date.now()
  const elapsed = options.elapsed ?? (() => Date.now() - started)
  const fetcher = options.fetcher ?? politeFetcher()
  const robots = new RobotsCache(fetcher)
  const counts: LinkCounts = {
    checked: 0,
    ok: 0,
    redirect: 0,
    broken: 0,
    gone: 0,
    saysClosed: 0,
    unchecked: 0,
  }
  const { rows } = await db.execute<Row>(sql`
    SELECT id, original_url, link_status::text AS link_status, link_says_closed FROM jobs
    WHERE status = 'published' AND coalesce(original_url, '') <> ''
    ORDER BY last_checked_at ASC NULLS FIRST, id
    LIMIT 5000`)
  for (const row of rows) {
    if (elapsed() > (options.budgetMs ?? BUDGET_MS)) break
    const result = await checkLink(fetcher, robots, row.original_url)
    counts.checked++
    if (result.status === null) counts.unchecked++
    else counts[result.status]++
    if (result.saysClosed) counts.saysClosed++
    const status = result.status ?? row.link_status ?? 'unchecked'
    const says = result.status === null ? Boolean(row.link_says_closed) : result.saysClosed !== null
    const changed = status !== row.link_status || says !== Boolean(row.link_says_closed)
    await db.execute(sql`
      UPDATE jobs SET
        link_status = ${status},
        link_says_closed = ${says},
        link_note = ${result.note},
        last_checked_at = ${now.toISOString()},
        link_warning_dismissed = CASE WHEN ${changed} THEN false ELSE link_warning_dismissed END
      WHERE id = ${row.id}`)
  }
  logCounts(payload, 'checkLinks', counts)
  return counts
}

export const CheckLinksTask = maintenanceTask({
  slug: 'checkLinks',
  label: "Check published jobs' original pages (weekly)",
  // Sundays at 05:30 UTC, in the monitors' queue (after a day's monitor run, if one is still going).
  cron: '30 5 * * 0',
  queue: MONITOR_QUEUE,
  counts: ['checked', 'ok', 'redirect', 'broken', 'gone', 'saysClosed', 'unchecked'],
  run: (payload, now) => checkLinks(payload, now),
})
