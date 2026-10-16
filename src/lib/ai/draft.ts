import { z } from 'zod'

import { DEADLINE_KINDS } from '@/lib/jobs/deadline'
import { TIME_ZONES } from '@/lib/jobs/time-zones'

// An AI draft of a candidate (PLAN §6.6, D52): what Claude wrote from the candidate's redacted
// title and source text, kept in the candidate's `aiSuggestion` for the editor. It never reaches
// the public site by itself: an accepted candidate's draft job starts from it, and the editor
// checks every fact on the original posting and rewrites what needs it before publishing. Both
// ways in write this shape: the weekly run by Claude Code and the Claude API (off until a key and a
// monthly cap are set).

/** The longest summary a job takes (PLAN §5.1, §6.4). */
export const SUMMARY_MAX = 280

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const from = z.string().trim().min(1).max(300)
const zones: ReadonlySet<string> = new Set(TIME_ZONES)

export const aiDraftSchema = z.strictObject({
  version: z.literal(1),
  /** Which way it came in. */
  by: z.enum(['claude-code', 'claude-api']),
  model: z.string().trim().min(1).max(100).optional(),
  /** When it was written. */
  at: z.iso.datetime(),
  /** What it was written from, in words: "the redacted title and text exported on …". */
  from,
  /** SHA-256 of the exported input it was written from (src/lib/ai/input.ts). */
  inputHash: z.string().regex(/^[0-9a-f]{64}$/),
  /** In our own words, at most 280 characters. */
  summary: z.string().trim().min(1).max(SUMMARY_MAX),
  positionType: slug.nullable(),
  careerStages: z.array(slug).max(4),
  subfields: z.array(slug).max(4),
  deadline: z
    .strictObject({
      kind: z.enum(DEADLINE_KINDS.map(({ value }) => value) as [string, ...string[]]),
      /** The day, for a fixed deadline. */
      date: z.iso.date().nullable(),
      /** The time zone the posting names, or null when it names none. */
      timeZone: z
        .string()
        .refine((zone) => zones.has(zone), 'Not a time zone of the list')
        .nullable(),
      from,
    })
    .refine((deadline) => (deadline.kind === 'fixed') === (deadline.date !== null), {
      message: 'A fixed deadline has a day; a rolling or open one has none.',
    })
    .nullable(),
  place: z
    .strictObject({
      city: z.string().trim().min(1).max(100).nullable(),
      country: z
        .string()
        .regex(/^[A-Z]{2}$/)
        .nullable(),
      from,
    })
    .nullable(),
  /** Anything the editor should know: an unclear deadline, a second institution. */
  note: z.string().trim().max(500).optional(),
})

export type AiDraft = z.infer<typeof aiDraftSchema>

/** The draft stored on a candidate, or null when it is missing or not a draft of this shape. */
export function storedDraft(value: unknown): AiDraft | null {
  const parsed = aiDraftSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
