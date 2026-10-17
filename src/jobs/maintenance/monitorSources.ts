import type { Payload } from 'payload'

import { errorSummary } from '@/lib/errors'
import { type Fetcher, politeFetcher } from '@/lib/monitors/http'
import { RobotsCache } from '@/lib/monitors/robots'
import {
  type MonitorDeps,
  type SourceResult,
  checkTerms,
  emptyCounts,
  runSource,
} from '@/lib/monitors/run'
import { AUTOMATIC_KINDS, scheduleDays } from '@/lib/sources/kinds'
import { loadTaxonomy } from '@/lib/tags/terms'
import type { Source } from '@/payload-types'

import { MONITOR_QUEUE, logCounts, maintenanceTask } from './task'

// The monitors (D52, PLAN §6.3): once a day, from 04:40 UTC (after the ROR import and the purge), every source that is on and due is
// read, one after another (so never two requests at once, to any host), until all are done or
// the run has used its time (the rest go first the next day). robots.txt is read again for every
// run. Each source's failure is recorded on it and the others go on. Only candidates are made:
// nothing is published.

/** The longest a run starts new sources for. */
const BUDGET_MS = 110 * 60_000

/** A source run less than this long before its next due time still counts as due. */
const SLACK_MS = 2 * 3_600_000

export function isDue(source: Pick<Source, 'lastRunAt' | 'schedule'>, now: Date): boolean {
  if (!source.lastRunAt) return true
  return (
    now.getTime() - Date.parse(source.lastRunAt) >=
    scheduleDays(source.schedule) * 86_400_000 - SLACK_MS
  )
}

/**
 * Keeps the record of one source's run (`source-runs`): its counts and the failure's kind. A record
 * that cannot be saved is logged and the run goes on.
 */
async function recordRun(payload: Payload, result: SourceResult, now: Date, byHand: boolean) {
  if (result.outcome === 'skipped') return
  try {
    await payload.create({
      collection: 'source-runs',
      data: {
        source: result.id,
        ranAt: now.toISOString(),
        byHand,
        outcome: result.outcome,
        error: result.error?.slice(0, 300) ?? null,
        ...result.counts,
      },
      depth: 0,
    })
  } catch (error) {
    payload.logger.warn(
      `monitorSources: source ${result.id}: its run could not be recorded (${errorSummary(error)})`,
    )
  }
}

export type MonitorCounts = {
  sources: number
  ok: number
  failed: number
  refused: number
  candidates: number
  read: number
  termsChanged: number
}

export type MonitorOptions = {
  /** Run these sources now, whether due or on (the first run by hand, `/api/ops/monitors/run/`). */
  only?: number[]
  fetcher?: Fetcher
  budgetMs?: number
  maxReads?: number
  /** The clock for the time budget (tests). */
  elapsed?: () => number
}

export async function monitorSources(
  payload: Payload,
  now: Date,
  options: MonitorOptions = {},
): Promise<{ counts: MonitorCounts; results: SourceResult[] }> {
  const counts: MonitorCounts = {
    sources: 0,
    ok: 0,
    failed: 0,
    refused: 0,
    candidates: 0,
    read: 0,
    termsChanged: 0,
  }
  const results: SourceResult[] = []
  const started = Date.now()
  const elapsed = options.elapsed ?? (() => Date.now() - started)
  const fetcher = options.fetcher ?? politeFetcher()
  const deps: MonitorDeps = {
    payload,
    fetcher,
    robots: new RobotsCache(fetcher),
    taxonomy: await loadTaxonomy(payload),
    now,
    maxReads: options.maxReads,
  }
  const { docs } = await payload.find({
    collection: 'sources',
    where: options.only
      ? { id: { in: options.only } }
      : { and: [{ kind: { in: AUTOMATIC_KINDS } }, { active: { equals: true } }] },
    depth: 1,
    limit: 2000,
    pagination: false,
  })
  // Never run first, then the longest ago; the order of `only` as given.
  const order = (source: Source) => (source.lastRunAt ? Date.parse(source.lastRunAt) : 0)
  const sources = options.only
    ? options.only.flatMap((id) => docs.filter((doc) => doc.id === id))
    : docs.filter((source) => isDue(source, now)).sort((a, b) => order(a) - order(b) || a.id - b.id)

  for (const source of sources) {
    if (elapsed() > (options.budgetMs ?? BUDGET_MS)) break
    counts.sources++
    let result: SourceResult
    try {
      result = await runSource(deps, source)
    } catch (error) {
      // The database, not the source: recorded here, and the run goes on with the next source.
      payload.logger.error(`monitorSources: source ${source.id} stopped (${errorSummary(error)})`)
      result = {
        id: source.id,
        outcome: 'failed',
        counts: emptyCounts(),
        error: errorSummary(error),
      }
    }
    results.push(result)
    await recordRun(payload, result, now, options.only !== undefined)
    if (result.outcome === 'ok') counts.ok++
    if (result.outcome === 'failed') counts.failed++
    if (result.outcome === 'refused') counts.refused++
    counts.candidates += result.counts.candidates
    counts.read += result.counts.read
    payload.logger.info(
      `monitorSources: source ${source.id} ${result.outcome}: ${result.counts.listed} listed, ${result.counts.new} new, ${result.counts.candidates} candidates, ${result.counts.notNeuroscience} not neuroscience, ${result.counts.closed} closed, ${result.counts.duplicates} duplicates${result.counts.capped ? `, ${result.counts.capped} left for later` : ''}${result.counts.failedPages ? `, ${result.counts.failedPages} pages failed` : ''}${result.error ? ` (${result.error})` : ''}`,
    )
    if (result.outcome !== 'skipped' && (await checkTerms(deps, source)) === 'changed') {
      counts.termsChanged++
    }
  }
  logCounts(payload, 'monitorSources', counts)
  return { counts, results }
}

export const MonitorSourcesTask = maintenanceTask({
  slug: 'monitorSources',
  label: 'Read the sources (monitors)',
  cron: '40 4 * * *',
  queue: MONITOR_QUEUE,
  counts: ['sources', 'ok', 'failed', 'refused', 'candidates', 'read', 'termsChanged'],
  run: async (payload, now) => (await monitorSources(payload, now)).counts,
})
