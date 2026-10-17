import { createHash } from 'node:crypto'

import { redacted } from '@/lib/redaction/redact'
import { storedFacts } from '@/lib/sources/facts'
import type { StoredTagSuggestions } from '@/lib/tags/terms'
import type { Candidate, Institution } from '@/payload-types'

// What an AI draft is written from (PLAN §6.6, D52): a candidate's title and source text with
// names, email addresses and phone numbers replaced (src/lib/redaction/redact.ts, run again here
// on everything that came from the posting, so nothing unredacted can leave the server even if a
// field was stored before redaction existed), the facts a monitor read, the suggested tags and the
// institution's name and place. Never the posting's address, the candidate's notes, a suggestion's
// note or email, or anything about members. The same input serves the weekly Claude Code run
// (src/lib/ai/weekly.ts) and the Claude API (src/lib/ai/claude-api.ts); its hash is kept with the
// draft, and the candidate's source text, deleted 30 days after the decision, is the audit copy
// of what was sent (D34).

export type DraftInput = {
  title: string
  text: string
  institution: {
    name: string
    city: string | null
    country: string | null
    timeZone: string | null
  } | null
  facts: {
    deadline?: { date: string; timeZone: string | null; from: string }
    openEnded?: { value: string; from: string }
    location?: string
    published?: string
  }
  suggestedTags: {
    positionType: string | null
    subfields: string[]
    careerStages: string[]
  }
}

const one = (value: string | null | undefined) => (value ? (redacted(value) ?? '') : '')

/**
 * Scripts without capital letters, where redaction cannot find names (it finds them by their
 * capitals and the words around them, PLAN §6.6): Chinese, Japanese, Korean, Arabic, Hebrew, Thai,
 * the Indic scripts and others.
 */
const CASELESS = new RegExp(
  `[${[
    'Han',
    'Hiragana',
    'Katakana',
    'Hangul',
    'Arabic',
    'Hebrew',
    'Syriac',
    'Thaana',
    'Thai',
    'Lao',
    'Khmer',
    'Myanmar',
    'Tibetan',
    'Devanagari',
    'Bengali',
    'Gurmukhi',
    'Gujarati',
    'Oriya',
    'Tamil',
    'Telugu',
    'Kannada',
    'Malayalam',
    'Sinhala',
    'Ethiopic',
    'Georgian',
  ]
    .map((script) => `\\p{Script=${script}}`)
    .join('')}]`,
  'u',
)

/**
 * Whether redaction cannot vouch for `input`: its title, text or facts are written partly in a
 * script without capital letters, whose names the rules cannot find (M7 notes: Chinese, Japanese
 * and Korean; Arabic, Hebrew, Thai and the Indic scripts alike). Such a candidate is drafted by
 * hand, as §6.6 says for text redaction cannot read, and never sent.
 */
export function cannotRedact(input: DraftInput): boolean {
  return CASELESS.test(
    [
      input.title,
      input.text,
      input.facts.deadline?.from,
      input.facts.openEnded?.from,
      input.facts.location,
    ].join('\n'),
  )
}

/** The input for a draft of `candidate`, at its institution (depth 0 or populated). */
export function draftInput(candidate: Candidate, institution: Institution | null): DraftInput {
  const facts = storedFacts(candidate.extracted)
  const tags = (candidate.tagSuggestions ?? null) as StoredTagSuggestions | null
  // Keys in a fixed order, so the same input always gives the same hash.
  return {
    title: one(candidate.rawTitle),
    text: one(candidate.snippet),
    institution: institution
      ? {
          name: institution.name,
          city: institution.city ?? null,
          country:
            typeof institution.country === 'string'
              ? institution.country
              : (institution.country?.id ?? null),
          timeZone: institution.timeZone ?? null,
        }
      : null,
    facts: {
      ...(facts?.deadline
        ? {
            deadline: {
              date: facts.deadline.value.date,
              timeZone: facts.deadline.value.timeZone,
              from: one(facts.deadline.from),
            },
          }
        : {}),
      ...(facts?.openEnded
        ? { openEnded: { value: facts.openEnded.value, from: one(facts.openEnded.from) } }
        : {}),
      ...(facts?.location ? { location: one(facts.location.value) } : {}),
      ...(facts?.published ? { published: facts.published.value } : {}),
    },
    suggestedTags: {
      positionType: tags?.positionType?.slug ?? null,
      subfields: (tags?.subfields ?? []).map((tag) => tag.slug),
      careerStages: (tags?.careerStages ?? []).map((tag) => tag.slug),
    },
  }
}

/** SHA-256 of the input as sent: the draft names it, so it is known what it was written from. */
export function inputHash(input: DraftInput): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}
