import type { Vocabulary } from '@/lib/taxonomy'

// Finding the taxonomy's words in a posting (PLAN §6.3, "tag suggestions without AI"; the M3
// notes): each term's label and synonyms, as whole words. A synonym with two or more capital
// letters ("LTP", "fMRI", "C57BL/6", "PhD") is matched case-sensitively, so that "als" or "ltp"
// in ordinary words never count; the others case-insensitively and without accents, with or
// without a plural "s". Within a vocabulary the longest match wins where two overlap
// ("cognitive neuroscience" over "neuroscience"). Everything here runs locally: no external calls.

/** A term as the matcher needs it. */
export type TermWords = {
  slug: string
  vocabulary: Vocabulary
  label: string
  synonyms: readonly string[]
}

type Pattern = {
  slug: string
  vocabulary: Vocabulary
  regexp: RegExp
  exact: boolean
  label: boolean
}

/** The terms, prepared once for many texts. */
export type CompiledTerms = { terms: readonly TermWords[]; patterns: readonly Pattern[] }

/** One place where a term's word was found. */
export type TermMatch = {
  slug: string
  vocabulary: Vocabulary
  /** The words as written in the text. */
  words: string
  start: number
  end: number
  /** Whether it was the term's label (not one of its synonyms). */
  label: boolean
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

const capitals = (value: string) => (value.match(/\p{Lu}/gu) ?? []).length

/**
 * The text folded for case-insensitive matching, one character for one, so positions agree with
 * the text as written: lower case without accents ("Ç" → "c", "İ" → "i").
 */
export function fold(text: string): string {
  let result = ''
  for (const char of text) {
    const base = char.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    // Keep the length: a character whose folded form is longer or shorter (a ligature) stays.
    result += base.length === char.length ? base : char
  }
  return result
}

function patternFor(words: string): { source: string; exact: boolean } | null {
  const trimmed = words.trim()
  if (trimmed.length < 2) return null
  const exact = capitals(trimmed) >= 2
  const text = exact ? trimmed : fold(trimmed)
  // A space or a hyphen in a synonym matches either ("decision-making", "decision making").
  let source = text
    .split(/[\s-]+/)
    .map(escape)
    .join(String.raw`[\s‐-–-]+`)
  if (!exact && /\p{L}$/u.test(text)) {
    source =
      text.endsWith('s') && text.length > 4 ? `${source.slice(0, -1)}s?` : `${source}(?:s|es)?`
  }
  return { source: String.raw`(?<![\p{L}\p{N}])${source}(?![\p{L}\p{N}])`, exact }
}

/** Prepares the terms' words for `findMatches`. */
export function compileTerms(terms: readonly TermWords[]): CompiledTerms {
  const patterns: Pattern[] = []
  for (const term of terms) {
    const seen = new Set<string>()
    for (const [index, words] of [term.label, ...term.synonyms].entries()) {
      const built = patternFor(words)
      if (!built || seen.has(built.source)) continue
      seen.add(built.source)
      patterns.push({
        slug: term.slug,
        vocabulary: term.vocabulary,
        regexp: new RegExp(built.source, 'gu'),
        exact: built.exact,
        label: index === 0,
      })
    }
  }
  return { terms, patterns }
}

/**
 * Every place in `text` where a term's word stands, without overlaps inside a vocabulary (the
 * longest wins, then the first), in the order of the text.
 */
export function findMatches(text: string, compiled: CompiledTerms): TermMatch[] {
  const folded = fold(text)
  const found = new Map<Vocabulary, TermMatch[]>()
  for (const pattern of compiled.patterns) {
    pattern.regexp.lastIndex = 0
    for (const match of (pattern.exact ? text : folded).matchAll(pattern.regexp)) {
      const list = found.get(pattern.vocabulary) ?? []
      list.push({
        slug: pattern.slug,
        vocabulary: pattern.vocabulary,
        words: text.slice(match.index, match.index + match[0].length),
        start: match.index,
        end: match.index + match[0].length,
        label: pattern.label,
      })
      found.set(pattern.vocabulary, list)
    }
  }
  const kept: TermMatch[] = []
  for (const list of found.values()) {
    const taken: TermMatch[] = []
    for (const match of [...list].sort(
      (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
    )) {
      if (taken.some((other) => match.start < other.end && other.start < match.end)) continue
      taken.push(match)
    }
    kept.push(...taken)
  }
  return kept.sort((a, b) => a.start - b.start || a.vocabulary.localeCompare(b.vocabulary))
}
