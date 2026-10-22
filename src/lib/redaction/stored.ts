import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { SUMMARY_MAX, aiDraftSchema } from '@/lib/ai/draft'
import { errorSummary } from '@/lib/errors'

import { type RedactionCounts, redact } from './redact'

// Redaction's second round over what is already stored (M7, third round; the operator's go-ahead
// of 2026-10-22): the waiting candidates' (New or Triaged) source text, title, the monitor's facts
// and the AI draft's quotes, redacted again with the new rules, and the same fields in their saved
// versions (`_candidates_v`), where Payload kept a copy of every save. Decided candidates keep
// theirs until the retention task deletes the text, 30 days after the decision (D34). The answer
// holds counts only, never text.

export type RedactAgainResult = {
  dryRun: boolean
  /** Waiting candidates looked at. */
  candidates: number
  /** Of those, how many changed: any field, the text, the title. */
  changed: number
  textsChanged: number
  titlesChanged: number
  /** What the new rules replaced, in texts, titles, facts and drafts. */
  inTexts: RedactionCounts
  inTitles: RedactionCounts
  inFactsAndDrafts: RedactionCounts
  /** Saved versions whose copy was redacted again. */
  versionsChanged: number
  failed: number
}

const zero = (): RedactionCounts => ({ email: 0, phone: 0, name: 0, link: 0 })

const addInto = (into: RedactionCounts, counts: RedactionCounts) => {
  for (const key of Object.keys(into) as (keyof RedactionCounts)[]) into[key] += counts[key]
}

/** `value` redacted, adding what was replaced to `counts`. */
function again(value: string, counts: RedactionCounts): string {
  const result = redact(value)
  addInto(counts, result.counts)
  return result.text
}

// The fields of the facts and the draft that hold words of the posting; never addresses, days,
// slugs or the time of a read.
const FACT_TEXT = new Set(['from', 'note', 'summary'])

/**
 * A copy of a stored facts or draft object with its words of the posting redacted again: every
 * `from`, `note` and `summary`, the title's value and the place's.
 */
function redactedJson(value: unknown, counts: RedactionCounts, key = ''): unknown {
  if (typeof value === 'string') {
    return FACT_TEXT.has(key) || key === 'title' || key === 'location'
      ? again(value, counts)
      : value
  }
  if (Array.isArray(value)) return value.map((item) => redactedJson(item, counts, key))
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [name, inner] of Object.entries(value)) {
      // A fact is { value, from }: its value is text only for the title and the location.
      result[name] =
        name === 'value' && (key === 'title' || key === 'location')
          ? redactedJson(inner, counts, key)
          : redactedJson(inner, counts, name)
    }
    return result
  }
  return value
}

const cut = (value: unknown, max: number) =>
  typeof value === 'string' && value.length > max ? `${value.slice(0, max - 1)}…` : value

/**
 * A redacted draft cut back to the draft's limits where a placeholder made a field longer (a
 * quote of 300 characters, a summary of 280), so that it stays a valid draft (`aiDraftSchema`):
 * an invalid one would silently drop out of the job it starts and of the closing of candidates.
 */
function fitDraft(draft: unknown): unknown {
  if (!draft || typeof draft !== 'object' || aiDraftSchema.safeParse(draft).success) return draft
  const value = draft as Record<string, unknown>
  const inner = (key: string) => {
    const part = value[key]
    return part && typeof part === 'object'
      ? {
          ...(part as Record<string, unknown>),
          from: cut((part as Record<string, unknown>).from, 300),
        }
      : part
  }
  return {
    ...value,
    from: cut(value.from, 300),
    summary: cut(value.summary, SUMMARY_MAX),
    note: cut(value.note, 500),
    deadline: inner('deadline'),
    place: inner('place'),
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

const db = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

type Row = {
  id: number
  raw_title: string | null
  snippet: string | null
  extracted: unknown
  ai_suggestion: unknown
}

/** Runs the redaction's current rules again over the waiting candidates and their versions. */
export async function redactWaitingAgain(
  payload: Payload,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<RedactAgainResult> {
  const result: RedactAgainResult = {
    dryRun,
    candidates: 0,
    changed: 0,
    textsChanged: 0,
    titlesChanged: 0,
    inTexts: zero(),
    inTitles: zero(),
    inFactsAndDrafts: zero(),
    versionsChanged: 0,
    failed: 0,
  }
  const { rows } = await db(payload).execute<Row>(sql`
    SELECT id, raw_title, snippet, extracted, ai_suggestion FROM candidates
    WHERE status IN ('new', 'triaged') ORDER BY id`)
  for (const row of rows) {
    result.candidates++
    const snippet = row.snippet == null ? null : again(row.snippet, result.inTexts)
    const title = row.raw_title == null ? null : again(row.raw_title, result.inTitles)
    const extracted =
      row.extracted == null ? null : redactedJson(row.extracted, result.inFactsAndDrafts)
    const draft =
      row.ai_suggestion == null
        ? null
        : fitDraft(redactedJson(row.ai_suggestion, result.inFactsAndDrafts))
    const textChanged = snippet !== row.snippet
    const titleChanged = title !== row.raw_title
    const changed =
      textChanged ||
      titleChanged ||
      !same(extracted, row.extracted) ||
      !same(draft, row.ai_suggestion)
    if (textChanged) result.textsChanged++
    if (titleChanged) result.titlesChanged++
    if (changed) result.changed++
    if (dryRun) continue
    try {
      if (changed) {
        await payload.update({
          collection: 'candidates',
          id: row.id,
          data: {
            snippet,
            rawTitle: title,
            extracted: extracted as never,
            aiSuggestion: draft as never,
          },
          depth: 0,
        })
      }
      result.versionsChanged += await redactVersionsAgain(payload, row.id)
    } catch (error) {
      result.failed++
      payload.logger.warn(
        `redactWaitingAgain: candidate ${row.id} could not be saved (${errorSummary(error)})`,
      )
    }
  }
  return result
}

/** The candidate's saved versions with their copies redacted again; how many changed. */
async function redactVersionsAgain(payload: Payload, parent: number): Promise<number> {
  const { rows } = await db(payload).execute<{
    id: number
    version_raw_title: string | null
    version_snippet: string | null
    version_extracted: unknown
    version_ai_suggestion: unknown
  }>(sql`
    SELECT id, version_raw_title, version_snippet, version_extracted, version_ai_suggestion
    FROM _candidates_v WHERE parent_id = ${parent} ORDER BY id`)
  let changed = 0
  for (const row of rows) {
    // Counted with the candidate already; a version repeats what the candidate held.
    const ignore = zero()
    const snippet = row.version_snippet == null ? null : again(row.version_snippet, ignore)
    const title = row.version_raw_title == null ? null : again(row.version_raw_title, ignore)
    const extracted =
      row.version_extracted == null ? null : redactedJson(row.version_extracted, ignore)
    const draft =
      row.version_ai_suggestion == null
        ? null
        : fitDraft(redactedJson(row.version_ai_suggestion, ignore))
    if (
      snippet === row.version_snippet &&
      title === row.version_raw_title &&
      same(extracted, row.version_extracted) &&
      same(draft, row.version_ai_suggestion)
    ) {
      continue
    }
    await db(payload).execute(sql`
      UPDATE _candidates_v SET version_snippet = ${snippet}, version_raw_title = ${title},
        version_extracted = ${extracted === null ? null : JSON.stringify(extracted)}::jsonb,
        version_ai_suggestion = ${draft === null ? null : JSON.stringify(draft)}::jsonb
      WHERE id = ${row.id}`)
    changed++
  }
  return changed
}
