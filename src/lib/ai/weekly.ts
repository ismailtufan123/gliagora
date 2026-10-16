import type { Payload } from 'payload'
import { z } from 'zod'

import { TIME_ZONES } from '@/lib/jobs/time-zones'
import { loadTaxonomy, termKey } from '@/lib/tags/terms'
import type { Vocabulary } from '@/lib/taxonomy'
import type { Candidate, Institution } from '@/payload-types'

import { type AiDraft, SUMMARY_MAX, aiDraftSchema } from './draft'
import { type DraftInput, draftInput, inputHash } from './input'

// The weekly AI drafts by Claude Code (PLAN §6.6, D52), the first way in: the operator says "Do the
// weekly drafts" and Claude Code, on the operator's computer, exports the candidates that wait for
// a draft from the server (redacted text only), writes a draft for each and imports them into the
// candidates' `aiSuggestion` (docs/weekly-drafts.md). Through the operations routes
// /api/ops/ai-drafts/export/ and /import/ (src/lib/ops/auth.ts). An editor accepts or changes each
// draft; nothing reaches the public site without the editor.

export const EXPORT_FORMAT = 'gliagora-ai-drafts-export/1'
export const IMPORT_FORMAT = 'gliagora-ai-drafts/1'

/** The most candidates one export holds. */
export const EXPORT_LIMIT = 100

export type ExportedCandidate = { id: number; inputHash: string; input: DraftInput }

export type DraftExport = {
  format: typeof EXPORT_FORMAT
  exportedAt: string
  candidates: ExportedCandidate[]
  /** The terms a draft may name, by vocabulary: slug and label. */
  vocabularies: Record<
    'positionType' | 'subfields' | 'careerStages',
    Array<{ slug: string; label: string }>
  >
  rules: string[]
}

/** The rules a draft follows, in the export and in the API's instructions. */
export const DRAFT_RULES = [
  `summary: at most ${SUMMARY_MAX} characters, in plain English, in our own words: never copy a sentence of the posting; say what the position is, where and on what; no names of people, no contact details, no claims the text does not support.`,
  'positionType, subfields (1 to 3) and careerStages (0 to 2): slugs from the vocabularies only; start from suggestedTags and correct them from the text.',
  'deadline: kind "fixed" with the day (YYYY-MM-DD) only when the text gives a day; "rolling" or "until-filled" when it says so; timeZone only when the text names one clearly (an IANA name), else null; null when the text says nothing about a deadline.',
  'place: the city and the ISO country code the text names; null when it names none (the institution is known).',
  'from: for the draft, say what it was written from; for the deadline and the place, quote briefly (at most 120 characters) where in the input it stands.',
  'note: anything the editor should check (an unclear deadline, a second employer, a posting that is not a position).',
  'Write only from the input. If the input is not a position in neuroscience, still draft it and say so in the note.',
]

/** Candidates that wait for an AI draft: new or triaged positions with a source text and no draft. */
async function waiting(payload: Payload, limit: number): Promise<Candidate[]> {
  const { docs } = await payload.find({
    collection: 'candidates',
    where: {
      and: [
        { status: { in: ['new', 'triaged'] } },
        { kind: { equals: 'job' } },
        { aiSuggestion: { exists: false } },
        { snippet: { exists: true } },
      ],
    },
    sort: 'createdAt',
    depth: 1,
    limit,
    pagination: false,
  })
  return docs
}

const institutionOf = (candidate: Candidate) =>
  candidate.institution && typeof candidate.institution === 'object'
    ? (candidate.institution as Institution)
    : null

/** The export for the weekly drafts: only redacted text, never an address or a note. */
export async function exportForDrafts(
  payload: Payload,
  now: Date,
  limit = EXPORT_LIMIT,
): Promise<DraftExport> {
  const taxonomy = await loadTaxonomy(payload)
  const terms = (vocabulary: Vocabulary) =>
    [...taxonomy.byKey]
      .filter(([key]) => key.startsWith(`${vocabulary}/`))
      .map(([key, term]) => ({ slug: key.slice(vocabulary.length + 1), label: term.label }))
  const candidates = (await waiting(payload, limit)).map((candidate) => {
    const input = draftInput(candidate, institutionOf(candidate))
    return { id: candidate.id, inputHash: inputHash(input), input }
  })
  return {
    format: EXPORT_FORMAT,
    exportedAt: now.toISOString(),
    candidates,
    vocabularies: {
      positionType: terms('position-type'),
      subfields: terms('subfield'),
      careerStages: terms('career-stage'),
    },
    rules: DRAFT_RULES,
  }
}

export const importSchema = z.strictObject({
  format: z.literal(IMPORT_FORMAT),
  drafts: z
    .array(z.strictObject({ id: z.number().int().positive(), draft: z.unknown() }))
    .max(EXPORT_LIMIT),
})

export type DraftOutcome =
  'applied' | 'invalid' | 'missing' | 'decided' | 'has-draft' | 'text-changed'

const zones: ReadonlySet<string> = new Set(TIME_ZONES)

/**
 * Why `draft` cannot be stored, or null: its shape, its terms (each in its vocabulary and active),
 * its country (a known code) and its time zone.
 */
export async function draftProblem(payload: Payload, draft: AiDraft): Promise<string | null> {
  const taxonomy = await loadTaxonomy(payload)
  const known = (vocabulary: Vocabulary, slug: string) =>
    taxonomy.byKey.has(termKey(vocabulary, slug))
  if (draft.positionType && !known('position-type', draft.positionType))
    return 'unknown position type'
  if (draft.subfields.some((slug) => !known('subfield', slug))) return 'unknown subfield'
  if (draft.careerStages.some((slug) => !known('career-stage', slug))) return 'unknown career stage'
  if (draft.deadline?.timeZone && !zones.has(draft.deadline.timeZone)) return 'unknown time zone'
  if (draft.place?.country) {
    const country = await payload.find({
      collection: 'countries',
      where: { id: { equals: draft.place.country } },
      select: {},
      depth: 0,
      limit: 1,
    })
    if (country.docs.length === 0) return 'unknown country'
  }
  return null
}

/**
 * Stores `draft` on the candidate `id`, if the candidate still waits for one and the draft was
 * written from its current input (the hash). Both ways in use this.
 */
export async function applyDraft(
  payload: Payload,
  id: number,
  value: unknown,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<{ outcome: DraftOutcome; problem?: string }> {
  const parsed = aiDraftSchema.safeParse(value)
  if (!parsed.success) {
    return {
      outcome: 'invalid',
      problem: parsed.error.issues.map((issue) => issue.path.join('.') || 'draft').join(', '),
    }
  }
  const draft = parsed.data
  const candidate = await payload.findByID({
    collection: 'candidates',
    id,
    depth: 1,
    disableErrors: true,
  })
  if (!candidate || candidate.kind !== 'job') return { outcome: 'missing' }
  if (!['new', 'triaged'].includes(candidate.status)) return { outcome: 'decided' }
  if (candidate.aiSuggestion) return { outcome: 'has-draft' }
  if (inputHash(draftInput(candidate, institutionOf(candidate))) !== draft.inputHash)
    return { outcome: 'text-changed' }
  const problem = await draftProblem(payload, draft)
  if (problem) return { outcome: 'invalid', problem }
  if (!dryRun) {
    await payload.update({
      collection: 'candidates',
      id,
      data: { aiSuggestion: draft, useAiDraft: true },
      depth: 0,
      context: { aiDraft: true },
    })
  }
  return { outcome: 'applied' }
}

export type ImportResult = {
  dryRun: boolean
  counts: Record<DraftOutcome, number>
  /** Per candidate: what happened (IDs and reasons only). */
  results: Array<{ id: number; outcome: DraftOutcome; problem?: string }>
}

/** Imports the weekly drafts (`IMPORT_FORMAT`). */
export async function importDrafts(
  payload: Payload,
  body: unknown,
  { dryRun = false } = {},
): Promise<ImportResult> {
  const parsed = importSchema.parse(body)
  const counts: Record<DraftOutcome, number> = {
    applied: 0,
    invalid: 0,
    missing: 0,
    decided: 0,
    'has-draft': 0,
    'text-changed': 0,
  }
  const results: ImportResult['results'] = []
  const seen = new Set<number>()
  for (const { id, draft } of parsed.drafts) {
    if (seen.has(id)) continue
    seen.add(id)
    const isClaudeCode = (draft as { by?: unknown } | null)?.by === 'claude-code'
    const result = isClaudeCode
      ? await applyDraft(payload, id, draft, { dryRun })
      : { outcome: 'invalid' as const, problem: 'by must be "claude-code"' }
    counts[result.outcome]++
    results.push({ id, ...result })
  }
  return { dryRun, counts, results }
}
