import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { redacted } from '@/lib/redaction/redact'
import { storedFacts } from '@/lib/sources/facts'
import type { StoredTagSuggestions } from '@/lib/tags/terms'

// The report on the monitors (M7, second round; /api/ops/monitors/report/): how each source's runs
// went, what became of its candidates, and which postings were skipped and why, so that the rules
// and the sources can be judged on real runs. Read only. It returns counts, IDs, outcomes, dates and
// titles with names removed (the one redaction function, again on titles the monitor stored
// redacted); never a candidate's source text or notes, a posting's address, or anything about
// members.

export const REPORT_PARTS = ['sources', 'candidates', 'skipped'] as const

export type ReportPart = (typeof REPORT_PARTS)[number]

export type ReportOptions = {
  /** Only this source. */
  source?: number
  /** Only these parts (all by default). */
  parts?: readonly ReportPart[]
}

type Counts = Record<string, number>

export type SourceReport = {
  id: number
  name: string
  kind: string
  monitorOn: boolean
  schedule: string
  allNeuroscience: boolean
  needsAttention: boolean
  attentionReason: string | null
  consecutiveFailures: number
  lastError: string | null
  lastRunAt: string | null
  lastSuccessAt: string | null
  robotsAllowed: boolean | null
  /** The runs recorded (`source-runs`), by outcome, and how many were started by hand. */
  runs: {
    total: number
    ok: number
    failed: number
    refused: number
    byHand: number
    first: string | null
    last: string | null
  }
  /** The failed runs by the failure's kind ("the list: status 403"). */
  failures: Counts
  /** What the runs found, added up over the runs recorded (`capped`: the last run's). */
  found: Counts
  /** The postings the monitor remembers (`source-postings`), by outcome. */
  postings: Counts
  /** Its candidates by status, and the rejected ones by the editor's reason. */
  candidates: Counts
  rejections: Counts
}

export type CandidateRow = {
  id: number
  source: number
  title: string | null
  status: string
  reason: string | null
  createdAt: string
  decidedAt: string | null
  /** The deadline the monitor found (a day), or null. */
  deadline: string | null
  /** "rolling" or "until-filled", when the posting names no day. */
  openEnded: string | null
  /** When the employer published it, where the source says. */
  published: string | null
  /** Days since it was published, when it has no fixed deadline and may be filled. */
  possiblyFilled: number | null
  /** Whether the monitor read the posting's own page, and if not, why. */
  page: string | null
  /** The suggested position type (slug), or null. */
  type: string | null
  /** The suggested subfields' labels. */
  subfields: string[]
}

export type SkippedRow = {
  source: number
  title: string | null
  outcome: string
  firstSeenAt: string
  lastSeenAt: string
}

export type MonitorReport = {
  generatedAt: string
  sources?: SourceReport[]
  candidates?: CandidateRow[]
  skipped?: SkippedRow[]
}

const db = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

const iso = (value: unknown): string | null =>
  value === null || value === undefined ? null : new Date(value as string).toISOString()

/** Adds `n` to `counts[key]`. */
const add = (counts: Counts, key: string, n: number) => {
  counts[key] = (counts[key] ?? 0) + n
}

const RUN_COUNTS = [
  'listed',
  'new',
  'read',
  'candidates',
  'not_neuroscience',
  'closed',
  'duplicates',
  'old',
  'failed_pages',
] as const

const camel = (name: string) => name.replace(/[-_]([a-z])/g, (_, c: string) => c.toUpperCase())

async function sourceReports(payload: Payload, only?: number): Promise<SourceReport[]> {
  const where = only === undefined ? sql`` : sql`WHERE id = ${only}`
  const { rows: sources } = await db(payload).execute<Record<string, unknown>>(sql`
    SELECT id, name, kind::text AS kind, active, schedule::text AS schedule, all_neuroscience,
      needs_attention, attention_reason, consecutive_failures, last_error, last_run_at,
      last_success_at, robots_allowed
    FROM sources ${where} ORDER BY id`)
  const bySource = new Map<number, SourceReport>()
  for (const row of sources) {
    const id = Number(row.id)
    bySource.set(id, {
      id,
      name: String(row.name),
      kind: String(row.kind),
      monitorOn: Boolean(row.active),
      schedule: String(row.schedule),
      allNeuroscience: Boolean(row.all_neuroscience),
      needsAttention: Boolean(row.needs_attention),
      attentionReason: (row.attention_reason as string | null) ?? null,
      consecutiveFailures: Number(row.consecutive_failures ?? 0),
      lastError: (row.last_error as string | null) ?? null,
      lastRunAt: iso(row.last_run_at),
      lastSuccessAt: iso(row.last_success_at),
      robotsAllowed: row.robots_allowed === null ? null : Boolean(row.robots_allowed),
      runs: { total: 0, ok: 0, failed: 0, refused: 0, byHand: 0, first: null, last: null },
      failures: {},
      found: {},
      postings: {},
      candidates: {},
      rejections: {},
    })
  }
  const sourceFilter = (column: string) =>
    only === undefined ? sql`` : sql`WHERE ${sql.raw(column)} = ${only}`

  const { rows: runs } = await db(payload).execute<Record<string, unknown>>(sql`
    SELECT source_id, outcome::text AS outcome, error, by_hand, ran_at, capped,
      ${sql.raw(RUN_COUNTS.join(', '))}
    FROM source_runs ${sourceFilter('source_id')} ORDER BY ran_at, id`)
  for (const run of runs) {
    const report = bySource.get(Number(run.source_id))
    if (!report) continue
    const at = iso(run.ran_at)
    report.runs.total++
    if (run.outcome === 'ok' || run.outcome === 'failed' || run.outcome === 'refused')
      report.runs[run.outcome]++
    if (run.by_hand) report.runs.byHand++
    report.runs.first ??= at
    report.runs.last = at
    if (run.outcome === 'failed') add(report.failures, String(run.error ?? 'unknown'), 1)
    for (const name of RUN_COUNTS) add(report.found, camel(name), Number(run[name] ?? 0))
    report.found.capped = Number(run.capped ?? 0)
  }

  const { rows: postings } = await db(payload).execute<Record<string, unknown>>(sql`
    SELECT source_id, outcome::text AS outcome, count(*)::int AS n
    FROM source_postings ${sourceFilter('source_id')} GROUP BY source_id, outcome`)
  for (const row of postings) {
    const report = bySource.get(Number(row.source_id))
    if (report) add(report.postings, camel(String(row.outcome)), Number(row.n))
  }

  const { rows: candidates } = await db(payload).execute<Record<string, unknown>>(sql`
    SELECT source_id, status::text AS status, decision_reason::text AS reason, count(*)::int AS n
    FROM candidates
    WHERE source_id IS NOT NULL ${only === undefined ? sql`` : sql`AND source_id = ${only}`}
    GROUP BY source_id, status, decision_reason`)
  for (const row of candidates) {
    const report = bySource.get(Number(row.source_id))
    if (!report) continue
    add(report.candidates, String(row.status), Number(row.n))
    if (row.status === 'rejected')
      add(report.rejections, String(row.reason ?? 'none'), Number(row.n))
  }
  return [...bySource.values()]
}

async function candidateRows(payload: Payload, only?: number): Promise<CandidateRow[]> {
  const { docs } = await payload.find({
    collection: 'candidates',
    where: only === undefined ? { source: { exists: true } } : { source: { equals: only } },
    // Never the source text, the AI draft, the notes or the address.
    select: {
      source: true,
      rawTitle: true,
      status: true,
      decisionReason: true,
      decidedAt: true,
      createdAt: true,
      extracted: true,
      tagSuggestions: true,
    },
    sort: 'id',
    depth: 0,
    limit: 0,
    pagination: false,
  })
  return docs.map((doc) => {
    const facts = storedFacts(doc.extracted)
    const tags = (doc.tagSuggestions ?? null) as StoredTagSuggestions | null
    return {
      id: Number(doc.id),
      source: Number(doc.source),
      title: redacted(doc.rawTitle),
      status: doc.status,
      reason: doc.decisionReason ?? null,
      createdAt: doc.createdAt,
      decidedAt: doc.decidedAt ?? null,
      deadline: facts?.deadline?.value.date ?? null,
      openEnded: facts?.openEnded?.value ?? null,
      published: facts?.published?.value ?? null,
      possiblyFilled: facts?.possiblyFilled?.value.days ?? null,
      page: facts?.page ?? null,
      type: tags?.positionType?.slug ?? null,
      subfields: (tags?.subfields ?? []).map((suggestion) => suggestion.label),
    }
  })
}

async function skippedRows(payload: Payload, only?: number): Promise<SkippedRow[]> {
  const { rows } = await db(payload).execute<Record<string, unknown>>(sql`
    SELECT source_id, title, outcome::text AS outcome, first_seen_at, last_seen_at
    FROM source_postings
    WHERE outcome <> 'candidate' ${only === undefined ? sql`` : sql`AND source_id = ${only}`}
    ORDER BY source_id, outcome, first_seen_at, id`)
  return rows.map((row) => ({
    source: Number(row.source_id),
    title: redacted(row.title as string | null),
    outcome: String(row.outcome),
    firstSeenAt: iso(row.first_seen_at)!,
    lastSeenAt: iso(row.last_seen_at)!,
  }))
}

/** The report on the monitors, for one source or all. */
export async function monitorReport(
  payload: Payload,
  now: Date,
  options: ReportOptions = {},
): Promise<MonitorReport> {
  const parts = new Set(options.parts?.length ? options.parts : REPORT_PARTS)
  const report: MonitorReport = { generatedAt: now.toISOString() }
  if (parts.has('sources')) report.sources = await sourceReports(payload, options.source)
  if (parts.has('candidates')) report.candidates = await candidateRows(payload, options.source)
  if (parts.has('skipped')) report.skipped = await skippedRows(payload, options.source)
  return report
}
