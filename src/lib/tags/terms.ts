import type { Payload } from 'payload'

import type { Vocabulary } from '@/lib/taxonomy'

import { type CompiledTerms, type TermWords, compileTerms } from './match'
import { type Suggestion, type TagSuggestions, suggestTags } from './suggest'

// The taxonomy's words for the tag suggester, read from the terms collection: the active terms of
// the vocabularies a job is tagged with, with their English labels and synonyms. Kept for five
// minutes, since terms change rarely and a monitor run tags many postings.

const VOCABULARIES: Vocabulary[] = [
  'subfield',
  'method',
  'model-system',
  'position-type',
  'career-stage',
]

const KEEP_MS = 5 * 60_000

export type Taxonomy = {
  compiled: CompiledTerms
  /** A term's ID and label by its vocabulary and slug ("subfield/glia"). */
  byKey: Map<string, { id: number; label: string }>
}

let cached: { at: number; taxonomy: Taxonomy } | null = null

export const termKey = (vocabulary: Vocabulary, slug: string) => `${vocabulary}/${slug}`

/** The active terms' words, from the database (or the last five minutes' copy). */
export async function loadTaxonomy(payload: Payload, now = Date.now()): Promise<Taxonomy> {
  if (cached && now - cached.at < KEEP_MS) return cached.taxonomy
  const { docs } = await payload.find({
    collection: 'terms',
    where: { and: [{ vocabulary: { in: VOCABULARIES } }, { isActive: { equals: true } }] },
    select: { vocabulary: true, slug: true, label: true, synonyms: true },
    locale: 'en',
    depth: 0,
    limit: 1000,
    pagination: false,
  })
  const words: TermWords[] = []
  const byKey = new Map<string, { id: number; label: string }>()
  for (const doc of docs) {
    if (!doc.slug || !doc.vocabulary || !doc.label) continue
    const vocabulary = doc.vocabulary as Vocabulary
    words.push({ slug: doc.slug, vocabulary, label: doc.label, synonyms: doc.synonyms ?? [] })
    byKey.set(termKey(vocabulary, doc.slug), { id: Number(doc.id), label: doc.label })
  }
  const taxonomy = { compiled: compileTerms(words), byKey }
  cached = { at: now, taxonomy }
  return taxonomy
}

/** Forgets the copy (tests, and after the taxonomy changed). */
export function forgetTaxonomy(): void {
  cached = null
}

/** A suggestion as stored on a candidate: with the term's label, for the editor. */
export type StoredSuggestion = { slug: string; label: string; words: string[] }

/** The suggestions as stored in a candidate's `tagSuggestions`. */
export type StoredTagSuggestions = {
  subfields: StoredSuggestion[]
  methods: StoredSuggestion[]
  modelSystems: StoredSuggestion[]
  positionType: StoredSuggestion | null
  careerStages: StoredSuggestion[]
}

/** The tag suggestions for a posting, with the terms' labels. */
export function storedSuggestions(
  { title, text }: { title: string; text: string },
  taxonomy: Taxonomy,
): StoredTagSuggestions {
  const tags: TagSuggestions = suggestTags({ title, text }, taxonomy.compiled)
  const label =
    (vocabulary: Vocabulary) =>
    (suggestion: Suggestion): StoredSuggestion => ({
      slug: suggestion.slug,
      label: taxonomy.byKey.get(termKey(vocabulary, suggestion.slug))?.label ?? suggestion.slug,
      words: suggestion.words,
    })
  return {
    subfields: tags.subfields.map(label('subfield')),
    methods: tags.methods.map(label('method')),
    modelSystems: tags.modelSystems.map(label('model-system')),
    positionType: tags.positionType ? label('position-type')(tags.positionType) : null,
    careerStages: tags.careerStages.map(label('career-stage')),
  }
}
