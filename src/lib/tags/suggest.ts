import { type CompiledTerms, type TermMatch, findMatches } from './match'

// The local tag suggester (PLAN §6.3): from a posting's title and text it proposes subfields,
// methods, model systems, a position type and career stages, by the taxonomy's words (match.ts).
// The editor sees them as suggestions on the candidate, and an accepted candidate's draft job
// starts with them; nothing is decided here.

export type Suggestion = {
  slug: string
  /** The words of the posting that matched, as written (at most three). */
  words: string[]
  /** A match in the title counts 3, one in the text 1 (at most 5 per term). */
  score: number
}

export type TagSuggestions = {
  subfields: Suggestion[]
  methods: Suggestion[]
  modelSystems: Suggestion[]
  positionType: Suggestion | null
  careerStages: Suggestion[]
}

/** How many of each are proposed, best first. */
const LIMITS = { subfield: 3, method: 4, 'model-system': 3, 'career-stage': 2 } as const

const TITLE_WEIGHT = 3
const TEXT_MATCHES_COUNTED = 5

/** The career stage that goes with a position type when the posting names none. */
const STAGE_OF_TYPE: Record<string, string[]> = {
  msc: ['student'],
  phd: ['phd-candidate'],
  postdoc: ['early-postdoc', 'postdoc'],
  'research-staff': ['research-staff'],
  'faculty-pi': ['independent'],
  industry: ['industry-professional'],
}

function score(
  title: readonly TermMatch[],
  text: readonly TermMatch[],
  vocabulary: TermMatch['vocabulary'],
): Suggestion[] {
  const bySlug = new Map<string, { title: number; text: number; words: string[] }>()
  const add = (match: TermMatch, where: 'title' | 'text') => {
    if (match.vocabulary !== vocabulary) return
    const entry = bySlug.get(match.slug) ?? { title: 0, text: 0, words: [] }
    entry[where]++
    if (
      entry.words.length < 3 &&
      !entry.words.some((w) => w.toLowerCase() === match.words.toLowerCase())
    ) {
      entry.words.push(match.words)
    }
    bySlug.set(match.slug, entry)
  }
  for (const match of title) add(match, 'title')
  for (const match of text) add(match, 'text')
  return [...bySlug.entries()]
    .map(([slug, entry]) => ({
      slug,
      words: entry.words,
      score: entry.title * TITLE_WEIGHT + Math.min(entry.text, TEXT_MATCHES_COUNTED),
    }))
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
}

/** The suggestions for a posting with this title and text. */
export function suggestTags(
  { title, text }: { title: string; text: string },
  compiled: CompiledTerms,
): TagSuggestions {
  const inTitle = findMatches(title, compiled)
  const inText = findMatches(text, compiled)

  // A position's type is in its title ("PhD position", "Postdoctoral researcher"); in the text
  // the bare labels mostly name what applicants need ("a PhD in neuroscience"), so only synonyms
  // count there, and only when the title names none.
  const typeInTitle = score(inTitle, [], 'position-type')
  const positionType =
    typeInTitle[0] ??
    score(
      [],
      inText.filter((match) => !match.label),
      'position-type',
    )[0] ??
    null

  let careerStages = score(inTitle, inText, 'career-stage').slice(0, LIMITS['career-stage'])
  if (careerStages.length === 0 && positionType) {
    careerStages = (STAGE_OF_TYPE[positionType.slug] ?? []).map((slug) => ({
      slug,
      words: positionType.words,
      score: 0,
    }))
  }

  return {
    subfields: score(inTitle, inText, 'subfield').slice(0, LIMITS.subfield),
    methods: score(inTitle, inText, 'method').slice(0, LIMITS.method),
    modelSystems: score(inTitle, inText, 'model-system').slice(0, LIMITS['model-system']),
    positionType,
    careerStages,
  }
}

/** Whether there is nothing to suggest. */
export function noSuggestions(tags: TagSuggestions): boolean {
  return (
    tags.subfields.length === 0 &&
    tags.methods.length === 0 &&
    tags.modelSystems.length === 0 &&
    tags.positionType === null &&
    tags.careerStages.length === 0
  )
}
