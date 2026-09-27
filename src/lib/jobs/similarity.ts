import { foldAccents } from '@/lib/slug'

import type { DeadlineKind } from './deadline'

// Finding the same position entered twice (PLAN §6.3): the same canonical address, or the same
// institution and deadline with nearly the same title. Titles are compared by trigram similarity,
// computed as PostgreSQL's pg_trgm extension does, so the threshold means the same here and in
// any later database query.

/** Titles at least this similar count as the same position (PLAN §6.3). */
export const DUPLICATE_SIMILARITY = 0.8

/**
 * A title reduced for comparison: lower case in every locale (the Turkish İ and ı become i),
 * accents removed, punctuation turned into spaces and spaces collapsed.
 */
export function normaliseTitle(title: string): string {
  return foldAccents(title)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * The trigrams of a text as pg_trgm forms them: each word (a run of letters and digits) in lower
 * case, padded with two spaces in front and one behind, cut into every run of three characters;
 * each trigram counted once.
 */
export function trigrams(text: string): Set<string> {
  const result = new Set<string>()
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (word === '') continue
    const chars = Array.from(`  ${word} `)
    for (let i = 0; i + 3 <= chars.length; i++) result.add(chars.slice(i, i + 3).join(''))
  }
  return result
}

/** pg_trgm's `similarity()`: shared trigrams divided by all distinct trigrams of both texts. */
export function similarity(a: string, b: string): number {
  const first = trigrams(a)
  const second = trigrams(b)
  if (first.size === 0 || second.size === 0) return 0
  let shared = 0
  for (const trigram of first) if (second.has(trigram)) shared++
  return shared / (first.size + second.size - shared)
}

/** What two listings are compared on. */
export type DedupeFacts = {
  canonicalUrl?: string | null
  institution?: number | string | null
  deadlineKind?: DeadlineKind | null
  /** The calendar day of a fixed deadline, YYYY-MM-DD. */
  deadlineDay?: string | null
  /** `normaliseTitle` of the title. */
  fingerprint?: string | null
}

const sameDeadline = (a: DedupeFacts, b: DedupeFacts) =>
  a.deadlineKind != null &&
  a.deadlineKind === b.deadlineKind &&
  (a.deadlineKind !== 'fixed' || (a.deadlineDay != null && a.deadlineDay === b.deadlineDay))

/**
 * Why two listings are probably the same position, or null: the same canonical address, or the
 * same institution and deadline (the same day, or both rolling, or both until filled) with titles
 * at least 0.8 similar.
 */
export function duplicateReason(
  a: DedupeFacts,
  b: DedupeFacts,
): 'same-address' | 'similar-title' | null {
  if (a.canonicalUrl && a.canonicalUrl === b.canonicalUrl) return 'same-address'
  if (a.institution == null || String(a.institution) !== String(b.institution ?? '')) return null
  if (!sameDeadline(a, b)) return null
  return similarity(a.fingerprint ?? '', b.fingerprint ?? '') >= DUPLICATE_SIMILARITY
    ? 'similar-title'
    : null
}

export const likelyDuplicate = (a: DedupeFacts, b: DedupeFacts) => duplicateReason(a, b) !== null
