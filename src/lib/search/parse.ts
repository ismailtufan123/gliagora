import { QUERY_MAX_LENGTH } from '@/lib/filters/jobs'
import { normaliseText } from '@/lib/filters/model'

// What a search reads from the words people type (PLAN §3.2). Folding (case, Turkish İ/ı,
// accents) happens in the database, with the same functions as the indexes (src/lib/search/sql.ts),
// so the query and the stored text are folded alike. The words are read from the query as the
// database folds it (database.ts asks for that first), which is exactly the text that
// websearch_to_tsquery reads: folding removes combining marks and turns typographic dashes and
// quotes into "-" and '"', so the rules below see what the full-text search sees. Pure, so every
// rule is unit-tested.

/** At most this many characters, as for the `q` filter of the lists (PLAN §2.4). */
export const SEARCH_MAX_LENGTH = QUERY_MAX_LENGTH

/**
 * Institutions and subfields are matched by at most this many words. Positions need every word
 * (websearch_to_tsquery), so they are found by all of them.
 */
export const MAX_WORDS = 8

/**
 * Institutions are matched through a trigram index, which needs a word of at least three letters
 * or digits: without one, the search would read all 140,000 names.
 */
export const MIN_INDEXED_WORD = 3

/** The last word also finds longer words from this many letters on ("astro" → "astrocyte"). */
export const MIN_PREFIX = 3

export type Search = {
  /**
   * The query, trimmed, with runs of white space as one space and at most 100 characters. The
   * full-text search reads it as web search syntax (websearch_to_tsquery): "quotes" for a phrase,
   * a minus sign to leave a word or a phrase out, `or` between alternatives. Never part of the
   * SQL text.
   */
  text: string
  /** Whether the last word also matches words that start with it. */
  prefix: boolean
  /**
   * For the institution and subfield matches (each word must start a word of the name): the
   * folded words that are not left out, without a word that starts another one (it would add
   * nothing, and each word costs a pass over every name the index finds), at most MAX_WORDS.
   */
  words: string[]
  /**
   * Every folded word that is not left out, uncapped, to find positions by their institution's
   * name: websearch_to_tsquery needs every word, the ninth as much as the first.
   */
  allWords: string[]
}

// Words as PostgreSQL's parser splits them: letters (with their marks) and decimal digits; number
// signs such as ① or ¹ separate words.
const LETTERS = /[\p{L}\p{M}\p{Nd}]+/gu
const HAS_LETTER = /[\p{L}\p{N}]/u

/** What the indexes can use: letters and decimal digits; combining marks count for nothing. */
const INDEXED = /[\p{L}\p{Nd}]/gu
const indexedLength = (word: string) => word.match(INDEXED)?.length ?? 0

/** The query as the search page shows it and keeps in its address. */
export const normaliseQuery = (raw: string) =>
  normaliseText(raw.normalize('NFC'), SEARCH_MAX_LENGTH)

/**
 * The query to search for, or null when it has no letter or digit (an empty query, or only
 * punctuation or symbols): such a query shows the page's hints and matches no position, without
 * asking the database.
 */
export function searchText(raw: string): string | null {
  const text = normaliseQuery(raw)
  return HAS_LETTER.test(text) ? text : null
}

type Term = { text: string; quoted: boolean; negated: boolean }

// websearch_to_tsquery's syntax (PostgreSQL's tsquery.c): operator characters are skipped between
// terms and end a word, as do spaces and quotes; a colon ends a word too, but may start one.
const OPERATOR = /[!&|()<]/u
const SPACE = /\s/u
const ENDS_WORD = /[\s"!&|()<:]/u
const WORD_CHAR = /[\p{L}\p{Nd}_-]/u

/**
 * The folded query's terms as websearch_to_tsquery reads them, with its states: a phrase in double
 * quotes (to the next quote, or the end) or a word, each left out when a minus sign comes before it
 * (two signs cancel out). After a term, `or` is web search's OR when no letter, digit, "-" or "_"
 * follows it and something other than a space comes later (parse_or_operator); it is then no term.
 */
function terms(folded: string): Term[] {
  const chars = Array.from(folded)
  const found: Term[] = []
  let afterTerm = false
  let negated = false
  let i = 0
  while (i < chars.length) {
    const c = chars[i]!
    if (afterTerm) {
      if (
        chars[i]?.toLowerCase() === 'o' &&
        chars[i + 1]?.toLowerCase() === 'r' &&
        chars[i + 2] !== undefined &&
        !WORD_CHAR.test(chars[i + 2]!) &&
        chars.slice(i + 3).some((next) => !SPACE.test(next))
      ) {
        i += 2
        afterTerm = false
      } else if (OPERATOR.test(c) || SPACE.test(c)) i++
      // Anything else starts the next term (an implicit AND).
      else afterTerm = false
    } else if (c === '-') {
      negated = !negated
      i++
    } else if (OPERATOR.test(c) || SPACE.test(c)) {
      i++
    } else {
      let end: number
      if (c === '"') {
        end = chars.indexOf('"', i + 1)
        if (end === -1) end = chars.length
        found.push({ text: chars.slice(i + 1, end).join(''), quoted: true, negated })
        end++
      } else {
        end = i + 1
        while (end < chars.length && !ENDS_WORD.test(chars[end]!)) end++
        found.push({ text: chars.slice(i, end).join(''), quoted: false, negated })
      }
      negated = false
      afterTerm = true
      i = end
    }
  }
  return found
}

/**
 * What to search for: `text` from searchText, and `folded` the database's fold of it (foldSql in
 * sql.ts). Null when folding leaves no letter or digit (a query of combining marks only).
 */
export function readSearch(text: string, folded: string): Search | null {
  if (!HAS_LETTER.test(folded)) return null
  const all = terms(folded)

  const words = new Set<string>()
  for (const term of all) {
    if (term.negated) continue
    for (const run of term.text.match(LETTERS) ?? []) {
      // A word the indexes cannot use (only marks) would match every name.
      if (indexedLength(run) > 0) words.add(run)
    }
  }
  const allWords = [...words]

  const final = all.at(-1)
  const finalRun = final?.text.match(LETTERS)?.at(-1) ?? ''
  const prefix =
    // Not a phrase, and not left out.
    !!final && !final.quoted && !final.negated && indexedLength(finalRun) >= MIN_PREFIX

  return {
    text,
    prefix,
    // "uni univ university": each word must start a word of the name, so "university" is enough.
    words: allWords
      .filter((word) => !allWords.some((other) => other !== word && other.startsWith(word)))
      .slice(0, MAX_WORDS),
    allWords,
  }
}

/** Whether the words can use the institutions' trigram index (one of three letters or more). */
export const canMatchInstitutions = (search: Search) =>
  search.words.some((word) => indexedLength(word) >= MIN_INDEXED_WORD)
